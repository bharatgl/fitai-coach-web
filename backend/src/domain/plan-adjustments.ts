import { randomUUID } from "node:crypto";
import type { PlanAdjustmentProposalDraft } from "@fitai/ai";
import type {
  PlanAdjustmentChange,
  PlanAdjustmentProposal,
  PlanAdjustmentProposalStatus,
} from "@fitai/contracts";
import {
  PlanValidationError,
  reschedulePlan,
  resolvePlanStartDate,
  type PlannedWorkoutDocument,
  type WorkoutPlanDocument,
} from "./plans.js";

const proposalLifetimeMs = 24 * 60 * 60 * 1_000;
const maximumScheduleShiftDays = 14;

export type PlanAdjustmentProposalDocument = {
  id: string;
  userId: string;
  threadId: string;
  sourceMessageId: string;
  planId: string;
  basePlanRevision: number;
  action: PlanAdjustmentProposal["action"];
  newStartDate: string | null;
  status: PlanAdjustmentProposalStatus;
  summary: string;
  rationale: string;
  changes: PlanAdjustmentChange[];
  createdAt: Date;
  expiresAt: Date;
  appliedAt: Date | null;
  rejectedAt: Date | null;
};

function calendarDate(value: string) {
  return resolvePlanStartDate(value);
}

function dateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function shiftDays(before: string, after: string) {
  return Math.abs(calendarDate(after).getTime() - calendarDate(before).getTime()) / 86_400_000;
}

function validateMoveDates(changes: PlanAdjustmentChange[], workouts: PlannedWorkoutDocument[]) {
  const afterById = new Map(changes.map((change) => [change.workoutId, change.after]));
  const datesByWeek = new Map<number, Set<string>>();
  for (const workout of workouts) {
    const date = afterById.get(workout.id) ?? dateKey(workout.scheduledFor);
    const weekDates = datesByWeek.get(workout.weekNumber) ?? new Set<string>();
    if (weekDates.has(date)) {
      throw new PlanValidationError("The proposed change puts two workouts on the same date");
    }
    weekDates.add(date);
    datesByWeek.set(workout.weekNumber, weekDates);
  }
}

export function createPlanAdjustmentProposal({
  draft,
  plan,
  workouts,
  userId,
  threadId,
  sourceMessageId,
  now = new Date(),
}: {
  draft: PlanAdjustmentProposalDraft;
  plan: WorkoutPlanDocument;
  workouts: PlannedWorkoutDocument[];
  userId: string;
  threadId: string;
  sourceMessageId: string;
  now?: Date;
}): PlanAdjustmentProposalDocument {
  if (plan.userId !== userId || plan.status !== "active") {
    throw new PlanValidationError("Active plan not found");
  }
  if (!workouts.length || workouts.some((workout) => workout.userId !== userId || workout.planId !== plan.id)) {
    throw new PlanValidationError("The proposal referenced an unavailable workout");
  }

  let changes: PlanAdjustmentChange[];
  if (draft.action === "move_workouts") {
    if (!draft.moves.length || draft.newStartDate !== null) {
      throw new PlanValidationError("A workout move needs exact workout IDs and dates");
    }
    const workoutById = new Map(workouts.map((workout) => [workout.id, workout]));
    if (new Set(draft.moves.map((move) => move.workoutId)).size !== draft.moves.length) {
      throw new PlanValidationError("The proposal contains the same workout more than once");
    }
    changes = draft.moves.map((move) => {
      const workout = workoutById.get(move.workoutId);
      if (!workout) throw new PlanValidationError("The proposal referenced an unavailable workout");
      if (workout.status !== "planned") {
        throw new PlanValidationError(`${workout.name} can no longer be moved`);
      }
      const before = dateKey(workout.scheduledFor);
      const after = dateKey(calendarDate(move.scheduledFor));
      if (shiftDays(before, after) > maximumScheduleShiftDays) {
        throw new PlanValidationError("A workout cannot be moved more than 14 days at once");
      }
      return { workoutId: workout.id, workoutName: workout.name, before, after };
    }).filter((change) => change.before !== change.after);
    if (!changes.length) throw new PlanValidationError("The proposed schedule is already saved");
    validateMoveDates(changes, workouts);
  } else {
    if (draft.moves.length || !draft.newStartDate) {
      throw new PlanValidationError("A plan reschedule needs one new start date");
    }
    if (workouts.some((workout) => workout.status !== "planned")) {
      throw new PlanValidationError("A plan with started or completed workouts cannot be shifted as a whole");
    }
    const newStartDate = calendarDate(draft.newStartDate);
    if (shiftDays(dateKey(plan.startDate), dateKey(newStartDate)) > maximumScheduleShiftDays) {
      throw new PlanValidationError("A plan cannot be shifted more than 14 days at once");
    }
    const rescheduled = reschedulePlan({ plan, workouts, startDate: newStartDate });
    changes = rescheduled.workouts.map((workout) => {
      const current = workouts.find((item) => item.id === workout.id)!;
      return {
        workoutId: workout.id,
        workoutName: workout.name,
        before: dateKey(current.scheduledFor),
        after: dateKey(workout.scheduledFor),
      };
    }).filter((change) => change.before !== change.after);
    if (!changes.length) throw new PlanValidationError("The proposed schedule is already saved");
  }

  return {
    id: randomUUID(),
    userId,
    threadId,
    sourceMessageId,
    planId: plan.id,
    basePlanRevision: plan.revision ?? 0,
    action: draft.action,
    newStartDate: draft.action === "reschedule_plan" ? draft.newStartDate : null,
    status: "pending",
    summary: changes.length === 1
      ? `Move ${changes[0]!.workoutName}`
      : `Move ${changes.length} workouts`,
    rationale: draft.rationale.trim(),
    changes,
    createdAt: now,
    expiresAt: new Date(now.getTime() + proposalLifetimeMs),
    appliedAt: null,
    rejectedAt: null,
  };
}

export function serializePlanAdjustmentProposal(
  proposal: PlanAdjustmentProposalDocument,
  now = new Date(),
): PlanAdjustmentProposal {
  const status = proposal.status === "pending" && proposal.expiresAt <= now
    ? "expired"
    : proposal.status;
  return {
    id: proposal.id,
    planId: proposal.planId,
    basePlanRevision: proposal.basePlanRevision,
    action: proposal.action,
    status,
    summary: proposal.summary,
    rationale: proposal.rationale,
    changes: proposal.changes,
    createdAt: proposal.createdAt.toISOString(),
    expiresAt: proposal.expiresAt.toISOString(),
    appliedAt: proposal.appliedAt?.toISOString() ?? null,
  };
}
