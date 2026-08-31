import { randomUUID } from "node:crypto";
import {
  analyzeCameraFrame,
  classifySafetyMessage,
  coachBehaviorContract,
  createLiveCoachToken,
  ensurePlanChangeConfirmation,
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
  ConfirmPlanAdjustmentResponse,
  ElevenLabsCoachSessionResponse,
  GeneratedCoachPdfResponse,
  LiveAttachmentReviewResponse,
  LiveCoachAvatarTokenResponse,
  LiveCameraAnalysisResponse,
  LiveCoachSnapshotResponse,
  LiveCoachTokenResponse,
  PendingPlanAdjustmentResponse,
  PlanAdjustmentProposal,
  UploadCoachAttachmentResponse,
} from "@fitai/contracts";
import type { FastifyInstance } from "fastify";
import type { Db, Filter } from "mongodb";
import { Binary, MongoServerError } from "mongodb";
import { z } from "zod";
import { authenticate, type AuthenticatedUser } from "../auth.js";
import { getConfig } from "../config.js";
import { getDatabase, getMongoClient } from "../db.js";
import {
  buildCoachProfileContext,
  buildCoachTrainingContext,
} from "../domain/coach-context.js";
import { shouldReuseRecentCoachAttachments } from "../domain/coach-attachments.js";
import {
  generateCoachPdf,
  shouldGenerateCoachPdf,
} from "../domain/coach-documents.js";
import {
  buildLiveCoachOpening,
  compactDatedLiveHistory,
  defaultCoachTimeZone,
  formatCoachLocalDateTime,
} from "../domain/live-history.js";
import {
  summarizeMovementEventsForCoach,
  type MovementEventDocument,
} from "../domain/movement-events.js";
import {
  PlanValidationError,
  serializePlan,
  serializeWorkout,
  type PlannedWorkoutDocument,
  type WorkoutPlanDocument,
} from "../domain/plans.js";
import {
  createPlanAdjustmentProposal,
  serializePlanAdjustmentProposal,
  type PlanAdjustmentProposalDocument,
} from "../domain/plan-adjustments.js";
import type { ReadinessDocument } from "../domain/readiness.js";
import type { WorkoutSessionDocument } from "../domain/workouts.js";
import { createElevenLabsSignedUrl } from "../services/elevenlabs.js";
import {
  resolveAISettings,
  resolveElevenLabsSettings,
  resolveGeminiSettings,
} from "../services/provider-settings.js";
import { syncAuthenticatedUser } from "../users.js";

type CoachThreadDocument = {
  id: string;
  userId: string;
  scope?: "general" | "plan";
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
  clientTurnId?: string;
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
const simliTokenResponse = z.object({ session_token: z.string().min(1) });

const coachInput = z
  .object({
    message: z.string().trim().max(2_000).default(""),
    attachmentIds: z.array(z.string().uuid()).max(maxAttachmentsPerMessage).default([]),
    threadId: z.string().uuid().optional(),
    sessionId: z.string().trim().min(1).max(100).optional(),
    planId: z.string().trim().min(1).max(100).optional(),
    weekNumber: z.number().int().min(1).max(52).optional(),
    workoutId: z.string().trim().min(1).max(100).optional(),
  })
  .refine(({ message, attachmentIds }) => message.length > 0 || attachmentIds.length > 0, {
    message: "A message or attachment is required",
  });
const uploadAttachmentInput = z.object({
  name: z.string().trim().min(1).max(120),
  mimeType: z.enum(attachmentMimeTypes),
  dataBase64: z.string().min(1).max(7_000_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  threadId: z.string().uuid().optional(),
});
const createThreadInput = z.object({
  title: z.string().trim().min(1).max(80).optional(),
  scope: z.enum(["general", "plan"]).default("general"),
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
const planAdjustmentParams = z.object({ proposalId: z.string().uuid() });
const pendingPlanAdjustmentQuery = z.object({ planId: z.string().min(1).max(100) });
const liveTokenInput = z.object({
  threadId: z.string().uuid(),
  sessionId: z.string().trim().min(1).max(100).optional(),
  timeZone: z.string().trim().min(1).max(100).refine((timeZone) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone }).format();
      return true;
    } catch {
      return false;
    }
  }, "Invalid IANA timezone").default(defaultCoachTimeZone),
});
const liveSnapshotQuery = z.object({
  sessionId: z.string().trim().min(1).max(100).optional(),
});
const liveCameraAnalysisInput = z.object({
  focus: z.enum(["physique", "posture", "form", "general"]).default("general"),
  sessionId: z.string().trim().min(1).max(100).optional(),
  mimeType: z.literal("image/jpeg"),
  imageBase64: z.string().min(100).max(1_250_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  width: z.number().int().positive().max(1_920),
  height: z.number().int().positive().max(1_920),
});
const liveAttachmentReviewInput = z.object({
  threadId: z.string().uuid(),
  sessionId: z.string().trim().min(1).max(100).optional(),
  question: z.string().trim().min(1).max(2_000).default("Review the most recently uploaded file."),
});
const generatedPdfInput = z.object({
  threadId: z.string().uuid(),
  title: z.string().trim().min(1).max(120),
  content: z.string().trim().min(1).max(30_000),
});
const liveTurnInput = z.object({
  clientTurnId: z.string().uuid().optional(),
  threadId: z.string().uuid(),
  sessionId: z.string().trim().min(1).max(100).optional(),
  userTranscript: z.string().trim().min(1).max(2_000),
  assistantTranscript: z.string().trim().min(1).max(4_000),
  provider: z.enum(["gemini", "elevenlabs"]).default("gemini"),
});

function notFound(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 404 });
}

function serializeThread(thread: CoachThreadDocument): CoachThread {
  return {
    id: thread.id,
    scope: thread.scope ?? (thread.title === "Training plan" ? "plan" : "general"),
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

function conflict(message: string): never {
  throw Object.assign(new Error(message), { statusCode: 409 });
}

function safeAttachmentName(name: string) {
  return name
    .replace(/[\r\n]/g, " ")
    .replace(/[^\p{L}\p{N} ._()-]/gu, "_")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "attachment";
}

function generatedPdfName(title: string) {
  const base = safeAttachmentName(title)
    .replace(/\.pdf$/i, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 90);
  return `${base || "forgefit-coach-document"}.pdf`;
}

async function buildGeneratedPdfAttachment({
  userId,
  threadId,
  messageId,
  title,
  content,
  createdAt,
}: {
  userId: string;
  threadId: string;
  messageId: string;
  title: string;
  content: string;
  createdAt: Date;
}): Promise<CoachAttachmentDocument> {
  const data = await generateCoachPdf({ title, content, generatedAt: createdAt });
  if (data.length > maxAttachmentBytes) {
    throw Object.assign(new Error("The generated PDF is too large to attach."), { statusCode: 503 });
  }
  return {
    id: randomUUID(),
    userId,
    messageId,
    threadId,
    name: generatedPdfName(title),
    mimeType: "application/pdf",
    size: data.length,
    data: new Binary(data),
    createdAt,
    expiresAt: new Date(createdAt.getTime() + attachmentLifetimeMs),
  };
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
  scope: "general" | "plan" = "general",
): CoachThreadDocument {
  const now = new Date();
  return {
    id: randomUUID(),
    userId,
    scope,
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
  sourceMessageId: string,
  attachmentDocuments: CoachAttachmentDocument[] = [],
  sessionId?: string | null,
  planScope?: { planId?: string; weekNumber?: number; workoutId?: string },
) {
  const now = new Date();
  const [
    profile,
    history,
    readiness,
    activePlan,
    activeSession,
    recentSessions,
    movementContext,
    aiSettings,
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
    resolveAISettings(user.id, database),
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
  const scopedPlan = activePlan && (!planScope?.planId || planScope.planId === activePlan.id)
    ? activePlan
    : null;
  const selectedWeekNumber = planScope?.weekNumber ?? nextWorkout?.weekNumber ?? null;
  const selectedWeekWorkouts = scopedPlan && selectedWeekNumber
    ? await database.collection<PlannedWorkoutDocument>("plannedWorkouts")
      .find(
        { userId: user.id, planId: scopedPlan.id, weekNumber: selectedWeekNumber },
        { projection: { _id: 0 } },
      )
      .sort({ dayOffset: 1 })
      .toArray()
    : [];
  const reviewAttachmentDocuments = attachmentDocuments.length > 0
    ? attachmentDocuments
    : shouldReuseRecentCoachAttachments(message)
      ? await database.collection<CoachAttachmentDocument>("coachAttachments")
        .find(
          { userId: user.id, threadId, messageId: { $ne: null } },
          { projection: { _id: 0 } },
        )
        .sort({ createdAt: -1 })
        .limit(maxAttachmentsPerMessage)
        .toArray()
      : [];
  const result = await generateCoachResponse({
    provider: aiSettings,
    profile: buildCoachProfileContext(profile),
    message,
    trainingContext: buildCoachTrainingContext({
      readiness,
      activePlan,
      nextWorkout,
      activeSession,
      recentSessions,
      selectedWeekNumber,
      selectedWeekWorkouts,
      selectedWorkoutId: planScope?.workoutId ?? nextWorkout?.id ?? null,
      canProposePlanChanges: Boolean(planScope?.planId),
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
    attachments: reviewAttachmentDocuments.map((attachment) => ({
      name: attachment.name,
      mimeType: attachment.mimeType,
      dataBase64: Buffer.from(attachment.data.buffer).toString("base64"),
    })),
  });
  let planAdjustmentProposal: PlanAdjustmentProposal | null = null;
  let proposalError = "";
  if (result.safetyCategory === "none" && result.planAdjustment && scopedPlan && planScope?.planId) {
    try {
      const proposalWorkouts = result.planAdjustment.action === "reschedule_plan"
        ? await database.collection<PlannedWorkoutDocument>("plannedWorkouts")
          .find({ userId: user.id, planId: scopedPlan.id }, { projection: { _id: 0 } })
          .sort({ weekNumber: 1, dayOffset: 1 })
          .toArray()
        : selectedWeekWorkouts;
      const proposal = createPlanAdjustmentProposal({
        draft: result.planAdjustment,
        plan: scopedPlan,
        workouts: proposalWorkouts,
        userId: user.id,
        threadId,
        sourceMessageId,
        now,
      });
      await database.collection<PlanAdjustmentProposalDocument>("planAdjustmentProposals").updateMany(
        { userId: user.id, planId: scopedPlan.id, status: "pending" },
        { $set: { status: "rejected", rejectedAt: now } },
      );
      await database.collection<PlanAdjustmentProposalDocument>("planAdjustmentProposals").insertOne(proposal);
      planAdjustmentProposal = serializePlanAdjustmentProposal(proposal, now);
    } catch (error) {
      if (!(error instanceof PlanValidationError)) throw error;
      proposalError = error.message;
    }
  }
  const coachResult = {
    model: result.model,
    safetyCategory: result.safetyCategory,
    shouldPauseWorkout: result.shouldPauseWorkout,
    suggestedAdjustment: result.suggestedAdjustment,
  };
  const baseReply = proposalError
    ? `${result.reply.trim()}\n\nI couldn't prepare a safe saved-plan change: ${proposalError}. Your current schedule is unchanged.`
    : planAdjustmentProposal
      ? `${result.reply.trim()}\n\nReview the proposed schedule change below. Your saved plan will not change until you confirm it.`
      : result.reply;
  return {
    ...coachResult,
    planAdjustmentProposal,
    reply: result.safetyCategory === "none"
      ? ensurePlanChangeConfirmation({
          reply: baseReply,
          message,
          hasPlanContext: Boolean(planScope?.planId && selectedWeekWorkouts.length > 0),
        })
      : baseReply,
  };
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
  const selectedWeekWorkouts = activePlan && nextWorkout
    ? await database.collection<PlannedWorkoutDocument>("plannedWorkouts")
      .find(
        { userId, planId: activePlan.id, weekNumber: nextWorkout.weekNumber },
        { projection: { _id: 0 } },
      )
      .sort({ dayOffset: 1 })
      .toArray()
    : [];

  return {
    capturedAt: now.toISOString(),
    profile: buildCoachProfileContext(profile),
    trainingContext: buildCoachTrainingContext({
      readiness,
      activePlan,
      nextWorkout,
      activeSession,
      recentSessions,
      selectedWeekNumber: nextWorkout?.weekNumber ?? null,
      selectedWeekWorkouts,
      selectedWorkoutId: nextWorkout?.id ?? null,
      now,
    }),
    movementContext,
  };
}

function liveCoachInstruction(
  snapshot: LiveCoachSnapshotResponse,
  currentLocalDateTime: string,
  timeZone: string,
) {
  return [
    "You are ForgeFit's live personal coach in an ongoing spoken conversation.",
    coachBehaviorContract,
    `The authoritative current local date and time is ${currentLocalDateTime}. The member's IANA timezone is ${timeZone}.`,
    "The ongoing thread turns include their original Sent timestamps. Use those timestamps to distinguish past discussions from current intentions.",
    "Speak naturally and directly. Use short sentences, contractions, and a calm human tone appropriate to the current conversation.",
    "Default to grounded and emotionally neutral, not cheerful or excited. Adapt gently to the member's words, pace, pauses, and audible energy when available. Slow down and soften for stress, fatigue, sadness, or uncertainty; raise energy only when the member genuinely does.",
    "Do not use hype, motivational slogans, or exclamation marks unless the moment clearly warrants them.",
    "Speak with a natural Indian English cadence and pronunciation without exaggeration or stereotype.",
    "Open in neutral, natural language. Do not start with bro, bhai, veere, or similar slang unless the member explicitly asks for that style.",
    "If the member speaks Hindi, Punjabi, or Hinglish, mirror that language mix naturally. Otherwise continue in English.",
    "Use metric units and India-relevant food, schedule, and gym context when helpful, while honoring the member's actual dietary preference and supplied facts.",
    "Never presume religion, caste, region, income, family structure, or dietary choices from a name or nationality.",
    "Do not read headings, markdown, citations, profile fields, or a written report aloud.",
    "Answer the exact question first. Usually speak for 15 to 35 seconds, then pause for the user.",
    "Use the supplied member data concretely. Never ask for a preference or fact already present in it.",
    "When workout state may have changed, call get_live_workout_snapshot before giving set-by-set guidance.",
    "When the member explicitly asks you to look at, inspect, analyze, or assess their physique, posture, exercise form, or current camera view, call analyze_camera_view before answering. Never say you cannot see until you have tried that tool. If visual analysis is temporarily unavailable, say so clearly instead of claiming the camera is off.",
    "When the member asks about an uploaded file, document, PDF, image, report, or attachment, call review_recent_attachment before answering. Never ask them to paste file text unless that tool reports a specific unreadable or protected-file limitation.",
    "When the member asks you to create, generate, export, save, or download a PDF, call create_pdf_document with a concise title and the complete polished document content. Never claim that PDF creation is unavailable or ask them to copy and paste the content elsewhere. After the tool succeeds, tell them the download is visible in the chat.",
    "The camera tool analyzes one current still frame. Explain framing limitations honestly, never estimate exact body-fat percentage, and do not diagnose injuries or health conditions from an image.",
    "The ongoing coach thread is provided as initial conversation history. Continue from it and never claim that you cannot access earlier messages that were supplied.",
    "The member may be planning, reflecting, eating, recovering, winding down, or simply talking. Never assume they are currently working out merely because ForgeFit is open or a workout exists in saved state.",
    "Messages beginning ON_DEVICE_MOVEMENT_UPDATE contain privacy-preserving pose estimates, not raw camera footage. Give one immediate cue under 12 words only when it is actionable; otherwise stay silent.",
    "If the user interrupts, stop immediately and listen. Treat this as one continuous session.",
    "Do not diagnose or prescribe medical treatment. For pain, dizziness, numbness, breathing difficulty, or urgent symptoms, tell the user to stop training and seek appropriate in-person care.",
    `CURRENT MEMBER AND TRAINING CONTEXT:\n${JSON.stringify(snapshot)}`,
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
  app.get("/v1/plan-adjustments/pending", async (request): Promise<PendingPlanAdjustmentResponse> => {
    const user = await authenticate(request);
    const { planId } = pendingPlanAdjustmentQuery.parse(request.query);
    const now = new Date();
    const proposal = await (await getDatabase())
      .collection<PlanAdjustmentProposalDocument>("planAdjustmentProposals")
      .findOne(
        { userId: user.id, planId, status: "pending", expiresAt: { $gt: now } },
        { projection: { _id: 0 }, sort: { createdAt: -1 } },
      );
    return { proposal: proposal ? serializePlanAdjustmentProposal(proposal, now) : null };
  });

  app.post("/v1/plan-adjustments/:proposalId/reject", async (request): Promise<{ proposal: PlanAdjustmentProposal }> => {
    const user = await authenticate(request);
    const { proposalId } = planAdjustmentParams.parse(request.params);
    const database = await getDatabase();
    const now = new Date();
    const proposal = await database.collection<PlanAdjustmentProposalDocument>("planAdjustmentProposals")
      .findOne({ id: proposalId, userId: user.id }, { projection: { _id: 0 } });
    if (!proposal) notFound("Plan change not found");
    if (proposal.status === "applied") conflict("This plan change has already been applied");
    if (proposal.status === "pending") {
      await database.collection<PlanAdjustmentProposalDocument>("planAdjustmentProposals").updateOne(
        { id: proposalId, userId: user.id, status: "pending" },
        { $set: { status: "rejected", rejectedAt: now } },
      );
      proposal.status = "rejected";
      proposal.rejectedAt = now;
    }
    return { proposal: serializePlanAdjustmentProposal(proposal, now) };
  });

  app.post(
    "/v1/plan-adjustments/:proposalId/confirm",
    { config: { rateLimit: { max: 10, timeWindow: "10 minutes" } } },
    async (request): Promise<ConfirmPlanAdjustmentResponse> => {
      const user = await authenticate(request);
      const { proposalId } = planAdjustmentParams.parse(request.params);
      const database = await getDatabase();
      const now = new Date();
      const initialProposal = await database.collection<PlanAdjustmentProposalDocument>("planAdjustmentProposals")
        .findOne({ id: proposalId, userId: user.id }, { projection: { _id: 0 } });
      if (!initialProposal) notFound("Plan change not found");
      if (initialProposal.status === "rejected") conflict("This plan change was declined");
      if (initialProposal.status === "expired" || initialProposal.expiresAt <= now) {
        await database.collection<PlanAdjustmentProposalDocument>("planAdjustmentProposals").updateOne(
          { id: proposalId, userId: user.id, status: "pending" },
          { $set: { status: "expired" } },
        );
        conflict("This plan change expired; ask your coach to prepare it again");
      }

      let appliedProposal = initialProposal;
      let appliedPlan: WorkoutPlanDocument | null = null;
      let appliedWorkouts: PlannedWorkoutDocument[] = [];
      const client = await getMongoClient();
      await client.withSession(async (session) => {
        await session.withTransaction(async () => {
          const proposals = database.collection<PlanAdjustmentProposalDocument>("planAdjustmentProposals");
          const proposal = await proposals.findOne(
            { id: proposalId, userId: user.id },
            { projection: { _id: 0 }, session },
          );
          if (!proposal) notFound("Plan change not found");
          const plan = await database.collection<WorkoutPlanDocument>("workoutPlans").findOne(
            { id: proposal.planId, userId: user.id, status: "active" },
            { projection: { _id: 0 }, session },
          );
          if (!plan) conflict("The active plan changed; ask your coach for a new proposal");

          if (proposal.status === "applied") {
            appliedProposal = proposal;
            appliedPlan = plan;
            appliedWorkouts = await database.collection<PlannedWorkoutDocument>("plannedWorkouts")
              .find({ planId: plan.id, userId: user.id }, { projection: { _id: 0 }, session })
              .sort({ weekNumber: 1, scheduledFor: 1 })
              .toArray();
            return;
          }
          if (proposal.status !== "pending") conflict("This plan change is no longer pending");
          if ((plan.revision ?? 0) !== proposal.basePlanRevision) {
            conflict("The plan changed after this proposal was created; ask your coach to review it again");
          }
          const activeWorkout = await database.collection<WorkoutSessionDocument>("workoutSessions").findOne(
            { userId: user.id, status: { $in: ["active", "paused"] } },
            { projection: { _id: 1 }, session },
          );
          if (activeWorkout) conflict("Finish or abandon your active workout before changing the schedule");

          const workouts = await database.collection<PlannedWorkoutDocument>("plannedWorkouts")
            .find({ planId: plan.id, userId: user.id }, { projection: { _id: 0 }, session })
            .sort({ weekNumber: 1, dayOffset: 1 })
            .toArray();
          const workoutById = new Map(workouts.map((workout) => [workout.id, workout]));
          for (const change of proposal.changes) {
            const workout = workoutById.get(change.workoutId);
            if (!workout || workout.status !== "planned") {
              conflict(`${change.workoutName} can no longer be moved`);
            }
            if (workout.scheduledFor.toISOString().slice(0, 10) !== change.before) {
              conflict("The schedule changed after this proposal was created");
            }
          }

          const revisionFilter = proposal.basePlanRevision === 0
            ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] }
            : { revision: proposal.basePlanRevision };
          const planUpdate = await database.collection<WorkoutPlanDocument>("workoutPlans").updateOne(
            { id: plan.id, userId: user.id, status: "active", ...revisionFilter },
            {
              $set: {
                revision: proposal.basePlanRevision + 1,
                ...(proposal.newStartDate
                  ? { startDate: new Date(`${proposal.newStartDate}T00:00:00.000Z`) }
                  : {}),
              },
            },
            { session },
          );
          if (planUpdate.matchedCount !== 1) conflict("The plan changed while applying this proposal");
          await database.collection<PlannedWorkoutDocument>("plannedWorkouts").bulkWrite(
            proposal.changes.map((change) => ({
              updateOne: {
                filter: {
                  id: change.workoutId,
                  planId: plan.id,
                  userId: user.id,
                  status: "planned",
                  scheduledFor: new Date(`${change.before}T00:00:00.000Z`),
                },
                update: { $set: { scheduledFor: new Date(`${change.after}T00:00:00.000Z`) } },
              },
            })),
            { session },
          );
          const appliedAt = new Date();
          await proposals.updateOne(
            { id: proposal.id, userId: user.id, status: "pending" },
            { $set: { status: "applied", appliedAt } },
            { session },
          );
          await database.collection("planAdjustmentEvents").insertOne({
            id: randomUUID(),
            userId: user.id,
            planId: plan.id,
            proposalId: proposal.id,
            type: "plan_adjustment_applied",
            changes: proposal.changes,
            occurredAt: appliedAt,
          }, { session });
          appliedProposal = { ...proposal, status: "applied", appliedAt };
          appliedPlan = {
            ...plan,
            revision: proposal.basePlanRevision + 1,
            ...(proposal.newStartDate
              ? { startDate: new Date(`${proposal.newStartDate}T00:00:00.000Z`) }
              : {}),
          };
          const afterById = new Map(proposal.changes.map((change) => [change.workoutId, change.after]));
          appliedWorkouts = workouts.map((workout) => {
            const after = afterById.get(workout.id);
            return after ? { ...workout, scheduledFor: new Date(`${after}T00:00:00.000Z`) } : workout;
          });
        });
      });
      if (!appliedPlan) conflict("The plan change could not be applied");
      return {
        proposal: serializePlanAdjustmentProposal(appliedProposal, now),
        plan: serializePlan(appliedPlan),
        workouts: appliedWorkouts.map(serializeWorkout),
      };
    },
  );

  app.post(
    "/v1/coach/live-avatar-token",
    { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (request, reply): Promise<LiveCoachAvatarTokenResponse | void> => {
      await authenticate(request);
      const config = getConfig();
      if (!config.SIMLI_API_KEY || !config.SIMLI_FACE_ID) {
        await reply.code(503).send({
          message: "Photoreal coach video is not configured.",
        });
        return;
      }

      let response: Response;
      try {
        response = await fetch("https://api.simli.ai/compose/token", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-simli-api-key": config.SIMLI_API_KEY,
          },
          body: JSON.stringify({
            faceId: config.SIMLI_FACE_ID,
            handleSilence: true,
            maxSessionLength: 1_800,
            maxIdleTime: 180,
            model: "fasttalk",
          }),
          signal: AbortSignal.timeout(15_000),
        });
      } catch (cause) {
        request.log.warn({ cause }, "Simli session token request could not complete");
        await reply.code(502).send({
          message: "The photoreal coach provider could not be reached.",
        });
        return;
      }
      if (!response.ok) {
        request.log.warn({ status: response.status }, "Simli session token request failed");
        await reply.code(502).send({
          message: "The photoreal coach provider is temporarily unavailable.",
        });
        return;
      }
      const parsed = simliTokenResponse.safeParse(await response.json());
      if (!parsed.success) {
        request.log.warn("Simli returned an invalid session token response");
        await reply.code(502).send({
          message: "The photoreal coach provider returned an invalid response.",
        });
        return;
      }
      return { sessionToken: parsed.data.session_token };
    },
  );

  app.post(
    "/v1/coach/elevenlabs-session",
    { config: { rateLimit: { max: 6, timeWindow: "1 minute" } } },
    async (request, reply): Promise<ElevenLabsCoachSessionResponse | void> => {
      const user = await authenticate(request);
      const input = liveTokenInput.parse(request.body);
      await syncAuthenticatedUser(user);
      const database = await getDatabase();
      await requireThread(database, user.id, input.threadId);
      try {
        const providerSession = resolveElevenLabsSettings(user.id, database)
          .then((providerConfig) => createElevenLabsSignedUrl(providerConfig));
        const [snapshot, history, providerCredentials] = await Promise.all([
          loadLiveCoachSnapshot(database, user.id, input.sessionId),
          database.collection<CoachMessageDocument>("coachMessages")
            .find(
              { userId: user.id, threadId: input.threadId },
              { projection: { _id: 0, role: 1, content: 1, createdAt: 1 } },
            )
            .sort({ createdAt: -1 })
            .limit(80)
            .toArray(),
          providerSession,
        ]);
        const { agentId, signedUrl } = providerCredentials;
        const userName = user.name.trim() || "there";
        const now = new Date();
        const currentLocalDateTime = formatCoachLocalDateTime(now, input.timeZone);
        const sessionOpening = buildLiveCoachOpening(userName, now, input.timeZone);
        const chronologicalHistory = compactDatedLiveHistory(history, 24_000, input.timeZone)
          .map((turn) => `${turn.role === "user" ? "Member" : "Coach"}: ${turn.text}`)
          .join("\n");
        return {
          signedUrl,
          agentId,
          userName,
          dynamicVariables: {
            user_name: userName,
            session_opening: sessionOpening,
            member_context: JSON.stringify(snapshot),
            conversation_history: chronologicalHistory || "No earlier conversation was supplied.",
            current_local_datetime: currentLocalDateTime,
            user_timezone: input.timeZone,
          },
        };
      } catch (cause) {
        request.log.warn({ cause }, "ElevenLabs coach session could not be created");
        const statusCode = cause && typeof cause === "object" && "statusCode" in cause
          ? Number(cause.statusCode)
          : 502;
        const responseStatus = statusCode === 429 || statusCode === 503 ? statusCode : 502;
        const retryAfterSeconds = cause && typeof cause === "object" &&
            "retryAfterSeconds" in cause && Number.isFinite(Number(cause.retryAfterSeconds))
          ? Math.max(1, Math.ceil(Number(cause.retryAfterSeconds)))
          : null;
        if (responseStatus === 429 && retryAfterSeconds) {
          reply.header("retry-after", String(retryAfterSeconds));
        }
        await reply.code(responseStatus).send({
          message: cause instanceof Error ? cause.message : "ElevenLabs voice is unavailable.",
        });
      }
    },
  );

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
            { projection: { _id: 0, role: 1, content: 1, createdAt: 1 } },
          )
          .sort({ createdAt: -1 })
          .limit(80)
          .toArray(),
      ]);
      const config = getConfig();
      const geminiSettings = await resolveGeminiSettings(user.id, database);
      const now = new Date();
      const currentLocalDateTime = formatCoachLocalDateTime(now, input.timeZone);
      const sessionOpening = buildLiveCoachOpening(user.name, now, input.timeZone);
      const token = await createLiveCoachToken({
        apiKey: geminiSettings.apiKey,
        model: config.GEMINI_LIVE_MODEL,
        systemInstruction: liveCoachInstruction(
          snapshot,
          currentLocalDateTime,
          input.timeZone,
        ),
      });
      return {
        ...token,
        voiceName: config.GEMINI_LIVE_VOICE,
        sessionOpening,
        initialHistory: compactDatedLiveHistory(history, 24_000, input.timeZone),
      };
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
    "/v1/coach/live-camera-analysis",
    {
      bodyLimit: 1_350_000,
      config: { rateLimit: { max: 6, timeWindow: "1 minute" } },
    },
    async (request): Promise<LiveCameraAnalysisResponse> => {
      const user = await authenticate(request);
      const input = liveCameraAnalysisInput.parse(request.body);
      const image = Buffer.from(input.imageBase64, "base64");
      if (!image.length || image.length > 900_000) {
        badRequest("The camera frame is too large to analyze");
      }
      if (!attachmentSignatureMatches(input.mimeType, image)) {
        badRequest("The camera frame is not a valid JPEG image");
      }
      const snapshot = await loadLiveCoachSnapshot(
        await getDatabase(),
        user.id,
        input.sessionId,
      );
      const aiSettings = await resolveAISettings(user.id);
      const analysis = await analyzeCameraFrame({
        provider: aiSettings,
        focus: input.focus,
        memberContext: snapshot,
        imageBase64: input.imageBase64,
        mimeType: input.mimeType,
        dimensions: { width: input.width, height: input.height },
      });
      return {
        ...analysis,
        capturedAt: new Date().toISOString(),
      };
    },
  );

  app.post(
    "/v1/coach/live-attachment-review",
    { config: { rateLimit: { max: 12, timeWindow: "1 minute" } } },
    async (request): Promise<LiveAttachmentReviewResponse> => {
      const user = await authenticate(request);
      const input = liveAttachmentReviewInput.parse(request.body);
      const database = await getDatabase();
      await requireThread(database, user.id, input.threadId);
      const attachments = await database.collection<CoachAttachmentDocument>("coachAttachments")
        .find(
          { userId: user.id, threadId: input.threadId },
          { projection: { _id: 0 } },
        )
        .sort({ createdAt: -1 })
        .limit(maxAttachmentsPerMessage)
        .toArray();
      if (!attachments.length) notFound("No uploaded file is available in this conversation");
      const result = await generateReply(
        database,
        user,
        input.threadId,
        input.question,
        new Date(),
        randomUUID(),
        attachments,
        input.sessionId,
      );
      return {
        attachments: attachments.map(serializeAttachment),
        review: result.reply,
      };
    },
  );

  app.post(
    "/v1/coach/generated-pdfs",
    { config: { rateLimit: { max: 8, timeWindow: "1 minute" } } },
    async (request): Promise<GeneratedCoachPdfResponse> => {
      const user = await authenticate(request);
      const input = generatedPdfInput.parse(request.body);
      const database = await getDatabase();
      await requireThread(database, user.id, input.threadId);
      const createdAt = new Date();
      const messageId = randomUUID();
      const attachment = await buildGeneratedPdfAttachment({
        userId: user.id,
        threadId: input.threadId,
        messageId,
        title: input.title,
        content: input.content,
        createdAt,
      });
      await database.collection<CoachAttachmentDocument>("coachAttachments").insertOne(attachment);
      const message: CoachMessageDocument = {
        id: messageId,
        userId: user.id,
        threadId: input.threadId,
        sessionId: null,
        role: "assistant",
        content: `Your PDF is ready: ${attachment.name}`,
        attachments: [serializeAttachment(attachment)],
        safetyCategory: "none",
        model: "forgefit:pdf-renderer",
        createdAt,
      };
      try {
        await database.collection<CoachMessageDocument>("coachMessages").insertOne(message);
        await database.collection<CoachAttachmentDocument>("coachAttachments").updateOne(
          { id: attachment.id, userId: user.id },
          { $unset: { expiresAt: "" } },
        );
      } catch (cause) {
        request.log.error({ cause }, "Generated PDF could not be attached to the conversation");
        throw cause;
      }
      await updateThreadStats(database, user.id, input.threadId);
      return {
        attachment: serializeAttachment(attachment),
        thread: await loadThreadDetail(database, user.id, input.threadId),
      };
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
      const recordedModel = input.provider === "elevenlabs"
        ? `elevenlabs:${(await resolveElevenLabsSettings(user.id, database)).ELEVENLABS_LLM_MODEL}`
        : getConfig().GEMINI_LIVE_MODEL;
      const liveMessages = database.collection<CoachMessageDocument>("coachMessages");
      const clientTurnId = input.clientTurnId ?? randomUUID();
      await Promise.all([
        liveMessages.updateOne(
          { userId: user.id, clientTurnId, role: "user" },
          { $setOnInsert: {
            id: randomUUID(),
            userId: user.id,
            threadId: input.threadId,
            sessionId: input.sessionId ?? null,
            role: "user",
            content: input.userTranscript,
            safetyCategory: safety?.safetyCategory ?? "none",
            createdAt: now,
            editedAt: null,
            clientTurnId,
          } },
          { upsert: true },
        ),
        liveMessages.updateOne(
          { userId: user.id, clientTurnId, role: "assistant" },
          { $setOnInsert: {
            id: randomUUID(),
            userId: user.id,
            threadId: input.threadId,
            sessionId: input.sessionId ?? null,
            role: "assistant",
            content: input.assistantTranscript,
            safetyCategory: safety?.safetyCategory ?? "none",
            model: recordedModel,
            createdAt: new Date(now.getTime() + 1),
            clientTurnId,
          } },
          { upsert: true },
        ),
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
    const thread = createThreadDocument(user.id, input.title, input.scope);
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
      const database = await getDatabase();
      if (input.threadId) await requireThread(database, user.id, input.threadId);
      const attachment: CoachAttachmentDocument = {
        id: randomUUID(),
        userId: user.id,
        messageId: null,
        threadId: input.threadId ?? null,
        name: safeAttachmentName(input.name),
        mimeType: input.mimeType,
        size: data.length,
        data: new Binary(data),
        createdAt: now,
        expiresAt: new Date(now.getTime() + attachmentLifetimeMs),
      };
      await database
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
        userMessage.id,
        attachmentDocuments,
        input.sessionId,
        {
          planId: input.planId,
          weekNumber: input.weekNumber,
          workoutId: input.workoutId,
        },
      );
      const assistantMessageId = randomUUID();
      const generatedPdf = shouldGenerateCoachPdf(input.message)
        ? await buildGeneratedPdfAttachment({
            userId: user.id,
            threadId: thread.id,
            messageId: assistantMessageId,
            title: `ForgeFit Coach - ${titleFromMessage(input.message)}`,
            content: result.reply,
            createdAt: new Date(),
          })
        : null;
      const assistantMessage: CoachMessageDocument = {
        id: assistantMessageId,
        userId: user.id,
        threadId: thread.id,
        sessionId: input.sessionId ?? null,
        role: "assistant",
        content: generatedPdf
          ? `${result.reply}\n\nYour downloadable PDF is attached to this message.`
          : result.reply,
        attachments: generatedPdf ? [serializeAttachment(generatedPdf)] : [],
        safetyCategory: result.safetyCategory,
        model: result.model,
        createdAt: new Date(),
      };
      if (generatedPdf) {
        await database.collection<CoachAttachmentDocument>("coachAttachments").insertOne(generatedPdf);
      }
      await database
        .collection<CoachMessageDocument>("coachMessages")
        .insertOne(assistantMessage);
      if (generatedPdf) {
        await database.collection<CoachAttachmentDocument>("coachAttachments").updateOne(
          { id: generatedPdf.id, userId: user.id },
          { $unset: { expiresAt: "" } },
        );
      }

      const updatedThread = await updateThreadStats(database, user.id, thread.id);
      return {
        thread: serializeThread(updatedThread),
        userMessage: serializeMessage(userMessage),
        message: serializeMessage(assistantMessage),
        shouldPauseWorkout: result.shouldPauseWorkout,
        suggestedAdjustment: result.suggestedAdjustment,
        planAdjustmentProposal: result.planAdjustmentProposal,
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
        existing.id,
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
