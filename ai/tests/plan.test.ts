import assert from "node:assert/strict";
import test from "node:test";
import { buildDeterministicPlan, generatedPlanSchema, planVolumeTargetsFor } from "../src/plan.js";

const validPlan = {
  title: "Strength foundation",
  summary: "A controlled four-week introduction to full-body strength training.",
  rationale: ["Matches the available schedule", "Uses approved movements"],
  weeklyProgression: ["Learn", "Add reps", "Add load", "Consolidate"],
  weeks: [1, 2, 3, 4].map((weekNumber) => ({
    weekNumber,
    days: [
      {
        dayOffset: 0,
        name: `Full body ${weekNumber}`,
        focus: "Controlled strength",
        estimatedMinutes: 30,
        exercises: [
          { exerciseId: "bodyweight-squat", sets: 3, repRange: `${7 + weekNumber}-10 reps`, restSeconds: 60, tempo: null, coachingNotes: "Move with control." },
          { exerciseId: "dead-bug", sets: 2, repRange: `${5 + weekNumber} per side`, restSeconds: 45, tempo: null, coachingNotes: "Breathe normally." },
        ],
      },
    ],
  })),
};

test("accepts a structured adaptive plan", () => {
  assert.equal(generatedPlanSchema.parse(validPlan).weeks.length, 4);
});

test("accepts a twelve-week periodized program", () => {
  const longProgram = {
    ...validPlan,
    weeklyProgression: Array.from({ length: 12 }, (_, index) => `Week ${index + 1} progression`),
    weeks: Array.from({ length: 12 }, (_, index) => ({
      ...validPlan.weeks[0],
      weekNumber: index + 1,
    })),
  };
  assert.equal(generatedPlanSchema.parse(longProgram).weeks.length, 12);
});

test("rejects excessive sets before domain persistence", () => {
  const invalidPlan = structuredClone(validPlan);
  invalidPlan.weeks[0]!.days[0]!.exercises[0]!.sets = 20;
  assert.equal(generatedPlanSchema.safeParse(invalidPlan).success, false);
});

test("scales session volume for an advanced bodybuilding profile", () => {
  assert.deepEqual(
    planVolumeTargetsFor({ experienceLevel: "advanced", preferredSessionMinutes: 60, trainingPhase: "bulk" }),
    {
      minExercisesPerSession: 5,
      maxExercisesPerSession: 7,
      minWorkingSetsPerSession: 15,
      maxWorkingSetsPerSession: 28,
      targetSessionMinutes: { min: 48, max: 60 },
    },
  );
});

test("reduces accessory volume before intensity during an advanced cut", () => {
  const targets = planVolumeTargetsFor({
    experienceLevel: "advanced",
    preferredSessionMinutes: 60,
    trainingPhase: "cut",
  });
  assert.equal(targets.minExercisesPerSession, 5);
  assert.equal(targets.minWorkingSetsPerSession, 12);
  assert.equal(targets.maxWorkingSetsPerSession, 24);
});

test("builds a complete advanced fallback when structured generation fails", () => {
  const plan = buildDeterministicPlan(
    {
      userId: "athlete-1",
      email: "athlete@example.com",
      displayName: "Athlete",
      experienceLevel: "advanced",
      gender: "prefer_not_to_say",
      age: 30,
      heightCm: 178,
      weightKg: 82,
      dietaryPreference: "no_preference",
      primaryGoal: "Natural bodybuilding",
      trainingPhase: "bulk",
      programDurationWeeks: 12,
      equipment: ["full gym"],
      trainingDaysPerWeek: 6,
      preferredSessionMinutes: 120,
      movementNotes: "",
      bodyConsiderations: "",
      onboardingCompletedAt: "2026-08-20T00:00:00.000Z",
    },
    Array.from({ length: 12 }, (_, index) => ({
      id: `exercise-${index}`,
      name: `Exercise ${index}`,
      movement: ["squat", "hinge", "push", "pull", "lunge", "core", "carry"][index % 7]!,
      requiredEquipment: [],
      guidance: "Use controlled technique and stop before form changes.",
    })),
  );

  assert.equal(plan.weeks.length, 12);
  assert.equal(plan.weeks[0]?.days.length, 6);
  assert.equal(plan.weeks[0]?.days[0]?.exercises.length, 5);
  assert.match(plan.title, /^Advanced Bulk/);
});
