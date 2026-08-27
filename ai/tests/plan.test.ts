import assert from "node:assert/strict";
import test from "node:test";
import { generatedPlanSchema, planVolumeTargetsFor } from "../src/plan.js";

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

test("rejects excessive sets before domain persistence", () => {
  const invalidPlan = structuredClone(validPlan);
  invalidPlan.weeks[0]!.days[0]!.exercises[0]!.sets = 20;
  assert.equal(generatedPlanSchema.safeParse(invalidPlan).success, false);
});

test("scales session volume for an advanced bodybuilding profile", () => {
  assert.deepEqual(
    planVolumeTargetsFor({ experienceLevel: "advanced", preferredSessionMinutes: 60 }),
    {
      minExercisesPerSession: 5,
      maxExercisesPerSession: 7,
      minWorkingSetsPerSession: 15,
      maxWorkingSetsPerSession: 28,
      targetSessionMinutes: { min: 48, max: 60 },
    },
  );
});
