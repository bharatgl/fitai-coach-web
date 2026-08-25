import { randomUUID } from "node:crypto";
import { generateCoachResponse } from "@fitai/ai";
import type {
  CoachMessage,
  CoachResponse,
  CoachThread,
  CoachThreadDetail,
  CoachThreadListResponse,
  CreateCoachThreadResponse,
} from "@fitai/contracts";
import type { FastifyInstance } from "fastify";
import type { Db } from "mongodb";
import { MongoServerError } from "mongodb";
import { z } from "zod";
import { authenticate, type AuthenticatedUser } from "../auth.js";
import { getConfig } from "../config.js";
import { getDatabase } from "../db.js";
import { syncAuthenticatedUser } from "../users.js";

type CoachThreadDocument = {
  id: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  lastMessageAt: Date | null;
  messageCount: number;
  legacyUserId?: string;
};

type CoachMessageDocument = {
  id: string;
  userId: string;
  threadId?: string | null;
  sessionId: string | null;
  role: "user" | "assistant";
  content: string;
  safetyCategory: "none" | "pain" | "medical" | "emergency";
  model?: string | null;
  createdAt: Date;
  editedAt?: Date | null;
};

const coachInput = z.object({
  message: z.string().trim().min(1).max(2_000),
  threadId: z.string().uuid().optional(),
  sessionId: z.string().trim().min(1).max(100).optional(),
});
const createThreadInput = z.object({
  title: z.string().trim().min(1).max(80).optional(),
});
const renameThreadInput = z.object({
  title: z.string().trim().min(1).max(80),
});
const editMessageInput = z.object({
  content: z.string().trim().min(1).max(2_000),
});
const threadParams = z.object({ threadId: z.string().uuid() });
const messageParams = z.object({ messageId: z.string().uuid() });

function notFound(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 404 });
}

function serializeThread(thread: CoachThreadDocument): CoachThread {
  return {
    id: thread.id,
    title: thread.title,
    createdAt: thread.createdAt.toISOString(),
    updatedAt: thread.updatedAt.toISOString(),
    lastMessageAt: thread.lastMessageAt?.toISOString() ?? null,
    messageCount: thread.messageCount,
  };
}

function serializeMessage(message: CoachMessageDocument): CoachMessage {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    safetyCategory: message.safetyCategory,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
  };
}

function createThreadDocument(
  userId: string,
  title = "New conversation",
): CoachThreadDocument {
  const now = new Date();
  return {
    id: randomUUID(),
    userId,
    title,
    createdAt: now,
    updatedAt: now,
    lastMessageAt: null,
    messageCount: 0,
  };
}

function titleFromMessage(message: string) {
  const normalized = message.replace(/\s+/g, " ").trim();
  return normalized.length > 52 ? `${normalized.slice(0, 49)}…` : normalized;
}

async function requireThread(
  database: Db,
  userId: string,
  threadId: string,
): Promise<CoachThreadDocument> {
  const thread = await database
    .collection<CoachThreadDocument>("coachThreads")
    .findOne({ id: threadId, userId }, { projection: { _id: 0 } });
  if (!thread) notFound("Conversation not found");
  return thread;
}

async function updateThreadStats(database: Db, userId: string, threadId: string) {
  const messages = database.collection<CoachMessageDocument>("coachMessages");
  const [messageCount, latest] = await Promise.all([
    messages.countDocuments({ userId, threadId }),
    messages.findOne(
      { userId, threadId },
      { projection: { _id: 0, createdAt: 1 }, sort: { createdAt: -1 } },
    ),
  ]);
  const now = new Date();
  await database.collection<CoachThreadDocument>("coachThreads").updateOne(
    { id: threadId, userId },
    {
      $set: {
        messageCount,
        lastMessageAt: latest?.createdAt ?? null,
        updatedAt: latest?.createdAt ?? now,
      },
    },
  );
  return requireThread(database, userId, threadId);
}

async function loadThreadDetail(
  database: Db,
  userId: string,
  threadId: string,
): Promise<CoachThreadDetail> {
  const thread = await requireThread(database, userId, threadId);
  const messages = await database
    .collection<CoachMessageDocument>("coachMessages")
    .find({ userId, threadId }, { projection: { _id: 0 } })
    .sort({ createdAt: 1 })
    .limit(200)
    .toArray();
  return {
    thread: serializeThread(thread),
    messages: messages.map(serializeMessage),
  };
}

async function migrateLegacyMessages(database: Db, userId: string) {
  const messages = database.collection<CoachMessageDocument>("coachMessages");
  const legacyCount = await messages.countDocuments({
    userId,
    $or: [{ threadId: { $exists: false } }, { threadId: null }],
  });
  if (!legacyCount) return;

  const threads = database.collection<CoachThreadDocument>("coachThreads");
  const existingThread = await threads.findOne(
    { legacyUserId: userId },
    { projection: { _id: 0 } },
  );
  let thread: CoachThreadDocument;
  if (existingThread) {
    thread = existingThread;
  } else {
    const legacyThread: CoachThreadDocument = {
      ...createThreadDocument(userId, "Previous conversation"),
      legacyUserId: userId,
    };
    try {
      await threads.insertOne(legacyThread);
      thread = legacyThread;
    } catch (error) {
      if (!(error instanceof MongoServerError) || error.code !== 11000) throw error;
      const concurrentThread = await threads.findOne(
        { legacyUserId: userId },
        { projection: { _id: 0 } },
      );
      if (!concurrentThread) throw error;
      thread = concurrentThread;
    }
  }

  await messages.updateMany(
    { userId, $or: [{ threadId: { $exists: false } }, { threadId: null }] },
    { $set: { threadId: thread.id } },
  );
  await updateThreadStats(database, userId, thread.id);
}

async function generateReply(
  database: Db,
  user: AuthenticatedUser,
  threadId: string,
  message: string,
  before: Date,
) {
  const config = getConfig();
  const [profile, history] = await Promise.all([
    database
      .collection("profiles")
      .findOne({ userId: user.id }, { projection: { _id: 0 } }),
    database
      .collection<CoachMessageDocument>("coachMessages")
      .find(
        { userId: user.id, threadId, createdAt: { $lt: before } },
        { projection: { _id: 0 } },
      )
      .sort({ createdAt: -1 })
      .limit(12)
      .toArray(),
  ]);
  return generateCoachResponse({
    apiKey: config.GEMINI_API_KEY,
    model: config.GEMINI_MODEL,
    profile,
    message,
    history: history.reverse().map((item) => ({
      role: item.role,
      content: item.content,
    })),
  });
}

export async function coachRoutes(app: FastifyInstance) {
  app.get("/v1/coach/threads", async (request): Promise<CoachThreadListResponse> => {
    const user = await authenticate(request);
    await syncAuthenticatedUser(user);
    const database = await getDatabase();
    await migrateLegacyMessages(database, user.id);
    const threads = await database
      .collection<CoachThreadDocument>("coachThreads")
      .find({ userId: user.id }, { projection: { _id: 0 } })
      .sort({ updatedAt: -1 })
      .limit(100)
      .toArray();
    return { threads: threads.map(serializeThread) };
  });

  app.post("/v1/coach/threads", async (request): Promise<CreateCoachThreadResponse> => {
    const user = await authenticate(request);
    const input = createThreadInput.parse(request.body ?? {});
    await syncAuthenticatedUser(user);
    const database = await getDatabase();
    const thread = createThreadDocument(user.id, input.title);
    await database.collection<CoachThreadDocument>("coachThreads").insertOne(thread);
    return { thread: serializeThread(thread) };
  });

  app.get("/v1/coach/threads/:threadId", async (request): Promise<CoachThreadDetail> => {
    const user = await authenticate(request);
    const { threadId } = threadParams.parse(request.params);
    return loadThreadDetail(await getDatabase(), user.id, threadId);
  });

  app.patch("/v1/coach/threads/:threadId", async (request): Promise<CreateCoachThreadResponse> => {
    const user = await authenticate(request);
    const { threadId } = threadParams.parse(request.params);
    const { title } = renameThreadInput.parse(request.body);
    const database = await getDatabase();
    await requireThread(database, user.id, threadId);
    const updatedAt = new Date();
    await database
      .collection<CoachThreadDocument>("coachThreads")
      .updateOne({ id: threadId, userId: user.id }, { $set: { title, updatedAt } });
    return { thread: serializeThread(await requireThread(database, user.id, threadId)) };
  });

  app.delete("/v1/coach/threads/:threadId", async (request, reply) => {
    const user = await authenticate(request);
    const { threadId } = threadParams.parse(request.params);
    const database = await getDatabase();
    await requireThread(database, user.id, threadId);
    await Promise.all([
      database
        .collection<CoachMessageDocument>("coachMessages")
        .deleteMany({ userId: user.id, threadId }),
      database
        .collection<CoachThreadDocument>("coachThreads")
        .deleteOne({ id: threadId, userId: user.id }),
    ]);
    return reply.code(204).send();
  });

  app.post(
    "/v1/coach/messages",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request): Promise<CoachResponse> => {
      const user = await authenticate(request);
      const input = coachInput.parse(request.body);
      await syncAuthenticatedUser(user);
      const database = await getDatabase();
      const thread = input.threadId
        ? await requireThread(database, user.id, input.threadId)
        : createThreadDocument(user.id);
      if (!input.threadId) {
        await database.collection<CoachThreadDocument>("coachThreads").insertOne(thread);
      }

      const now = new Date();
      const userMessage: CoachMessageDocument = {
        id: randomUUID(),
        userId: user.id,
        threadId: thread.id,
        sessionId: input.sessionId ?? null,
        role: "user",
        content: input.message,
        safetyCategory: "none",
        createdAt: now,
        editedAt: null,
      };
      await database.collection<CoachMessageDocument>("coachMessages").insertOne(userMessage);

      if (thread.messageCount === 0 && thread.title === "New conversation") {
        await database
          .collection<CoachThreadDocument>("coachThreads")
          .updateOne(
            { id: thread.id, userId: user.id },
            { $set: { title: titleFromMessage(input.message) } },
          );
      }
      await updateThreadStats(database, user.id, thread.id);

      const result = await generateReply(
        database,
        user,
        thread.id,
        input.message,
        now,
      );
      const assistantMessage: CoachMessageDocument = {
        id: randomUUID(),
        userId: user.id,
        threadId: thread.id,
        sessionId: input.sessionId ?? null,
        role: "assistant",
        content: result.reply,
        safetyCategory: result.safetyCategory,
        model: result.model,
        createdAt: new Date(),
      };
      await database
        .collection<CoachMessageDocument>("coachMessages")
        .insertOne(assistantMessage);

      const updatedThread = await updateThreadStats(database, user.id, thread.id);
      return {
        thread: serializeThread(updatedThread),
        userMessage: serializeMessage(userMessage),
        message: serializeMessage(assistantMessage),
        shouldPauseWorkout: result.shouldPauseWorkout,
        suggestedAdjustment: result.suggestedAdjustment,
      };
    },
  );

  app.patch(
    "/v1/coach/messages/:messageId",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request): Promise<CoachThreadDetail> => {
      const user = await authenticate(request);
      const { messageId } = messageParams.parse(request.params);
      const { content } = editMessageInput.parse(request.body);
      const database = await getDatabase();
      const messages = database.collection<CoachMessageDocument>("coachMessages");
      const existing = await messages.findOne(
        { id: messageId, userId: user.id, role: "user" },
        { projection: { _id: 0 } },
      );
      if (!existing?.threadId) notFound("Editable message not found");
      const threadId = existing.threadId;
      await requireThread(database, user.id, threadId);

      await messages.deleteMany({
        userId: user.id,
        threadId,
        createdAt: { $gt: existing.createdAt },
      });
      const editedAt = new Date();
      await messages.updateOne(
        { id: messageId, userId: user.id },
        { $set: { content, editedAt } },
      );
      await updateThreadStats(database, user.id, threadId);
      const result = await generateReply(
        database,
        user,
        threadId,
        content,
        existing.createdAt,
      );
      await messages.insertOne({
        id: randomUUID(),
        userId: user.id,
        threadId,
        sessionId: existing.sessionId,
        role: "assistant",
        content: result.reply,
        safetyCategory: result.safetyCategory,
        model: result.model,
        createdAt: new Date(),
      });
      await updateThreadStats(database, user.id, threadId);
      return loadThreadDetail(database, user.id, threadId);
    },
  );
}
