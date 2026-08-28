import { randomUUID } from "node:crypto";
import { planVolumeTargetsFor, type GeneratedPlanDraft } from "@fitai/ai";
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
  const volumeTargets = planVolumeTargetsFor(profile);
  const weekNumbers = draft.weeks.map((week) => week.weekNumber);
  const expectedWeeks = Array.from(
    { length: profile.programDurationWeeks },
    (_, index) => index + 1,
  );
  if (
    new Set(weekNumbers).size !== profile.programDurationWeeks
    || !expectedWeeks.every((week) => weekNumbers.includes(week))
  ) {
    throw new PlanValidationError(
      `The plan must contain weeks 1 through ${profile.programDurationWeeks} exactly once`,
    );
  }
  if (draft.weeklyProgression.length !== profile.programDurationWeeks) {
    throw new PlanValidationError(
      `The plan needs one progression note for each of its ${profile.programDurationWeeks} weeks`,
    );
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

      if (day.exercises.length < volumeTargets.minExercisesPerSession) {
        throw new PlanValidationError(
          `${day.name} needs at least ${volumeTargets.minExercisesPerSession} movements for this training level and session length`,
        );
      }
      if (day.exercises.length > volumeTargets.maxExercisesPerSession) {
        throw new PlanValidationError(
          `${day.name} exceeds ${volumeTargets.maxExercisesPerSession} movements for this training level and session length`,
        );
      }

      const totalSets = day.exercises.reduce((sum, exercise) => sum + exercise.sets, 0);
      if (totalSets < volumeTargets.minWorkingSetsPerSession) {
        throw new PlanValidationError(
          `${day.name} needs at least ${volumeTargets.minWorkingSetsPerSession} working sets for this training level and session length`,
        );
      }
      if (totalSets > volumeTargets.maxWorkingSetsPerSession) {
        throw new PlanValidationError(
          `${day.name} exceeds the ${volumeTargets.maxWorkingSetsPerSession}-set session limit`,
        );
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

  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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
    experienceLevel: profile.experienceLevel,
    trainingPhase: profile.trainingPhase,
    restoredFromVersion: null,
    title: draft.title,
    summary: draft.summary,
    startDate,
    durationWeeks: profile.programDurationWeeks,
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
    experienceLevel: plan.experienceLevel ?? null,
    trainingPhase: plan.trainingPhase ?? null,
    restoredFromVersion: plan.restoredFromVersion ?? null,
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

export function reschedulePlan({
  plan,
  workouts,
  startDate,
}: {
  plan: WorkoutPlanDocument;
  workouts: PlannedWorkoutDocument[];
  startDate: Date;
}) {
  return {
    plan: { ...plan, startDate },
    workouts: workouts.map((workout) => {
      const scheduledFor = new Date(startDate);
      scheduledFor.setUTCDate(
        startDate.getUTCDate() + (workout.weekNumber - 1) * 7 + workout.dayOffset,
      );
      return { ...workout, scheduledFor };
    }),
  };
}

export function restorePlanVersion({
  sourcePlan,
  sourceWorkouts,
  userId,
  version,
  startDate,
  now = new Date(),
}: {
  sourcePlan: WorkoutPlanDocument;
  sourceWorkouts: PlannedWorkoutDocument[];
  userId: string;
  version: number;
  startDate: Date;
  now?: Date;
}) {
  if (sourcePlan.userId !== userId || sourceWorkouts.some((workout) => workout.userId !== userId)) {
    throw new PlanValidationError("Plan version not found");
  }
  if (sourceWorkouts.length === 0) {
    throw new PlanValidationError("This plan version has no workouts to restore");
  }

  const planId = randomUUID();
  const plan: WorkoutPlanDocument = {
    ...sourcePlan,
    id: planId,
    userId,
    version,
    status: "active",
    restoredFromVersion: sourcePlan.version,
    startDate,
    createdAt: now,
  };
  const workouts = [...sourceWorkouts]
    .sort((left, right) => left.weekNumber - right.weekNumber || left.dayOffset - right.dayOffset)
    .map((sourceWorkout) => {
      const scheduledFor = new Date(startDate);
      scheduledFor.setUTCDate(
        startDate.getUTCDate() + (sourceWorkout.weekNumber - 1) * 7 + sourceWorkout.dayOffset,
      );
      return {
        ...sourceWorkout,
        id: randomUUID(),
        planId,
        userId,
        scheduledFor,
        exercises: sourceWorkout.exercises.map((exercise) => ({
          ...exercise,
          video: exercise.video ? { ...exercise.video } : null,
        })),
        status: "planned" as const,
        createdAt: now,
      } satisfies PlannedWorkoutDocument;
    });

  return { plan, workouts };
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
