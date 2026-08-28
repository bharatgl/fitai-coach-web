import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCoachProfileContext,
  buildCoachTrainingContext,
} from "../src/domain/coach-context.js";
import { createWorkoutSession } from "../src/domain/workouts.js";

test("removes account identity from the profile sent to the model", () => {
  const context = buildCoachProfileContext({
    userId: "private-user-id",
    email: "private@example.com",
    displayName: "Private Person",
    experienceLevel: "advanced",
    dietaryPreference: "vegetarian",
    primaryGoal: "Bodybuilding",
    equipment: ["barbell"],
    trainingDaysPerWeek: 5,
    preferredSessionMinutes: 75,
    movementNotes: "",
    bodyConsiderations: "",
  });

  assert.equal(context?.primaryGoal, "Bodybuilding");
  assert.equal(context?.dietaryPreference, "vegetarian");
  assert.equal(context && "email" in context, false);
  assert.equal(context && "userId" in context, false);
  assert.equal(context && "displayName" in context, false);
});

test("gives the coach exact next-workout prescriptions and readiness evidence", () => {
  const context = buildCoachTrainingContext({
    now: new Date("2026-08-27T09:00:00.000Z"),
    readiness: {
      id: "readiness",
      userId: "user",
      date: "2026-08-27",
      sleepHours: 6.5,
      sleepQuality: 3,
      energy: 3,
      soreness: 4,
      stress: 2,
      motivation: 4,
      bodyWeightKg: 82,
      notes: "Legs are still sore",
      score: 54,
      status: "steady",
      createdAt: new Date("2026-08-27T06:00:00.000Z"),
      updatedAt: new Date("2026-08-27T06:00:00.000Z"),
    },
    activePlan: {
      id: "plan",
      userId: "user",
      version: 2,
      status: "active",
      experienceLevel: "advanced",
      trainingPhase: "bulk",
      restoredFromVersion: null,
      title: "Hypertrophy block",
      summary: "Build upper-body volume",
      startDate: new Date("2026-08-24T00:00:00.000Z"),
      durationWeeks: 4,
      daysPerWeek: 4,
      rationale: ["Matches recovery"],
      weeklyProgression: ["Base", "Add reps", "Add load", "Deload"],
      createdAt: new Date("2026-08-24T00:00:00.000Z"),
      model: "test-model",
    },
    nextWorkout: {
      id: "workout",
      userId: "user",
      planId: "plan",
      weekNumber: 1,
      dayOffset: 3,
      name: "Upper hypertrophy",
      focus: "Chest and back",
      scheduledFor: new Date("2026-08-27T00:00:00.000Z"),
      estimatedMinutes: 60,
      status: "planned",
      createdAt: new Date("2026-08-24T00:00:00.000Z"),
      exercises: [{
        exerciseId: "bench-press",
        name: "Bench press",
        video: null,
        sets: 4,
        repRange: "6-8 reps",
        restSeconds: 150,
        tempo: "3-1-1",
        coachingNotes: "Pause on the chest.",
      }],
    },
    activeSession: null,
    recentSessions: [],
  });

  assert.equal(context.readiness?.source, "self_reported");
  assert.equal(context.nextWorkout?.name, "Upper hypertrophy");
  assert.deepEqual(context.nextWorkout?.exercises[0], {
    name: "Bench press",
    sets: 4,
    repRange: "6-8 reps",
    restSeconds: 150,
    tempo: "3-1-1",
    coachingNotes: "Pause on the chest.",
    loadAdjustmentPercent: 0,
  });
  assert.equal(context.dataGaps.length, 0);
});

test("keeps active-session exercise identifiers for private movement tracking", () => {
  const now = new Date("2026-08-27T09:00:00.000Z");
  const activeSession = createWorkoutSession({
    id: "workout",
    userId: "user",
    planId: "plan",
    weekNumber: 1,
    dayOffset: 0,
    name: "Lower body",
    focus: "Squat pattern",
    scheduledFor: now,
    estimatedMinutes: 45,
    status: "planned",
    createdAt: now,
    exercises: [{
      exerciseId: "bodyweight-squat",
      name: "Bodyweight squat",
      video: null,
      sets: 3,
      repRange: "10-12 reps",
      restSeconds: 60,
      tempo: "3-1-1",
      coachingNotes: "Keep the knees tracking over the toes.",
    }],
  }, "user", now);

  const context = buildCoachTrainingContext({
    now,
    readiness: null,
    activePlan: null,
    nextWorkout: null,
    activeSession,
    recentSessions: [],
  });

  assert.equal(context.activeSession?.exercises[0]?.exerciseId, "bodyweight-squat");
});

test("shares the selected plan week with every coach surface", () => {
  const now = new Date("2026-08-27T09:00:00.000Z");
  const context = buildCoachTrainingContext({
    now,
    readiness: null,
    activePlan: null,
    nextWorkout: null,
    activeSession: null,
    recentSessions: [],
    selectedWeekNumber: 2,
    selectedWorkoutId: "pull-day",
    selectedWeekWorkouts: [{
      id: "pull-day",
      userId: "user",
      planId: "plan",
      weekNumber: 2,
      dayOffset: 1,
      name: "Pull day",
      focus: "Back and biceps",
      scheduledFor: now,
      estimatedMinutes: 55,
      status: "planned",
      createdAt: now,
      exercises: [{
        exerciseId: "row",
        name: "Cable row",
        video: null,
        sets: 3,
        repRange: "8-12 reps",
        restSeconds: 90,
        tempo: "2-1-2",
        coachingNotes: "Drive the elbows back.",
      }],
    }],
  });

  assert.equal(context.selectedWeek?.weekNumber, 2);
  assert.equal(context.selectedWeek?.selectedWorkoutId, "pull-day");
  assert.equal(context.selectedWeek?.workouts[0]?.exercises[0]?.name, "Cable row");
});
