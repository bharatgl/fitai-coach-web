import type { MovementEventSummary } from "@fitai/contracts";
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
