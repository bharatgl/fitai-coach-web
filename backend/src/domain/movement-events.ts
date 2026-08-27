import type { MovementEventSummary } from "@fitai/contracts";
import type { CoachMovementContext } from "@fitai/ai";
import type { WorkoutSessionDocument } from "./workouts.js";

export type MovementEventDocument = Omit<MovementEventSummary, "occurredAt"> & {
  userId: string;
  sessionId: string;
  occurredAt: Date;
  receivedAt: Date;
};

export class MovementEventError extends Error {
  statusCode: number;

  constructor(message: string, statusCode = 409) {
    super(message);
    this.name = "MovementEventError";
    this.statusCode = statusCode;
  }
}

export function prepareMovementEvents(
  session: WorkoutSessionDocument,
  userId: string,
  events: MovementEventSummary[],
  now = new Date(),
): MovementEventDocument[] {
  if (session.userId !== userId) {
    throw new MovementEventError("Workout session not found", 404);
  }
  if (session.status !== "active") {
    throw new MovementEventError("Resume the workout before tracking movement");
  }

  const exerciseIds = new Set(session.exercises.map((exercise) => exercise.exerciseId));
  const earliestAllowed = session.startedAt.getTime() - 60_000;
  const latestAllowed = now.getTime() + 60_000;

  return events.map((event) => {
    if (!exerciseIds.has(event.exerciseId)) {
      throw new MovementEventError("Tracked exercise is not in this workout", 422);
    }
    const occurredAt = new Date(event.occurredAt);
    if (
      !Number.isFinite(occurredAt.getTime()) ||
      occurredAt.getTime() < earliestAllowed ||
      occurredAt.getTime() > latestAllowed
    ) {
      throw new MovementEventError("Movement event timestamp is outside this workout", 422);
    }
    return {
      ...event,
      userId,
      sessionId: session.id,
      occurredAt,
      receivedAt: now,
    };
  });
}

export function summarizeMovementEventsForCoach(
  session: WorkoutSessionDocument,
  events: MovementEventDocument[],
): CoachMovementContext | null {
  const exerciseNames = new Map(
    session.exercises.map((exercise) => [exercise.exerciseId, exercise.name]),
  );
  const validEvents = events.filter((event) =>
    event.userId === session.userId &&
    event.sessionId === session.id &&
    exerciseNames.has(event.exerciseId) &&
    event.source === "mediapipe_pose" &&
    Number.isFinite(event.durationMs) &&
    event.durationMs >= 250 &&
    event.durationMs <= 20_000 &&
    Number.isFinite(event.rangeOfMotionDegrees) &&
    event.rangeOfMotionDegrees >= 5 &&
    event.rangeOfMotionDegrees <= 180 &&
    Number.isFinite(event.confidence) &&
    event.confidence >= 0.65 &&
    event.confidence <= 1 &&
    event.occurredAt instanceof Date &&
    Number.isFinite(event.occurredAt.getTime())
  );
  if (!validEvents.length) return null;

  const byExercise = new Map<string, MovementEventDocument[]>();
  for (const event of validEvents) {
    const current = byExercise.get(event.exerciseId) ?? [];
    current.push(event);
    byExercise.set(event.exerciseId, current);
  }
  const average = (values: number[], decimals: number) => Number(
    (values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(decimals),
  );

  return {
    sessionId: session.id,
    sessionName: session.name,
    sessionStatus: session.status,
    capturedReps: validEvents.length,
    exercises: [...byExercise.entries()].map(([exerciseId, exerciseEvents]) => ({
      exerciseId,
      exerciseName: exerciseNames.get(exerciseId)!,
      capturedReps: exerciseEvents.length,
      averageDurationMs: average(exerciseEvents.map((event) => event.durationMs), 0),
      averageRangeOfMotionDegrees: average(
        exerciseEvents.map((event) => event.rangeOfMotionDegrees),
        1,
      ),
      averageConfidence: average(exerciseEvents.map((event) => event.confidence), 3),
      lastCapturedAt: exerciseEvents
        .map((event) => event.occurredAt)
        .sort((a, b) => b.getTime() - a.getTime())[0]!
        .toISOString(),
    })),
  };
}
