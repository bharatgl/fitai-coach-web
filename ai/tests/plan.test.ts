import assert from "node:assert/strict";
import test from "node:test";
import { generatedPlanSchema } from "../src/plan.js";

const validPlan = {
  title: "Strength foundation",
  summary: "A controlled four-week introduction to full-body strength training.",
  rationale: ["Matches the available schedule", "Uses approved movements"],
  weeklyProgression: ["Learn", "Add reps", "Add load", "Consolidate"],
  days: [
    {
      dayOffset: 0,
      name: "Full body",
      focus: "Controlled strength",
      estimatedMinutes: 30,
      exercises: [
        { exerciseId: "bodyweight-squat", sets: 3, repRange: "8-10 reps", restSeconds: 60, tempo: null, coachingNotes: "Move with control." },
        { exerciseId: "dead-bug", sets: 2, repRange: "6 per side", restSeconds: 45, tempo: null, coachingNotes: "Breathe normally." },
      ],
    },
  ],
};

test("accepts a structured adaptive plan", () => {
  assert.equal(generatedPlanSchema.parse(validPlan).days.length, 1);
});

test("rejects excessive sets before domain persistence", () => {
  const invalidPlan = structuredClone(validPlan);
  invalidPlan.days[0]!.exercises[0]!.sets = 20;
  assert.equal(generatedPlanSchema.safeParse(invalidPlan).success, false);
});
