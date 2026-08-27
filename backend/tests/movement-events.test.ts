import assert from "node:assert/strict";
import test from "node:test";
import type { MovementEventSummary } from "@fitai/contracts";
import {
  prepareMovementEvents,
  summarizeMovementEventsForCoach,
} from "../src/domain/movement-events.js";
import { createWorkoutSession } from "../src/domain/workouts.js";
import type { PlannedWorkoutDocument } from "../src/domain/plans.js";

const workout: PlannedWorkoutDocument = {
  id: "workout-movement",
  planId: "plan-1",
  userId: "user-1",
  weekNumber: 1,
  dayOffset: 0,
  name: "Movement session",
  focus: "Squat",
  scheduledFor: new Date("2026-08-24T00:00:00.000Z"),
  estimatedMinutes: 20,
  status: "planned",
  createdAt: new Date("2026-08-20T00:00:00.000Z"),
  exercises: [{
    exerciseId: "bodyweight-squat",
    name: "Bodyweight Squat",
    video: null,
    sets: 2,
    repRange: "8-10 reps",
    restSeconds: 60,
    tempo: null,
    coachingNotes: "Use a comfortable depth.",
  }],
};

function event(overrides: Partial<MovementEventSummary> = {}): MovementEventSummary {
  return {
    clientEventId: "8d2ab0a8-693f-4b6c-949a-2fcb6359b57d",
    exerciseId: "bodyweight-squat",
    repNumber: 1,
    occurredAt: "2026-08-24T10:00:04.000Z",
    durationMs: 1_800,
    rangeOfMotionDegrees: 72,
    confidence: 0.91,
    source: "mediapipe_pose",
    ...overrides,
  };
}

test("persists only compact movement summaries", () => {
  const session = createWorkoutSession(workout, "user-1", new Date("2026-08-24T10:00:00.000Z"));
  const [prepared] = prepareMovementEvents(
    session,
    "user-1",
    [event()],
    new Date("2026-08-24T10:00:05.000Z"),
  );
  assert.equal(prepared?.sessionId, session.id);
  assert.equal(prepared?.rangeOfMotionDegrees, 72);
  assert.equal(prepared?.occurredAt.toISOString(), "2026-08-24T10:00:04.000Z");
  assert.equal("landmarks" in (prepared ?? {}), false);
  assert.equal("frame" in (prepared ?? {}), false);
});

test("rejects events for an exercise outside the active workout", () => {
  const session = createWorkoutSession(workout, "user-1", new Date("2026-08-24T10:00:00.000Z"));
  assert.throws(
    () => prepareMovementEvents(
      session,
      "user-1",
      [event({ exerciseId: "push-up" })],
      new Date("2026-08-24T10:00:05.000Z"),
    ),
    /not in this workout/,
  );
});

test("rejects tracking while a workout is paused", () => {
  const session = createWorkoutSession(workout, "user-1", new Date("2026-08-24T10:00:00.000Z"));
  session.status = "paused";
  assert.throws(
    () => prepareMovementEvents(session, "user-1", [event()]),
    /Resume the workout/,
  );
});

test("builds compact coach context from validated events only", () => {
  const session = createWorkoutSession(workout, "user-1", new Date("2026-08-24T10:00:00.000Z"));
  const prepared = prepareMovementEvents(
    session,
    "user-1",
    [
      event(),
      event({
        clientEventId: "7f231755-56d0-48e4-a5e1-5542e35fa457",
        repNumber: 2,
        durationMs: 2_000,
        rangeOfMotionDegrees: 68,
        confidence: 0.89,
        occurredAt: "2026-08-24T10:00:05.000Z",
      }),
    ],
    new Date("2026-08-24T10:00:06.000Z"),
  );
  const summary = summarizeMovementEventsForCoach(session, [
    ...prepared,
    { ...prepared[0]!, userId: "another-user" },
  ]);

  assert.equal(summary?.capturedReps, 2);
  assert.deepEqual(summary?.exercises[0], {
    exerciseId: "bodyweight-squat",
    exerciseName: "Bodyweight Squat",
    capturedReps: 2,
    averageDurationMs: 1_900,
    averageRangeOfMotionDegrees: 70,
    averageConfidence: 0.9,
    lastCapturedAt: "2026-08-24T10:00:05.000Z",
  });
  assert.equal("landmarks" in (summary ?? {}), false);
});
