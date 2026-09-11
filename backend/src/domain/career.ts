import type {
  CareerApplication,
  CareerApplicationStatus,
  CareerInterviewFeedback,
  CareerInterviewSession,
  CareerInterviewTurn,
  CareerProfile,
  CareerProgress,
  CareerTargetRole,
  CreateCareerApplicationRequest,
  CreateCareerTargetRequest,
  SaveCareerProfileRequest,
  StartCareerInterviewRequest,
} from "@fitai/contracts";
import { randomUUID } from "node:crypto";

export type CareerProfileDocument = Omit<CareerProfile, "createdAt" | "updatedAt"> & {
  userId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CareerTargetRoleDocument = Omit<CareerTargetRole, "createdAt" | "updatedAt"> & {
  userId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CareerApplicationStatusEvent = {
  status: CareerApplicationStatus;
  occurredAt: Date;
};

export type CareerApplicationDocument = Omit<
  CareerApplication,
  "statusChangedAt" | "createdAt" | "updatedAt"
> & {
  userId: string;
  statusChangedAt: Date;
  statusHistory: CareerApplicationStatusEvent[];
  createdAt: Date;
  updatedAt: Date;
};

export type CareerInterviewSessionDocument = Omit<
  CareerInterviewSession,
  "startedAt" | "completedAt" | "updatedAt"
> & {
  userId: string;
  activeSlot: string | null;
  startedAt: Date;
  completedAt: Date | null;
  updatedAt: Date;
};

export class CareerStateError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 409) {
    super(message);
    this.name = "CareerStateError";
    this.statusCode = statusCode;
  }
}

export function serializeCareerProfile(document: CareerProfileDocument): CareerProfile {
  return {
    headline: document.headline,
    location: document.location,
    workMode: document.workMode,
    yearsExperience: document.yearsExperience,
    skills: [...document.skills],
    strengths: document.strengths,
    constraints: document.constraints,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export function serializeCareerTarget(document: CareerTargetRoleDocument): CareerTargetRole {
  return {
    id: document.id,
    title: document.title,
    seniority: document.seniority,
    location: document.location,
    workMode: document.workMode,
    mustHaveSkills: [...document.mustHaveSkills],
    notes: document.notes,
    status: document.status,
    isPrimary: document.isPrimary,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export function serializeCareerApplication(document: CareerApplicationDocument): CareerApplication {
  return {
    id: document.id,
    targetRoleId: document.targetRoleId,
    company: document.company,
    roleTitle: document.roleTitle,
    sourceUrl: document.sourceUrl,
    status: document.status,
    nextAction: document.nextAction,
    nextActionDue: document.nextActionDue,
    notes: document.notes,
    statusChangedAt: document.statusChangedAt.toISOString(),
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export function serializeCareerInterview(document: CareerInterviewSessionDocument): CareerInterviewSession {
  return {
    id: document.id,
    targetRoleId: document.targetRoleId,
    botId: document.botId,
    format: document.format,
    competencies: [...document.competencies],
    plannedMinutes: document.plannedMinutes,
    status: document.status,
    turns: document.turns.map((turn) => ({ ...turn })),
    feedback: document.feedback ? structuredClone(document.feedback) : null,
    model: document.model,
    startedAt: document.startedAt.toISOString(),
    completedAt: document.completedAt?.toISOString() ?? null,
    updatedAt: document.updatedAt.toISOString(),
  };
}

export function createCareerProfileDocument(
  userId: string,
  input: SaveCareerProfileRequest,
  existing: CareerProfileDocument | null,
  now = new Date(),
): CareerProfileDocument {
  return {
    ...input,
    userId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
}

export function createCareerTargetDocument(
  userId: string,
  input: CreateCareerTargetRequest,
  isFirstTarget: boolean,
  now = new Date(),
): CareerTargetRoleDocument {
  return {
    id: randomUUID(),
    userId,
    title: input.title,
    seniority: input.seniority,
    location: input.location,
    workMode: input.workMode,
    mustHaveSkills: [...input.mustHaveSkills],
    notes: input.notes,
    status: "active",
    isPrimary: isFirstTarget || input.isPrimary === true,
    createdAt: now,
    updatedAt: now,
  };
}

export function createCareerApplicationDocument(
  userId: string,
  input: CreateCareerApplicationRequest,
  now = new Date(),
): CareerApplicationDocument {
  return {
    id: randomUUID(),
    userId,
    targetRoleId: input.targetRoleId,
    company: input.company,
    roleTitle: input.roleTitle,
    sourceUrl: input.sourceUrl,
    status: input.status,
    nextAction: input.nextAction,
    nextActionDue: input.nextActionDue,
    notes: input.notes,
    statusChangedAt: now,
    statusHistory: [{ status: input.status, occurredAt: now }],
    createdAt: now,
    updatedAt: now,
  };
}

const applicationTransitions: Record<CareerApplicationStatus, CareerApplicationStatus[]> = {
  saved: ["preparing", "withdrawn"],
  preparing: ["saved", "applied", "withdrawn"],
  applied: ["interviewing", "offer", "rejected", "withdrawn"],
  interviewing: ["offer", "rejected", "withdrawn"],
  offer: ["accepted", "rejected", "withdrawn"],
  accepted: [],
  rejected: ["saved"],
  withdrawn: ["saved"],
};

export function assertCareerApplicationTransition(
  current: CareerApplicationStatus,
  next: CareerApplicationStatus,
) {
  if (current === next) return;
  if (!applicationTransitions[current].includes(next)) {
    throw new CareerStateError(`Application cannot move from ${current} to ${next}`);
  }
}

export function createCareerInterviewDocument(
  userId: string,
  input: StartCareerInterviewRequest,
  now = new Date(),
): CareerInterviewSessionDocument {
  return {
    id: randomUUID(),
    userId,
    activeSlot: userId,
    targetRoleId: input.targetRoleId,
    botId: input.botId,
    format: input.format,
    competencies: [...input.competencies],
    plannedMinutes: input.plannedMinutes,
    status: "active",
    turns: [],
    feedback: null,
    model: null,
    startedAt: now,
    completedAt: null,
    updatedAt: now,
  };
}

export function completeCareerInterview(
  session: CareerInterviewSessionDocument,
  turns: CareerInterviewTurn[],
  feedback: CareerInterviewFeedback,
  model: string,
  now = new Date(),
): CareerInterviewSessionDocument {
  if (session.status !== "active") {
    throw new CareerStateError("This interview practice session is already closed");
  }
  return {
    ...session,
    activeSlot: null,
    status: "completed",
    turns: turns.map((turn) => ({ ...turn })),
    feedback,
    model,
    completedAt: now,
    updatedAt: now,
  };
}

export function abandonCareerInterview(
  session: CareerInterviewSessionDocument,
  now = new Date(),
): CareerInterviewSessionDocument {
  if (session.status !== "active") {
    throw new CareerStateError("This interview practice session is already closed");
  }
  return {
    ...session,
    activeSlot: null,
    status: "abandoned",
    completedAt: now,
    updatedAt: now,
  };
}

export function groundInterviewFeedback(
  feedback: Omit<CareerInterviewFeedback, "groundedEvidenceCount">,
  turns: CareerInterviewTurn[],
): CareerInterviewFeedback {
  const userTranscript = turns
    .filter((turn) => turn.role === "user")
    .map((turn) => turn.content.replace(/\s+/g, " ").trim().toLocaleLowerCase())
    .join("\n");
  const rubric = feedback.rubric.map((item) => {
    const excerpt = item.evidenceExcerpt?.replace(/\s+/g, " ").trim() || null;
    return {
      ...item,
      evidenceExcerpt: excerpt && userTranscript.includes(excerpt.toLocaleLowerCase())
        ? excerpt
        : null,
    };
  });
  return {
    ...feedback,
    rubric,
    groundedEvidenceCount: rubric.filter((item) => item.evidenceExcerpt).length,
  };
}

export function calculateCareerProgress(
  applicationCounts: Partial<Record<CareerApplicationStatus, number>>,
  completedInterviews: Array<{ feedback?: CareerInterviewFeedback | null }>,
): CareerProgress {
  const statuses: CareerApplicationStatus[] = [
    "saved", "preparing", "applied", "interviewing", "offer", "accepted", "rejected", "withdrawn",
  ];
  const scores = completedInterviews
    .map((session) => session.feedback?.overallScore)
    .filter((score): score is number => typeof score === "number" && Number.isFinite(score));
  return {
    applicationCounts: Object.fromEntries(statuses.map((status) => [status, applicationCounts[status] ?? 0])) as Record<CareerApplicationStatus, number>,
    completedInterviews: completedInterviews.length,
    averageInterviewScore: scores.length
      ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1))
      : null,
  };
}

export function careerNextAction({
  hasProfile,
  targetCount,
  applicationCounts,
  completedInterviews,
}: {
  hasProfile: boolean;
  targetCount: number;
  applicationCounts: Partial<Record<CareerApplicationStatus, number>>;
  completedInterviews: number;
}) {
  if (!hasProfile) return "complete_profile" as const;
  if (targetCount === 0) return "choose_target" as const;
  if ((applicationCounts.preparing ?? 0) > 0) return "prepare_application" as const;
  if ((applicationCounts.applied ?? 0) > 0 || (applicationCounts.interviewing ?? 0) > 0 || completedInterviews > 0) {
    return "practice_interview" as const;
  }
  return "find_roles" as const;
}
