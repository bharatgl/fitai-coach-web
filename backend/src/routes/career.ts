import { generateStructuredAI } from "@fitai/ai";
import type {
  CareerApplicationListResponse,
  CareerApplicationResponse,
  CareerApplicationStatus,
  CareerInterviewResponse,
  CareerOverviewResponse,
  CareerProfileResponse,
  CareerTargetResponse,
  CompleteCareerInterviewRequest,
  CreateCareerApplicationRequest,
  CreateCareerTargetRequest,
  SaveCareerProfileRequest,
  StartCareerInterviewRequest,
  UpdateCareerApplicationRequest,
} from "@fitai/contracts";
import type { FastifyInstance } from "fastify";
import { MongoServerError } from "mongodb";
import { z } from "zod";
import { authenticate } from "../auth.js";
import {
  abandonCareerInterview,
  assertCareerApplicationTransition,
  careerNextAction,
  completeCareerInterview,
  createCareerApplicationDocument,
  createCareerInterviewDocument,
  createCareerProfileDocument,
  createCareerTargetDocument,
  groundInterviewFeedback,
  serializeCareerApplication,
  serializeCareerInterview,
  serializeCareerProfile,
  serializeCareerTarget,
  type CareerApplicationDocument,
  type CareerInterviewSessionDocument,
  type CareerProfileDocument,
  type CareerTargetRoleDocument,
} from "../domain/career.js";
import type { BotDocument } from "../domain/bots.js";
import { getDatabase, getMongoClient } from "../db.js";
import { resolveAISettings } from "../services/provider-settings.js";
import { syncAuthenticatedUser } from "../users.js";

const workMode = z.enum(["remote", "hybrid", "onsite", "flexible"]);
const seniority = z.enum(["internship", "junior", "mid", "senior", "lead", "staff", "executive", "unspecified"]);
const applicationStatus = z.enum(["saved", "preparing", "applied", "interviewing", "offer", "accepted", "rejected", "withdrawn"]);
const interviewFormat = z.enum(["general", "behavioral", "technical", "system_design"]);
const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Date must be a valid calendar date");
const optionalUrl = z.string().trim().url().max(1_000).refine(
  (value) => value.startsWith("https://") || value.startsWith("http://"),
  "Only HTTP and HTTPS links are supported",
).nullable();
const stringList = (limit: number) => z.array(z.string().trim().min(1).max(80)).max(limit)
  .transform((items) => [...new Set(items.map((item) => item.replace(/\s+/g, " "))) ]);

const profileInput = z.object({
  headline: z.string().trim().max(180),
  location: z.string().trim().max(120),
  workMode,
  yearsExperience: z.number().min(0).max(60).nullable(),
  skills: stringList(30),
  strengths: z.string().trim().max(2_000),
  constraints: z.string().trim().max(2_000),
}).strict();

const targetInput = z.object({
  title: z.string().trim().min(2).max(140),
  seniority,
  location: z.string().trim().max(120),
  workMode,
  mustHaveSkills: stringList(20),
  notes: z.string().trim().max(2_000),
  isPrimary: z.boolean().optional(),
}).strict();

const targetUpdateInput = z.object({
  status: z.enum(["active", "archived"]).optional(),
  isPrimary: z.boolean().optional(),
  notes: z.string().trim().max(2_000).optional(),
}).strict().refine((input) => Object.keys(input).length > 0, "Include at least one change");

const applicationInput = z.object({
  targetRoleId: z.string().uuid().nullable(),
  company: z.string().trim().min(1).max(160),
  roleTitle: z.string().trim().min(2).max(160),
  sourceUrl: optionalUrl,
  status: applicationStatus,
  nextAction: z.string().trim().max(500),
  nextActionDue: calendarDate.nullable(),
  notes: z.string().trim().max(4_000),
}).strict();

const applicationUpdateInput = z.object({
  sourceUrl: optionalUrl.optional(),
  status: applicationStatus.optional(),
  nextAction: z.string().trim().max(500).optional(),
  nextActionDue: calendarDate.nullable().optional(),
  notes: z.string().trim().max(4_000).optional(),
}).strict().refine((input) => Object.keys(input).length > 0, "Include at least one change");

const interviewInput = z.object({
  targetRoleId: z.string().uuid().nullable(),
  botId: z.string().uuid().nullable(),
  format: interviewFormat,
  competencies: stringList(8).pipe(z.array(z.string()).min(1)),
  plannedMinutes: z.number().int().min(5).max(90),
}).strict();

const interviewTurnsInput = z.object({
  turns: z.array(z.object({
    role: z.enum(["user", "coach"]),
    content: z.string().trim().min(1).max(4_000),
  }).strict()).min(2).max(100),
}).strict().superRefine(({ turns }, context) => {
  if (!turns.some((turn) => turn.role === "user")) {
    context.addIssue({ code: "custom", path: ["turns"], message: "At least one candidate answer is required" });
  }
  if (turns.reduce((sum, turn) => sum + turn.content.length, 0) > 24_000) {
    context.addIssue({ code: "custom", path: ["turns"], message: "Interview transcript is too long" });
  }
});

const feedbackSchema = z.object({
  overallScore: z.number().min(1).max(5),
  summary: z.string().min(10).max(1_200),
  rubric: z.array(z.object({
    competency: z.string().min(1).max(100),
    score: z.number().min(1).max(5),
    evidenceExcerpt: z.string().min(1).max(300).nullable(),
    feedback: z.string().min(3).max(800),
  })).min(1).max(8),
  nextActions: z.array(z.string().min(3).max(300)).min(1).max(5),
});

const idParams = z.object({ id: z.string().uuid() });
const listQuery = z.object({
  status: applicationStatus.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().max(500).optional(),
});

type Cursor = { updatedAt: string; id: string };

function decodeCursor(value: string | undefined): Cursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Cursor;
    if (!parsed.id || !Number.isFinite(new Date(parsed.updatedAt).getTime())) throw new Error("Invalid cursor");
    return parsed;
  } catch {
    throw Object.assign(new Error("Invalid pagination cursor"), { statusCode: 400 });
  }
}

function encodeCursor(document: CareerApplicationDocument) {
  return Buffer.from(JSON.stringify({
    updatedAt: document.updatedAt.toISOString(),
    id: document.id,
  }), "utf8").toString("base64url");
}

function notFound(resource: string): never {
  throw Object.assign(new Error(`${resource} not found`), { statusCode: 404 });
}

async function assertOwnedTarget(userId: string, targetRoleId: string | null) {
  if (!targetRoleId) return null;
  const database = await getDatabase();
  const target = await database.collection<CareerTargetRoleDocument>("careerTargetRoles")
    .findOne({ userId, id: targetRoleId, status: "active" }, { projection: { _id: 0 } });
  if (!target) notFound("Career target role");
  return target;
}

export async function careerRoutes(app: FastifyInstance) {
  app.get("/v1/career/overview", async (request): Promise<CareerOverviewResponse> => {
    const user = await authenticate(request);
    const database = await getDatabase();
    const [profile, targetRoles, recentApplications, recentInterviews, activeInterview, applicationGroups, interviewStats] = await Promise.all([
      database.collection<CareerProfileDocument>("careerProfiles")
        .findOne({ userId: user.id }, { projection: { _id: 0 } }),
      database.collection<CareerTargetRoleDocument>("careerTargetRoles")
        .find({ userId: user.id, status: "active" }, { projection: { _id: 0 } })
        .sort({ isPrimary: -1, updatedAt: -1 }).limit(20).toArray(),
      database.collection<CareerApplicationDocument>("careerApplications")
        .find({ userId: user.id }, { projection: { _id: 0 } })
        .sort({ updatedAt: -1, id: -1 }).limit(8).toArray(),
      database.collection<CareerInterviewSessionDocument>("careerInterviewSessions")
        .find({ userId: user.id, status: { $ne: "active" } }, { projection: { _id: 0 } })
        .sort({ startedAt: -1 }).limit(6).toArray(),
      database.collection<CareerInterviewSessionDocument>("careerInterviewSessions")
        .findOne({ userId: user.id, status: "active" }, { projection: { _id: 0 }, sort: { startedAt: -1 } }),
      database.collection<CareerApplicationDocument>("careerApplications")
        .aggregate<{ _id: CareerApplicationStatus; count: number }>([
          { $match: { userId: user.id } },
          { $group: { _id: "$status", count: { $sum: 1 } } },
        ]).toArray(),
      database.collection<CareerInterviewSessionDocument>("careerInterviewSessions")
        .aggregate<{ _id: null; count: number; averageScore: number | null }>([
          { $match: { userId: user.id, status: "completed" } },
          { $group: { _id: null, count: { $sum: 1 }, averageScore: { $avg: "$feedback.overallScore" } } },
        ]).next(),
    ]);
    const emptyCounts: Record<CareerApplicationStatus, number> = {
      saved: 0, preparing: 0, applied: 0, interviewing: 0, offer: 0, accepted: 0, rejected: 0, withdrawn: 0,
    };
    for (const group of applicationGroups) emptyCounts[group._id] = group.count;
    const completedInterviews = interviewStats?.count ?? 0;
    return {
      profile: profile ? serializeCareerProfile(profile) : null,
      targetRoles: targetRoles.map(serializeCareerTarget),
      recentApplications: recentApplications.map(serializeCareerApplication),
      // Overview is deliberately summary-only so a long practice transcript does not
      // inflate the command-center response. The owned session endpoint serves turns.
      recentInterviews: recentInterviews.map((session) => serializeCareerInterview({ ...session, turns: [] })),
      activeInterview: activeInterview ? serializeCareerInterview(activeInterview) : null,
      progress: {
        applicationCounts: emptyCounts,
        completedInterviews,
        averageInterviewScore: typeof interviewStats?.averageScore === "number"
          ? Number(interviewStats.averageScore.toFixed(1))
          : null,
      },
      nextAction: careerNextAction({
        hasProfile: Boolean(profile),
        targetCount: targetRoles.length,
        applicationCounts: emptyCounts,
        completedInterviews,
      }),
    };
  });

  app.put("/v1/career/profile", async (request): Promise<CareerProfileResponse> => {
    const user = await authenticate(request);
    const input = profileInput.parse(request.body) as SaveCareerProfileRequest;
    await syncAuthenticatedUser(user);
    const database = await getDatabase();
    const collection = database.collection<CareerProfileDocument>("careerProfiles");
    const existing = await collection.findOne({ userId: user.id }, { projection: { _id: 0 } });
    const profile = createCareerProfileDocument(user.id, input, existing);
    await collection.replaceOne({ userId: user.id }, profile, { upsert: true });
    return { profile: serializeCareerProfile(profile) };
  });

  app.post("/v1/career/targets", async (request, reply): Promise<CareerTargetResponse> => {
    const user = await authenticate(request);
    const input = targetInput.parse(request.body) as CreateCareerTargetRequest;
    await syncAuthenticatedUser(user);
    const database = await getDatabase();
    const client = await getMongoClient();
    let created: CareerTargetRoleDocument | null = null;
    try {
      await client.withSession(async (session) => {
        await session.withTransaction(async () => {
          const collection = database.collection<CareerTargetRoleDocument>("careerTargetRoles");
          const hasActiveTarget = Boolean(await collection.findOne(
            { userId: user.id, status: "active" },
            { projection: { _id: 1 }, session },
          ));
          created = createCareerTargetDocument(user.id, input, !hasActiveTarget);
          if (created.isPrimary) {
            await collection.updateMany(
              { userId: user.id, status: "active", isPrimary: true },
              { $set: { isPrimary: false, updatedAt: created.updatedAt } },
              { session },
            );
          }
          await collection.insertOne(created, { session });
        });
      });
    } catch (cause) {
      if (cause instanceof MongoServerError && cause.code === 11000) {
        throw Object.assign(new Error("A primary target was updated at the same time. Please retry."), { statusCode: 409 });
      }
      throw cause;
    }
    if (!created) throw Object.assign(new Error("Career target could not be created"), { statusCode: 503 });
    return reply.code(201).send({ targetRole: serializeCareerTarget(created) });
  });

  app.patch("/v1/career/targets/:id", async (request): Promise<CareerTargetResponse> => {
    const user = await authenticate(request);
    const { id } = idParams.parse(request.params);
    const input = targetUpdateInput.parse(request.body);
    const database = await getDatabase();
    const client = await getMongoClient();
    let updated: CareerTargetRoleDocument | null = null;
    await client.withSession(async (session) => {
      await session.withTransaction(async () => {
        const collection = database.collection<CareerTargetRoleDocument>("careerTargetRoles");
        const current = await collection.findOne({ userId: user.id, id }, { projection: { _id: 0 }, session });
        if (!current) notFound("Career target role");
        const now = new Date();
        const status = input.status ?? current.status;
        const isPrimary = status === "archived" ? false : input.isPrimary ?? current.isPrimary;
        if (isPrimary) {
          await collection.updateMany(
            { userId: user.id, status: "active", isPrimary: true, id: { $ne: id } },
            { $set: { isPrimary: false, updatedAt: now } },
            { session },
          );
        }
        updated = { ...current, ...input, status, isPrimary, updatedAt: now };
        await collection.replaceOne({ userId: user.id, id }, updated, { session });
      });
    });
    if (!updated) notFound("Career target role");
    return { targetRole: serializeCareerTarget(updated) };
  });

  app.get("/v1/career/applications", async (request): Promise<CareerApplicationListResponse> => {
    const user = await authenticate(request);
    const query = listQuery.parse(request.query);
    const cursor = decodeCursor(query.cursor);
    const database = await getDatabase();
    const cursorFilter = cursor ? {
      $or: [
        { updatedAt: { $lt: new Date(cursor.updatedAt) } },
        { updatedAt: new Date(cursor.updatedAt), id: { $lt: cursor.id } },
      ],
    } : {};
    const documents = await database.collection<CareerApplicationDocument>("careerApplications")
      .find({ userId: user.id, ...(query.status ? { status: query.status } : {}), ...cursorFilter }, { projection: { _id: 0 } })
      .sort({ updatedAt: -1, id: -1 }).limit(query.limit + 1).toArray();
    const hasMore = documents.length > query.limit;
    const page = hasMore ? documents.slice(0, query.limit) : documents;
    return {
      items: page.map(serializeCareerApplication),
      nextCursor: hasMore && page.length ? encodeCursor(page[page.length - 1]!) : null,
    };
  });

  app.post("/v1/career/applications", async (request, reply): Promise<CareerApplicationResponse> => {
    const user = await authenticate(request);
    const input = applicationInput.parse(request.body) as CreateCareerApplicationRequest;
    await assertOwnedTarget(user.id, input.targetRoleId);
    const database = await getDatabase();
    const document = createCareerApplicationDocument(user.id, input);
    await database.collection<CareerApplicationDocument>("careerApplications").insertOne(document);
    return reply.code(201).send({ application: serializeCareerApplication(document) });
  });

  app.patch("/v1/career/applications/:id", async (request): Promise<CareerApplicationResponse> => {
    const user = await authenticate(request);
    const { id } = idParams.parse(request.params);
    const input = applicationUpdateInput.parse(request.body) as UpdateCareerApplicationRequest;
    const database = await getDatabase();
    const collection = database.collection<CareerApplicationDocument>("careerApplications");
    const current = await collection.findOne({ userId: user.id, id }, { projection: { _id: 0 } });
    if (!current) notFound("Career application");
    const now = new Date();
    if (input.status) assertCareerApplicationTransition(current.status, input.status);
    const statusChanged = Boolean(input.status && input.status !== current.status);
    const update = {
      ...current,
      ...input,
      statusChangedAt: statusChanged ? now : current.statusChangedAt,
      statusHistory: statusChanged
        ? [...current.statusHistory, { status: input.status!, occurredAt: now }]
        : current.statusHistory,
      updatedAt: now,
    };
    const result = await collection.replaceOne(
      { userId: user.id, id, status: current.status, updatedAt: current.updatedAt },
      update,
    );
    if (!result.matchedCount) {
      throw Object.assign(new Error("Application changed in another session. Refresh and retry."), { statusCode: 409 });
    }
    return { application: serializeCareerApplication(update) };
  });

  app.post("/v1/career/interviews", async (request, reply): Promise<CareerInterviewResponse> => {
    const user = await authenticate(request);
    const input = interviewInput.parse(request.body) as StartCareerInterviewRequest;
    await assertOwnedTarget(user.id, input.targetRoleId);
    const database = await getDatabase();
    if (input.botId) {
      const bot = await database.collection<BotDocument>("bots").findOne(
        { userId: user.id, id: input.botId, status: "active", vertical: { $in: ["interview", "resume"] } },
        { projection: { _id: 1 } },
      );
      if (!bot) notFound("Active career coach");
    }
    const existing = await database.collection<CareerInterviewSessionDocument>("careerInterviewSessions")
      .findOne({ userId: user.id, status: "active" }, { projection: { _id: 1 } });
    if (existing) {
      throw Object.assign(new Error("Finish or abandon the active interview practice before starting another."), { statusCode: 409 });
    }
    const session = createCareerInterviewDocument(user.id, input);
    try {
      await database.collection<CareerInterviewSessionDocument>("careerInterviewSessions").insertOne(session);
    } catch (cause) {
      if (cause instanceof MongoServerError && cause.code === 11000) {
        throw Object.assign(new Error("An interview practice session is already active."), { statusCode: 409 });
      }
      throw cause;
    }
    return reply.code(201).send({ session: serializeCareerInterview(session) });
  });

  app.get("/v1/career/interviews/:id", async (request): Promise<CareerInterviewResponse> => {
    const user = await authenticate(request);
    const { id } = idParams.parse(request.params);
    const database = await getDatabase();
    const session = await database.collection<CareerInterviewSessionDocument>("careerInterviewSessions")
      .findOne({ userId: user.id, id }, { projection: { _id: 0 } });
    if (!session) notFound("Interview practice session");
    return { session: serializeCareerInterview(session) };
  });

  app.post(
    "/v1/career/interviews/:id/complete",
    { config: { rateLimit: { max: 5, timeWindow: "10 minutes" } } },
    async (request): Promise<CareerInterviewResponse> => {
      const user = await authenticate(request);
      const { id } = idParams.parse(request.params);
      const input = interviewTurnsInput.parse(request.body) as CompleteCareerInterviewRequest;
      const database = await getDatabase();
      const session = await database.collection<CareerInterviewSessionDocument>("careerInterviewSessions")
        .findOne({ userId: user.id, id, status: "active" }, { projection: { _id: 0 } });
      if (!session) notFound("Active interview practice session");
      const [profile, target, provider] = await Promise.all([
        database.collection<CareerProfileDocument>("careerProfiles")
          .findOne({ userId: user.id }, { projection: { _id: 0 } }),
        session.targetRoleId
          ? database.collection<CareerTargetRoleDocument>("careerTargetRoles")
            .findOne({ userId: user.id, id: session.targetRoleId }, { projection: { _id: 0 } })
          : Promise.resolve(null),
        resolveAISettings(user.id, database),
      ]);
      const generated = await generateStructuredAI({
        provider,
        schema: feedbackSchema,
        maxOutputTokens: 1_800,
        systemInstruction: [
          "You are evaluating one completed career interview practice session.",
          "Score only the candidate's actual answers. Do not infer experience, impact, or technical decisions that are absent.",
          "For each rubric item, evidenceExcerpt must be a short exact excerpt from a user turn or null when no supporting excerpt exists.",
          "Give specific, candid, actionable feedback. Separate communication quality from correctness and evidence strength.",
          "Use scores from 1 (not demonstrated) to 5 (strongly demonstrated). Do not reward the coach's words.",
          "Return only the requested structured result.",
        ].join("\n"),
        contents: JSON.stringify({
          targetRole: target ? serializeCareerTarget(target) : null,
          careerProfile: profile ? serializeCareerProfile(profile) : null,
          format: session.format,
          requestedCompetencies: session.competencies,
          transcript: input.turns,
        }),
      });
      const feedback = groundInterviewFeedback({ ...generated }, input.turns);
      const completed = completeCareerInterview(session, input.turns, feedback, provider.model);
      const result = await database.collection<CareerInterviewSessionDocument>("careerInterviewSessions")
        .replaceOne({ userId: user.id, id, status: "active" }, completed);
      if (!result.matchedCount) {
        throw Object.assign(new Error("Interview changed in another session. Refresh and retry."), { statusCode: 409 });
      }
      return { session: serializeCareerInterview(completed) };
    },
  );

  app.post("/v1/career/interviews/:id/abandon", async (request): Promise<CareerInterviewResponse> => {
    const user = await authenticate(request);
    const { id } = idParams.parse(request.params);
    const database = await getDatabase();
    const collection = database.collection<CareerInterviewSessionDocument>("careerInterviewSessions");
    const session = await collection.findOne({ userId: user.id, id, status: "active" }, { projection: { _id: 0 } });
    if (!session) notFound("Active interview practice session");
    const abandoned = abandonCareerInterview(session);
    const result = await collection.replaceOne({ userId: user.id, id, status: "active" }, abandoned);
    if (!result.matchedCount) {
      throw Object.assign(new Error("Interview changed in another session. Refresh and retry."), { statusCode: 409 });
    }
    return { session: serializeCareerInterview(abandoned) };
  });
}
