import assert from "node:assert/strict";
import test from "node:test";
import { availableExercises } from "../src/domain/exercise-catalog.js";
import type { PlannedWorkoutDocument } from "../src/domain/plans.js";
import {
  calculateWorkoutProgress,
  changeWorkoutStatus,
  chooseSubstitute,
  createWorkoutSession,
  finishWorkoutSession,
  logWorkoutSet,
  recommendedLoadAdjustment,
  serializeWorkoutSession,
  substituteWorkoutExercise,
  WorkoutStateError,
} from "../src/domain/workouts.js";

const workout: PlannedWorkoutDocument = {
  id: "workout-1",
  planId: "plan-1",
  userId: "user-1",
  weekNumber: 1,
  dayOffset: 0,
  name: "Strength A",
  focus: "Squat, push, and core",
  scheduledFor: new Date("2026-08-24T00:00:00.000Z"),
  estimatedMinutes: 35,
  status: "planned",
  createdAt: new Date("2026-08-20T00:00:00.000Z"),
  exercises: [
    {
      exerciseId: "goblet-squat",
      name: "Goblet Squat",
      video: null,
      sets: 2,
      repRange: "8-10 reps",
      restSeconds: 90,
      tempo: null,
      coachingNotes: "Use a controlled depth.",
    },
    {
      exerciseId: "dumbbell-floor-press",
      name: "Dumbbell Floor Press",
      video: null,
      sets: 2,
      repRange: "8-12 reps",
      restSeconds: 90,
      tempo: null,
      coachingNotes: "Keep wrists stacked.",
    },
  ],
};

test("creates a real execution session from a planned workout", () => {
  const session = createWorkoutSession(
    workout,
    "user-1",
    new Date("2026-08-24T10:00:00.000Z"),
  );
  assert.equal(session.plannedWorkoutId, workout.id);
  assert.equal(session.activeSlot, "user-1");
  assert.equal(session.status, "active");
  assert.equal(session.exercises[0]?.prescribedSets, 2);
  assert.equal(session.exercises[0]?.video?.provider, "youtube");
  assert.equal(session.exercises[0]?.sets.length, 0);
});

test("tracks pause duration without counting it as active workout time", () => {
  const started = createWorkoutSession(
    workout,
    "user-1",
    new Date("2026-08-24T10:00:00.000Z"),
  );
  const paused = changeWorkoutStatus(
    started,
    "pause",
    new Date("2026-08-24T10:05:00.000Z"),
  );
  const resumed = changeWorkoutStatus(
    paused,
    "resume",
    new Date("2026-08-24T10:07:00.000Z"),
  );
  assert.equal(resumed.pausedDurationSeconds, 120);
  assert.equal(
    serializeWorkoutSession(resumed, new Date("2026-08-24T10:10:00.000Z"))
      .durationSeconds,
    480,
  );
});

test("logs sets, calculates volume, and finishes with reflection", () => {
  const started = createWorkoutSession(
    workout,
    "user-1",
    new Date("2026-08-24T10:00:00.000Z"),
  );
  const first = logWorkoutSet(
    started,
    { exerciseId: "goblet-squat", reps: 10, loadKg: 12.5, effortRpe: 7 },
    new Date("2026-08-24T10:03:00.000Z"),
  );
  const second = logWorkoutSet(
    first,
    { exerciseId: "goblet-squat", reps: 9, loadKg: 12.5, effortRpe: 7 },
    new Date("2026-08-24T10:06:00.000Z"),
  );
  const finished = finishWorkoutSession(
    second,
    { reflection: "Controlled and comfortable.", perceivedEffort: 7 },
    new Date("2026-08-24T10:12:00.000Z"),
  );
  assert.equal(finished.status, "completed");
  assert.equal(finished.activeSlot, null);
  assert.equal(finished.totalSets, 2);
  assert.equal(finished.totalVolumeKg, 237.5);
  assert.equal(finished.reflection, "Controlled and comfortable.");
});

test("selects a compatible same-pattern substitute before sets are logged", () => {
  const session = createWorkoutSession(workout, "user-1");
  const catalog = availableExercises(["dumbbells"], "beginner");
  const replacement = chooseSubstitute(session, "goblet-squat", catalog);
  assert.equal(replacement.movement, "squat");
  assert.notEqual(replacement.id, "goblet-squat");
  const updated = substituteWorkoutExercise(session, "goblet-squat", replacement);
  assert.equal(updated.exercises[0]?.substitutedFor?.exerciseId, "goblet-squat");
  assert.equal(updated.exercises[0]?.video?.videoId, replacement.video.videoId);

  const logged = logWorkoutSet(
    updated,
    { exerciseId: replacement.id, reps: 8, loadKg: 0, effortRpe: 6 },
  );
  assert.throws(
    () => substituteWorkoutExercise(logged, replacement.id, catalog[0]!),
    WorkoutStateError,
  );
});

test("recalculates progress and recommends future load from completed work", () => {
  let session = createWorkoutSession(workout, "user-1");
  session = logWorkoutSet(session, {
    exerciseId: "goblet-squat",
    reps: 10,
    loadKg: 10,
    effortRpe: 6,
  });
  session = logWorkoutSet(session, {
    exerciseId: "goblet-squat",
    reps: 10,
    loadKg: 10,
    effortRpe: 7,
  });
  const finished = finishWorkoutSession(session, {
    reflection: "Ready to progress.",
    perceivedEffort: 7,
  });
  assert.equal(recommendedLoadAdjustment([finished], "goblet-squat"), 5);
  assert.deepEqual(calculateWorkoutProgress([finished]), {
    completedSessions: 1,
    completedSets: 2,
    totalVolumeKg: 200,
    averageEffort: 7,
    lastCompletedAt: finished.completedAt?.toISOString() ?? null,
  });
});

test("refuses to finish an empty session", () => {
  const session = createWorkoutSession(workout, "user-1");
  assert.throws(
    () => finishWorkoutSession(session, { reflection: "", perceivedEffort: 5 }),
    /Record at least one set/,
  );
});
