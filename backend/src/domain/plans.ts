import { randomUUID } from "node:crypto";
import type { GeneratedPlanDraft } from "@fitai/ai";
import type {
  PlannedWorkout,
  UserProfile,
  WorkoutPlan,
} from "@fitai/contracts";
import {
  exerciseVideoForId,
  type ExerciseDefinition,
} from "./exercise-catalog.js";

export type WorkoutPlanDocument = Omit<WorkoutPlan, "startDate" | "createdAt"> & {
  userId: string;
  startDate: Date;
  createdAt: Date;
  model: string;
};

export type PlannedWorkoutDocument = Omit<PlannedWorkout, "scheduledFor"> & {
  userId: string;
  scheduledFor: Date;
  createdAt: Date;
};

export class PlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanValidationError";
  }
}

function prescriptionSignature(
  day: GeneratedPlanDraft["weeks"][number]["days"][number],
) {
  return JSON.stringify(
    day.exercises.map(({ exerciseId, sets, repRange, tempo }) => ({
      exerciseId,
      sets,
      repRange,
      tempo,
    })),
  );
}

export function validatePlanDraft(
  draft: GeneratedPlanDraft,
  profile: UserProfile,
  catalog: ExerciseDefinition[],
) {
  const weekNumbers = draft.weeks.map((week) => week.weekNumber);
  if (new Set(weekNumbers).size !== 4 || ![1, 2, 3, 4].every((week) => weekNumbers.includes(week))) {
    throw new PlanValidationError("The plan must contain weeks 1 through 4 exactly once");
  }

  const allowed = new Set(catalog.map((exercise) => exercise.id));
  let previousWeekSignature = "";

  for (const week of [...draft.weeks].sort((a, b) => a.weekNumber - b.weekNumber)) {
    if (week.days.length !== profile.trainingDaysPerWeek) {
      throw new PlanValidationError(
        `Expected ${profile.trainingDaysPerWeek} training days in week ${week.weekNumber}, received ${week.days.length}`,
      );
    }

    const offsets = week.days.map((day) => day.dayOffset);
    if (new Set(offsets).size !== offsets.length) {
      throw new PlanValidationError(`Week ${week.weekNumber} must use unique day offsets`);
    }

    for (const day of week.days) {
      if (day.estimatedMinutes > profile.preferredSessionMinutes) {
        throw new PlanValidationError(
          `${day.name} exceeds the preferred session duration`,
        );
      }

      const exerciseIds = day.exercises.map((exercise) => exercise.exerciseId);
      if (new Set(exerciseIds).size !== exerciseIds.length) {
        throw new PlanValidationError(`${day.name} contains a duplicate exercise`);
      }

      const totalSets = day.exercises.reduce((sum, exercise) => sum + exercise.sets, 0);
      if (totalSets > 30) {
        throw new PlanValidationError(`${day.name} exceeds the safe volume limit`);
      }

      for (const exercise of day.exercises) {
        if (!allowed.has(exercise.exerciseId)) {
          throw new PlanValidationError(
            `The plan referenced unavailable exercise ${exercise.exerciseId}`,
          );
        }
        if (/\b(1\s*rm|one.rep max|to failure|maximal effort)\b/i.test(exercise.repRange)) {
          throw new PlanValidationError(
            `${exercise.exerciseId} uses a disallowed maximal prescription`,
          );
        }
      }
    }

    const daySignatures = week.days.map(prescriptionSignature);
    if (new Set(daySignatures).size !== daySignatures.length) {
      throw new PlanValidationError(
        `Week ${week.weekNumber} contains the same workout on multiple dates`,
      );
    }

    const weekSignature = JSON.stringify(
      [...week.days]
        .sort((a, b) => a.dayOffset - b.dayOffset)
        .map((day) => ({
          dayOffset: day.dayOffset,
          prescription: prescriptionSignature(day),
        })),
    );
    if (previousWeekSignature === weekSignature) {
      throw new PlanValidationError(`Week ${week.weekNumber} duplicates the previous week's prescriptions`);
    }
    previousWeekSignature = weekSignature;
  }
}

export function resolvePlanStartDate(value: string | undefined, now = new Date()) {
  if (value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new PlanValidationError("startDate must use YYYY-MM-DD format");
    }
    const parsed = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
      throw new PlanValidationError("startDate is not a valid calendar date");
    }
    return parsed;
  }

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const daysUntilMonday = (8 - today.getUTCDay()) % 7;
  today.setUTCDate(today.getUTCDate() + daysUntilMonday);
  return today;
}

export function materializePlan({
  draft,
  profile,
  catalog,
  userId,
  version,
  model,
  startDate,
  now = new Date(),
}: {
  draft: GeneratedPlanDraft;
  profile: UserProfile;
  catalog: ExerciseDefinition[];
  userId: string;
  version: number;
  model: string;
  startDate: Date;
  now?: Date;
}) {
  validatePlanDraft(draft, profile, catalog);
  const planId = randomUUID();
  const exerciseById = new Map(catalog.map((exercise) => [exercise.id, exercise]));
  const plan: WorkoutPlanDocument = {
    id: planId,
    userId,
    version,
    status: "active",
    title: draft.title,
    summary: draft.summary,
    startDate,
    durationWeeks: 4,
    daysPerWeek: profile.trainingDaysPerWeek,
    rationale: draft.rationale,
    weeklyProgression: draft.weeklyProgression,
    model,
    createdAt: now,
  };

  const workouts: PlannedWorkoutDocument[] = [];
  for (const week of [...draft.weeks].sort((a, b) => a.weekNumber - b.weekNumber)) {
    for (const day of [...week.days].sort((a, b) => a.dayOffset - b.dayOffset)) {
      const scheduledFor = new Date(startDate);
      scheduledFor.setUTCDate(startDate.getUTCDate() + (week.weekNumber - 1) * 7 + day.dayOffset);
      workouts.push({
        id: randomUUID(),
        planId,
        userId,
        weekNumber: week.weekNumber,
        dayOffset: day.dayOffset,
        name: day.name,
        focus: day.focus,
        scheduledFor,
        estimatedMinutes: day.estimatedMinutes,
        exercises: day.exercises.map((exercise) => ({
          ...exercise,
          name: exerciseById.get(exercise.exerciseId)!.name,
          video: exerciseById.get(exercise.exerciseId)!.video,
        })),
        status: "planned",
        createdAt: now,
      });
    }
  }

  return { plan, workouts };
}

export function serializePlan(plan: WorkoutPlanDocument): WorkoutPlan {
  return {
    id: plan.id,
    version: plan.version,
    status: plan.status,
    title: plan.title,
    summary: plan.summary,
    startDate: plan.startDate.toISOString().slice(0, 10),
    durationWeeks: plan.durationWeeks,
    daysPerWeek: plan.daysPerWeek,
    rationale: plan.rationale,
    weeklyProgression: plan.weeklyProgression,
    createdAt: plan.createdAt.toISOString(),
  };
}

export function serializeWorkout(workout: PlannedWorkoutDocument): PlannedWorkout {
  return {
    id: workout.id,
    planId: workout.planId,
    weekNumber: workout.weekNumber,
    dayOffset: workout.dayOffset,
    name: workout.name,
    focus: workout.focus,
    scheduledFor: workout.scheduledFor.toISOString(),
    estimatedMinutes: workout.estimatedMinutes,
    exercises: workout.exercises.map((exercise) => ({
      ...exercise,
      video: exercise.video ?? exerciseVideoForId(exercise.exerciseId),
    })),
    status: workout.status,
  };
}
