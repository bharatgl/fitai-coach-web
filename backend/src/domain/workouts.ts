import { randomUUID } from "node:crypto";
import type {
  WorkoutProgress,
  WorkoutSession,
  WorkoutSessionExercise,
  WorkoutSetLog,
} from "@fitai/contracts";
import type { ExerciseDefinition } from "./exercise-catalog.js";
import type { PlannedWorkoutDocument } from "./plans.js";

type WorkoutSetLogDocument = Omit<WorkoutSetLog, "completedAt"> & {
  completedAt: Date;
};

type WorkoutSessionExerciseDocument = Omit<WorkoutSessionExercise, "sets"> & {
  sets: WorkoutSetLogDocument[];
};

export type WorkoutSessionDocument = Omit<
  WorkoutSession,
  "exercises" | "startedAt" | "pausedAt" | "completedAt" | "durationSeconds"
> & {
  userId: string;
  activeSlot: string | null;
  exercises: WorkoutSessionExerciseDocument[];
  scheduledFor: Date;
  startedAt: Date;
  pausedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  version: number;
};

export class WorkoutStateError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 409) {
    super(message);
    this.name = "WorkoutStateError";
    this.statusCode = statusCode;
  }
}

function assertMutable(session: WorkoutSessionDocument) {
  if (session.status === "completed" || session.status === "abandoned") {
    throw new WorkoutStateError("This workout session is already closed");
  }
}

function durationSeconds(session: WorkoutSessionDocument, now = new Date()) {
  const end = session.completedAt ?? now;
  const openPauseSeconds = session.pausedAt
    ? Math.max(0, Math.floor((end.getTime() - session.pausedAt.getTime()) / 1_000))
    : 0;
  return Math.max(
    0,
    Math.floor((end.getTime() - session.startedAt.getTime()) / 1_000) -
      session.pausedDurationSeconds -
      openPauseSeconds,
  );
}

function totals(exercises: WorkoutSessionExerciseDocument[]) {
  const sets = exercises.flatMap((exercise) => exercise.sets);
  return {
    totalSets: sets.length,
    totalVolumeKg: Number(
      sets.reduce((sum, set) => sum + set.reps * set.loadKg, 0).toFixed(2),
    ),
  };
}

function nextVersion(session: WorkoutSessionDocument, now: Date) {
  return { ...session, version: session.version + 1, updatedAt: now };
}

export function createWorkoutSession(
  workout: PlannedWorkoutDocument,
  userId: string,
  now = new Date(),
): WorkoutSessionDocument {
  if (workout.userId !== userId) {
    throw new WorkoutStateError("Workout not found", 404);
  }
  if (workout.status === "completed" || workout.status === "skipped") {
    throw new WorkoutStateError("This planned workout is already closed");
  }

  return {
    id: randomUUID(),
    userId,
    activeSlot: userId,
    plannedWorkoutId: workout.id,
    planId: workout.planId,
    name: workout.name,
    status: "active",
    scheduledFor: workout.scheduledFor,
    exercises: workout.exercises.map((exercise) => ({
      exerciseId: exercise.exerciseId,
      name: exercise.name,
      prescribedSets: exercise.sets,
      repRange: exercise.repRange,
      coachingNotes: exercise.coachingNotes,
      substitutedFor: null,
      sets: [],
    })),
    startedAt: now,
    pausedAt: null,
    completedAt: null,
    pausedDurationSeconds: 0,
    reflection: "",
    perceivedEffort: null,
    totalSets: 0,
    totalVolumeKg: 0,
    createdAt: now,
    updatedAt: now,
    version: 1,
  };
}

export function changeWorkoutStatus(
  session: WorkoutSessionDocument,
  action: "pause" | "resume",
  now = new Date(),
) {
  assertMutable(session);
  if (action === "pause") {
    if (session.status !== "active") {
      throw new WorkoutStateError("Only an active workout can be paused");
    }
    return { ...nextVersion(session, now), status: "paused" as const, pausedAt: now };
  }

  if (session.status !== "paused" || !session.pausedAt) {
    throw new WorkoutStateError("Only a paused workout can be resumed");
  }
  const pauseSeconds = Math.max(
    0,
    Math.floor((now.getTime() - session.pausedAt.getTime()) / 1_000),
  );
  return {
    ...nextVersion(session, now),
    status: "active" as const,
    pausedAt: null,
    pausedDurationSeconds: session.pausedDurationSeconds + pauseSeconds,
  };
}

export function logWorkoutSet(
  session: WorkoutSessionDocument,
  input: { exerciseId: string; reps: number; loadKg: number; effortRpe: number },
  now = new Date(),
) {
  assertMutable(session);
  if (session.status !== "active") {
    throw new WorkoutStateError("Resume the workout before recording a set");
  }
  const exerciseIndex = session.exercises.findIndex(
    (exercise) => exercise.exerciseId === input.exerciseId,
  );
  if (exerciseIndex < 0) throw new WorkoutStateError("Exercise not found", 404);

  const exercise = session.exercises[exerciseIndex]!;
  if (exercise.sets.length >= exercise.prescribedSets + 2) {
    throw new WorkoutStateError("This exercise has reached its set limit");
  }
  const exercises = session.exercises.map((item, index) =>
    index === exerciseIndex
      ? {
          ...item,
          sets: [
            ...item.sets,
            {
              id: randomUUID(),
              setNumber: item.sets.length + 1,
              reps: input.reps,
              loadKg: input.loadKg,
              effortRpe: input.effortRpe,
              completedAt: now,
            },
          ],
        }
      : item,
  );
  return { ...nextVersion(session, now), ...totals(exercises), exercises };
}

export function substituteWorkoutExercise(
  session: WorkoutSessionDocument,
  exerciseId: string,
  replacement: ExerciseDefinition,
  now = new Date(),
) {
  assertMutable(session);
  const exerciseIndex = session.exercises.findIndex(
    (exercise) => exercise.exerciseId === exerciseId,
  );
  if (exerciseIndex < 0) throw new WorkoutStateError("Exercise not found", 404);
  const exercise = session.exercises[exerciseIndex]!;
  if (exercise.sets.length > 0) {
    throw new WorkoutStateError("An exercise cannot be substituted after logging sets");
  }
  if (session.exercises.some((item) => item.exerciseId === replacement.id)) {
    throw new WorkoutStateError("That substitute is already in this workout");
  }

  const exercises = session.exercises.map((item, index) =>
    index === exerciseIndex
      ? {
          ...item,
          exerciseId: replacement.id,
          name: replacement.name,
          coachingNotes: replacement.guidance,
          substitutedFor: {
            exerciseId: item.substitutedFor?.exerciseId ?? item.exerciseId,
            name: item.substitutedFor?.name ?? item.name,
          },
        }
      : item,
  );
  return { ...nextVersion(session, now), exercises };
}

export function finishWorkoutSession(
  session: WorkoutSessionDocument,
  input: { reflection: string; perceivedEffort: number },
  now = new Date(),
) {
  assertMutable(session);
  const sessionTotals = totals(session.exercises);
  if (sessionTotals.totalSets === 0) {
    throw new WorkoutStateError("Record at least one set before finishing");
  }
  const pausedDurationSeconds = session.pausedAt
    ? session.pausedDurationSeconds +
      Math.max(0, Math.floor((now.getTime() - session.pausedAt.getTime()) / 1_000))
    : session.pausedDurationSeconds;
  return {
    ...nextVersion(session, now),
    ...sessionTotals,
    status: "completed" as const,
    activeSlot: null,
    pausedAt: null,
    pausedDurationSeconds,
    completedAt: now,
    reflection: input.reflection,
    perceivedEffort: input.perceivedEffort,
  };
}

export function abandonWorkoutSession(
  session: WorkoutSessionDocument,
  reflection: string,
  now = new Date(),
) {
  assertMutable(session);
  const pausedDurationSeconds = session.pausedAt
    ? session.pausedDurationSeconds +
      Math.max(0, Math.floor((now.getTime() - session.pausedAt.getTime()) / 1_000))
    : session.pausedDurationSeconds;
  return {
    ...nextVersion(session, now),
    ...totals(session.exercises),
    status: "abandoned" as const,
    activeSlot: null,
    pausedAt: null,
    pausedDurationSeconds,
    completedAt: now,
    reflection,
  };
}

export function chooseSubstitute(
  session: WorkoutSessionDocument,
  exerciseId: string,
  catalog: ExerciseDefinition[],
) {
  const current = catalog.find((exercise) => exercise.id === exerciseId);
  const used = new Set(session.exercises.map((exercise) => exercise.exerciseId));
  const candidates = catalog.filter(
    (exercise) => !used.has(exercise.id) && exercise.movement === current?.movement,
  );
  const replacement = candidates[0] ?? catalog.find((exercise) => !used.has(exercise.id));
  if (!replacement) throw new WorkoutStateError("No safe substitute is available", 422);
  return replacement;
}

export function recommendedLoadAdjustment(
  sessions: WorkoutSessionDocument[],
  exerciseId: string,
) {
  const exercises = sessions
    .filter((session) => session.status === "completed")
    .flatMap((session) => session.exercises)
    .filter((exercise) => exercise.exerciseId === exerciseId);
  const sets = exercises.flatMap((exercise) => exercise.sets);
  if (sets.length === 0) return 0;
  const prescribed = exercises.reduce((sum, exercise) => sum + exercise.prescribedSets, 0);
  const completionRate = sets.length / Math.max(1, prescribed);
  const averageRpe = sets.reduce((sum, set) => sum + set.effortRpe, 0) / sets.length;
  if (completionRate >= 0.9 && averageRpe <= 7) return 5;
  if (completionRate < 0.75 || averageRpe >= 9) return -5;
  return 0;
}

export function calculateWorkoutProgress(
  sessions: WorkoutSessionDocument[],
): WorkoutProgress {
  const completed = sessions.filter((session) => session.status === "completed");
  const efforts = completed
    .map((session) => session.perceivedEffort)
    .filter((effort): effort is number => effort !== null);
  return {
    completedSessions: completed.length,
    completedSets: completed.reduce((sum, session) => sum + session.totalSets, 0),
    totalVolumeKg: Number(
      completed.reduce((sum, session) => sum + session.totalVolumeKg, 0).toFixed(2),
    ),
    averageEffort:
      efforts.length > 0
        ? Number((efforts.reduce((sum, effort) => sum + effort, 0) / efforts.length).toFixed(1))
        : null,
    lastCompletedAt:
      completed
        .map((session) => session.completedAt)
        .filter((date): date is Date => date !== null)
        .sort((a, b) => b.getTime() - a.getTime())[0]
        ?.toISOString() ?? null,
  };
}

export function serializeWorkoutSession(
  session: WorkoutSessionDocument,
  now = new Date(),
): WorkoutSession {
  return {
    id: session.id,
    plannedWorkoutId: session.plannedWorkoutId,
    planId: session.planId,
    name: session.name,
    status: session.status,
    exercises: session.exercises.map((exercise) => ({
      ...exercise,
      sets: exercise.sets.map((set) => ({
        ...set,
        completedAt: set.completedAt.toISOString(),
      })),
    })),
    startedAt: session.startedAt.toISOString(),
    pausedAt: session.pausedAt?.toISOString() ?? null,
    completedAt: session.completedAt?.toISOString() ?? null,
    pausedDurationSeconds: session.pausedDurationSeconds,
    durationSeconds: durationSeconds(session, now),
    reflection: session.reflection,
    perceivedEffort: session.perceivedEffort,
    totalSets: session.totalSets,
    totalVolumeKg: session.totalVolumeKg,
  };
}
