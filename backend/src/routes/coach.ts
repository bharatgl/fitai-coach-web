import { randomUUID } from "node:crypto";
import {
  classifySafetyMessage,
  createLiveCoachToken,
  generateCoachResponse,
} from "@fitai/ai";
import type {
  CoachAttachment,
  CoachMessage,
  CoachResponse,
  CoachThread,
  CoachThreadDetail,
  CoachThreadListResponse,
  CreateCoachThreadResponse,
  LiveCoachSnapshotResponse,
  LiveCoachTokenResponse,
  UploadCoachAttachmentResponse,
} from "@fitai/contracts";
import type { FastifyInstance } from "fastify";
import type { Db, Filter } from "mongodb";
import { Binary, MongoServerError } from "mongodb";
import { z } from "zod";
import { authenticate, type AuthenticatedUser } from "../auth.js";
import { getConfig } from "../config.js";
import { getDatabase } from "../db.js";
import {
  buildCoachProfileContext,
  buildCoachTrainingContext,
} from "../domain/coach-context.js";
import {
  summarizeMovementEventsForCoach,
  type MovementEventDocument,
} from "../domain/movement-events.js";
import type { PlannedWorkoutDocument, WorkoutPlanDocument } from "../domain/plans.js";
import type { ReadinessDocument } from "../domain/readiness.js";
import type { WorkoutSessionDocument } from "../domain/workouts.js";
import { syncAuthenticatedUser } from "../users.js";

type CoachThreadDocument = {
  id: string;
  userId: string;
  title: string;
  pinned?: boolean;
  archived?: boolean;
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
  attachments?: CoachAttachment[];
  safetyCategory: "none" | "pain" | "medical" | "emergency";
  model?: string | null;
  createdAt: Date;
  editedAt?: Date | null;
};

type CoachAttachmentDocument = CoachAttachment & {
  userId: string;
  messageId: string | null;
  threadId: string | null;
  data: Binary;
  createdAt: Date;
  expiresAt?: Date;
};

const attachmentMimeTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
const maxAttachmentBytes = 5 * 1024 * 1024;
const maxAttachmentsPerMessage = 3;
const attachmentLifetimeMs = 60 * 60 * 1000;

const coachInput = z
  .object({
    message: z.string().trim().max(2_000).default(""),
    attachmentIds: z.array(z.string().uuid()).max(maxAttachmentsPerMessage).default([]),
    threadId: z.string().uuid().optional(),
    sessionId: z.string().trim().min(1).max(100).optional(),
  })
  .refine(({ message, attachmentIds }) => message.length > 0 || attachmentIds.length > 0, {
    message: "A message or attachment is required",
  });
const uploadAttachmentInput = z.object({
  name: z.string().trim().min(1).max(120),
  mimeType: z.enum(attachmentMimeTypes),
  dataBase64: z.string().min(1).max(7_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
});
const createThreadInput = z.object({
  title: z.string().trim().min(1).max(80).optional(),
});
const updateThreadInput = z
  .object({
    title: z.string().trim().min(1).max(80).optional(),
    pinned: z.boolean().optional(),
    archived: z.boolean().optional(),
  })
  .refine(
    ({ title, pinned, archived }) =>
      title !== undefined || pinned !== undefined || archived !== undefined,
    { message: "At least one conversation change is required" },
  );
const editMessageInput = z.object({
  content: z.string().trim().min(1).max(2_000),
});
const threadParams = z.object({ threadId: z.string().uuid() });
const messageParams = z.object({ messageId: z.string().uuid() });
const attachmentParams = z.object({ attachmentId: z.string().uuid() });
const liveTokenInput = z.object({
  threadId: z.string().uuid(),
  sessionId: z.string().trim().min(1).max(100).optional(),
});
const liveSnapshotQuery = z.object({
  sessionId: z.string().trim().min(1).max(100).optional(),
});
const liveTurnInput = z.object({
  threadId: z.string().uuid(),
  sessionId: z.string().trim().min(1).max(100).optional(),
  userTranscript: z.string().trim().min(1).max(2_000),
  assistantTranscript: z.string().trim().min(1).max(4_000),
});

function notFound(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 404 });
}

function serializeThread(thread: CoachThreadDocument): CoachThread {
  return {
    id: thread.id,
    title: thread.title,
    pinned: thread.pinned ?? false,
    archived: thread.archived ?? false,
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
    attachments: message.attachments ?? [],
    safetyCategory: message.safetyCategory,
    createdAt: message.createdAt.toISOString(),
    editedAt: message.editedAt?.toISOString() ?? null,
  };
}

function serializeAttachment(attachment: CoachAttachmentDocument): CoachAttachment {
  return {
    id: attachment.id,
    name: attachment.name,
    mimeType: attachment.mimeType,
    size: attachment.size,
  };
}

function badRequest(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 400 });
}

function safeAttachmentName(name: string) {
  return name
    .replace(/[\r\n]/g, " ")
    .replace(/[^\p{L}\p{N} ._()-]/gu, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "attachment";
}

function attachmentSignatureMatches(mimeType: CoachAttachment["mimeType"], data: Buffer) {
  if (mimeType === "image/jpeg") {
    return data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff;
  }
  if (mimeType === "image/png") {
    return data.length >= 8 && data.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  }
  if (mimeType === "image/webp") {
    return data.length >= 12
      && data.subarray(0, 4).toString("ascii") === "RIFF"
      && data.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return data.length >= 5 && data.subarray(0, 5).toString("ascii") === "%PDF-";
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
    pinned: false,
    archived: false,
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
  attachmentDocuments: CoachAttachmentDocument[] = [],
  sessionId?: string | null,
) {
  const config = getConfig();
  const now = new Date();
  const [
    profile,
    history,
    readiness,
    activePlan,
    activeSession,
    recentSessions,
    movementContext,
  ] = await Promise.all([
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
    database
      .collection<ReadinessDocument>("readinessCheckIns")
      .findOne(
        { userId: user.id },
        { projection: { _id: 0 }, sort: { date: -1, updatedAt: -1 } },
      ),
    database
      .collection<WorkoutPlanDocument>("workoutPlans")
      .findOne(
        { userId: user.id, status: "active" },
        { projection: { _id: 0 }, sort: { createdAt: -1 } },
      ),
    database
      .collection<WorkoutSessionDocument>("workoutSessions")
      .findOne(
        sessionId
          ? { id: sessionId, userId: user.id }
          : { userId: user.id, status: { $in: ["active", "paused"] } },
        { projection: { _id: 0 }, sort: { updatedAt: -1 } },
      ),
    database
      .collection<WorkoutSessionDocument>("workoutSessions")
      .find({ userId: user.id, status: "completed" }, { projection: { _id: 0 } })
      .sort({ completedAt: -1 })
      .limit(5)
      .toArray(),
    loadCoachMovementContext(database, user.id, sessionId),
  ]);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const nextWorkout = activePlan
    ? await database.collection<PlannedWorkoutDocument>("plannedWorkouts").findOne(
      {
        userId: user.id,
        planId: activePlan.id,
        status: { $in: ["planned", "in_progress"] },
        scheduledFor: { $gte: today },
      },
      { projection: { _id: 0 }, sort: { scheduledFor: 1 } },
    )
    : null;
  return generateCoachResponse({
    apiKey: config.GEMINI_API_KEY,
    model: config.GEMINI_MODEL,
    profile: buildCoachProfileContext(profile),
    message,
    trainingContext: buildCoachTrainingContext({
      readiness,
      activePlan,
      nextWorkout,
      activeSession,
      recentSessions,
      now,
    }),
    movementContext,
    history: history.reverse().map((item) => ({
      role: item.role,
      content: [
        item.content,
        item.attachments?.length
          ? `[Attachments: ${item.attachments.map((attachment) => attachment.name).join(", ")}]`
          : "",
      ].filter(Boolean).join("\n"),
    })),
    attachments: attachmentDocuments.map((attachment) => ({
      name: attachment.name,
      mimeType: attachment.mimeType,
      dataBase64: Buffer.from(attachment.data.buffer).toString("base64"),
    })),
  });
}

async function loadCoachMovementContext(
  database: Db,
  userId: string,
  requestedSessionId?: string | null,
) {
  const sessionFilter: Filter<WorkoutSessionDocument> = requestedSessionId
    ? { id: requestedSessionId, userId }
    : { userId, status: { $in: ["active", "paused"] } };
  const session = await database
    .collection<WorkoutSessionDocument>("workoutSessions")
    .findOne(sessionFilter, { projection: { _id: 0 }, sort: { updatedAt: -1 } });
  if (!session) return null;

  const events = await database
    .collection<MovementEventDocument>("movementEvents")
    .find(
      { userId, sessionId: session.id },
      { projection: { _id: 0 } },
    )
    .sort({ occurredAt: -1 })
    .limit(500)
    .toArray();
  return summarizeMovementEventsForCoach(session, events);
}

async function loadLiveCoachSnapshot(
  database: Db,
  userId: string,
  sessionId?: string | null,
): Promise<LiveCoachSnapshotResponse> {
  const now = new Date();
  const [profile, readiness, activePlan, activeSession, recentSessions, movementContext] =
    await Promise.all([
      database.collection("profiles").findOne(
        { userId },
        { projection: { _id: 0 } },
      ),
      database.collection<ReadinessDocument>("readinessCheckIns").findOne(
        { userId },
        { projection: { _id: 0 }, sort: { date: -1, updatedAt: -1 } },
      ),
      database.collection<WorkoutPlanDocument>("workoutPlans").findOne(
        { userId, status: "active" },
        { projection: { _id: 0 }, sort: { createdAt: -1 } },
      ),
      database.collection<WorkoutSessionDocument>("workoutSessions").findOne(
        sessionId
          ? { id: sessionId, userId }
          : { userId, status: { $in: ["active", "paused"] } },
        { projection: { _id: 0 }, sort: { updatedAt: -1 } },
      ),
      database.collection<WorkoutSessionDocument>("workoutSessions")
        .find({ userId, status: "completed" }, { projection: { _id: 0 } })
        .sort({ completedAt: -1 })
        .limit(5)
        .toArray(),
      loadCoachMovementContext(database, userId, sessionId),
    ]);
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const nextWorkout = activePlan
    ? await database.collection<PlannedWorkoutDocument>("plannedWorkouts").findOne(
      {
        userId,
        planId: activePlan.id,
        status: { $in: ["planned", "in_progress"] },
        scheduledFor: { $gte: today },
      },
      { projection: { _id: 0 }, sort: { scheduledFor: 1 } },
    )
    : null;

  return {
    capturedAt: now.toISOString(),
    profile: buildCoachProfileContext(profile),
    trainingContext: buildCoachTrainingContext({
      readiness,
      activePlan,
      nextWorkout,
      activeSession,
      recentSessions,
      now,
    }),
    movementContext,
  };
}

function liveCoachInstruction(
  snapshot: LiveCoachSnapshotResponse,
  history: Array<Pick<CoachMessageDocument, "role" | "content">>,
) {
  return [
    "You are ForgeFit's live personal coach in an ongoing spoken conversation.",
    "Speak naturally and directly. Use short sentences, contractions, and a warm confident gym-coach tone.",
    "Do not read headings, markdown, citations, profile fields, or a written report aloud.",
    "Answer the exact question first. Usually speak for 15 to 35 seconds, then pause for the user.",
    "Use the supplied member data concretely. Never ask for a preference or fact already present in it.",
    "When workout state may have changed, call get_live_workout_snapshot before giving set-by-set guidance.",
    "If the user interrupts, stop immediately and listen. Treat this as one continuous session.",
    "Do not diagnose or prescribe medical treatment. For pain, dizziness, numbness, breathing difficulty, or urgent symptoms, tell the user to stop training and seek appropriate in-person care.",
    `CURRENT MEMBER AND TRAINING CONTEXT:\n${JSON.stringify(snapshot)}`,
    `RECENT CONVERSATION (continue it; do not re-introduce yourself):\n${JSON.stringify(history)}`,
  ].join("\n\n");
}

async function requirePendingAttachments(
  database: Db,
  userId: string,
  attachmentIds: string[],
) {
  if (!attachmentIds.length) return [];
  const uniqueIds = [...new Set(attachmentIds)];
  if (uniqueIds.length !== attachmentIds.length) badRequest("Duplicate attachments are not allowed");
  const attachments = await database
    .collection<CoachAttachmentDocument>("coachAttachments")
    .find(
      { id: { $in: uniqueIds }, userId, messageId: null },
      { projection: { _id: 0 } },
    )
    .toArray();
  if (attachments.length !== uniqueIds.length) {
    badRequest("One or more attachments are unavailable");
  }
  const byId = new Map(attachments.map((attachment) => [attachment.id, attachment]));
  return attachmentIds.map((attachmentId) => byId.get(attachmentId)!);
}

async function loadMessageAttachments(database: Db, userId: string, messageId: string) {
  return database
    .collection<CoachAttachmentDocument>("coachAttachments")
    .find({ userId, messageId }, { projection: { _id: 0 } })
    .sort({ createdAt: 1 })
    .toArray();
}

export async function coachRoutes(app: FastifyInstance) {
  app.post(
    "/v1/coach/live-token",
    { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (request): Promise<LiveCoachTokenResponse> => {
      const user = await authenticate(request);
      const input = liveTokenInput.parse(request.body);
      await syncAuthenticatedUser(user);
      const database = await getDatabase();
      await requireThread(database, user.id, input.threadId);
      const [snapshot, history] = await Promise.all([
        loadLiveCoachSnapshot(database, user.id, input.sessionId),
        database.collection<CoachMessageDocument>("coachMessages")
          .find(
            { userId: user.id, threadId: input.threadId },
            { projection: { _id: 0, role: 1, content: 1 } },
          )
          .sort({ createdAt: -1 })
          .limit(12)
          .toArray(),
      ]);
      const config = getConfig();
      return createLiveCoachToken({
        apiKey: config.GEMINI_API_KEY,
        model: config.GEMINI_LIVE_MODEL,
        systemInstruction: liveCoachInstruction(snapshot, history.reverse()),
      });
    },
  );

  app.get(
    "/v1/coach/live-snapshot",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request): Promise<LiveCoachSnapshotResponse> => {
      const user = await authenticate(request);
      const { sessionId } = liveSnapshotQuery.parse(request.query ?? {});
      return loadLiveCoachSnapshot(await getDatabase(), user.id, sessionId);
    },
  );

  app.post(
    "/v1/coach/live-turns",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request): Promise<CoachThreadDetail> => {
      const user = await authenticate(request);
      const input = liveTurnInput.parse(request.body);
      const database = await getDatabase();
      await requireThread(database, user.id, input.threadId);
      const now = new Date();
      const safety = classifySafetyMessage(input.userTranscript);
      await database.collection<CoachMessageDocument>("coachMessages").insertMany([
        {
          id: randomUUID(),
          userId: user.id,
          threadId: input.threadId,
          sessionId: input.sessionId ?? null,
          role: "user",
          content: input.userTranscript,
          safetyCategory: safety?.safetyCategory ?? "none",
          createdAt: now,
          editedAt: null,
        },
        {
          id: randomUUID(),
          userId: user.id,
          threadId: input.threadId,
          sessionId: input.sessionId ?? null,
          role: "assistant",
          content: input.assistantTranscript,
          safetyCategory: safety?.safetyCategory ?? "none",
          model: getConfig().GEMINI_LIVE_MODEL,
          createdAt: new Date(now.getTime() + 1),
        },
      ]);
      await updateThreadStats(database, user.id, input.threadId);
      return loadThreadDetail(database, user.id, input.threadId);
    },
  );

  app.get("/v1/coach/threads", async (request): Promise<CoachThreadListResponse> => {
    const user = await authenticate(request);
    await syncAuthenticatedUser(user);
    const database = await getDatabase();
    await migrateLegacyMessages(database, user.id);
    const threads = await database
      .collection<CoachThreadDocument>("coachThreads")
      .find({ userId: user.id }, { projection: { _id: 0 } })
      .sort({ archived: 1, pinned: -1, updatedAt: -1 })
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
    const input = updateThreadInput.parse(request.body);
    const database = await getDatabase();
    await requireThread(database, user.id, threadId);
    const updatedAt = new Date();
    const updates: Partial<Pick<CoachThreadDocument, "title" | "pinned" | "archived">> & {
      updatedAt: Date;
    } = { updatedAt };
    if (input.title !== undefined) updates.title = input.title;
    if (input.pinned !== undefined) updates.pinned = input.pinned;
    if (input.archived !== undefined) updates.archived = input.archived;
    await database
      .collection<CoachThreadDocument>("coachThreads")
      .updateOne({ id: threadId, userId: user.id }, { $set: updates });
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
        .collection<CoachAttachmentDocument>("coachAttachments")
        .deleteMany({ userId: user.id, threadId }),
      database
        .collection<CoachThreadDocument>("coachThreads")
        .deleteOne({ id: threadId, userId: user.id }),
    ]);
    return reply.code(204).send();
  });

  app.post(
    "/v1/coach/attachments",
    {
      bodyLimit: 7_500_000,
      config: { rateLimit: { max: 15, timeWindow: "1 minute" } },
    },
    async (request, reply): Promise<UploadCoachAttachmentResponse> => {
      const user = await authenticate(request);
      const input = uploadAttachmentInput.parse(request.body);
      const data = Buffer.from(input.dataBase64, "base64");
      if (!data.length || data.length > maxAttachmentBytes) {
        badRequest("Attachments must be 5 MB or smaller");
      }
      if (!attachmentSignatureMatches(input.mimeType, data)) {
        badRequest("The attachment content does not match its file type");
      }

      await syncAuthenticatedUser(user);
      const now = new Date();
      const attachment: CoachAttachmentDocument = {
        id: randomUUID(),
        userId: user.id,
        messageId: null,
        threadId: null,
        name: safeAttachmentName(input.name),
        mimeType: input.mimeType,
        size: data.length,
        data: new Binary(data),
        createdAt: now,
        expiresAt: new Date(now.getTime() + attachmentLifetimeMs),
      };
      await (await getDatabase())
        .collection<CoachAttachmentDocument>("coachAttachments")
        .insertOne(attachment);
      reply.code(201);
      return { attachment: serializeAttachment(attachment) };
    },
  );

  app.get("/v1/coach/attachments/:attachmentId", async (request, reply) => {
    const user = await authenticate(request);
    const { attachmentId } = attachmentParams.parse(request.params);
    const attachment = await (await getDatabase())
      .collection<CoachAttachmentDocument>("coachAttachments")
      .findOne({ id: attachmentId, userId: user.id }, { projection: { _id: 0 } });
    if (!attachment) notFound("Attachment not found");
    const encodedName = encodeURIComponent(attachment.name);
    return reply
      .type(attachment.mimeType)
      .header("cache-control", "private, max-age=3600")
      .header("content-disposition", `inline; filename*=UTF-8''${encodedName}`)
      .send(Buffer.from(attachment.data.buffer));
  });

  app.post(
    "/v1/coach/messages",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request): Promise<CoachResponse> => {
      const user = await authenticate(request);
      const input = coachInput.parse(request.body);
      await syncAuthenticatedUser(user);
      const database = await getDatabase();
      const attachmentDocuments = await requirePendingAttachments(
        database,
        user.id,
        input.attachmentIds,
      );
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
        attachments: attachmentDocuments.map(serializeAttachment),
        safetyCategory: "none",
        createdAt: now,
        editedAt: null,
      };
      await database.collection<CoachMessageDocument>("coachMessages").insertOne(userMessage);
      if (attachmentDocuments.length) {
        await database.collection<CoachAttachmentDocument>("coachAttachments").updateMany(
          { id: { $in: attachmentDocuments.map((attachment) => attachment.id) }, userId: user.id },
          {
            $set: { messageId: userMessage.id, threadId: thread.id },
            $unset: { expiresAt: "" },
          },
        );
      }

      if (thread.messageCount === 0 && thread.title === "New conversation") {
        await database
          .collection<CoachThreadDocument>("coachThreads")
          .updateOne(
            { id: thread.id, userId: user.id },
            {
              $set: {
                title: titleFromMessage(
                  input.message || `Shared ${attachmentDocuments[0]?.name ?? "attachment"}`,
                ),
              },
            },
          );
      }
      await updateThreadStats(database, user.id, thread.id);

      const result = await generateReply(
        database,
        user,
        thread.id,
        input.message,
        now,
        attachmentDocuments,
        input.sessionId,
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

      const [laterMessages, attachmentDocuments] = await Promise.all([
        messages
          .find(
            { userId: user.id, threadId, createdAt: { $gt: existing.createdAt } },
            { projection: { _id: 0, id: 1 } },
          )
          .toArray(),
        loadMessageAttachments(database, user.id, messageId),
      ]);
      await Promise.all([
        messages.deleteMany({
          userId: user.id,
          threadId,
          createdAt: { $gt: existing.createdAt },
        }),
        laterMessages.length
          ? database.collection<CoachAttachmentDocument>("coachAttachments").deleteMany({
            userId: user.id,
            messageId: { $in: laterMessages.map((message) => message.id) },
          })
          : Promise.resolve(),
      ]);
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
        attachmentDocuments,
        existing.sessionId,
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
