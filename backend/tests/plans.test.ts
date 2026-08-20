import assert from "node:assert/strict";
import test from "node:test";
import type { GeneratedPlanDraft } from "@fitai/ai";
import type { UserProfile } from "@fitai/contracts";
import { availableExercises } from "../src/domain/exercise-catalog.js";
import {
  materializePlan,
  PlanValidationError,
  resolvePlanStartDate,
  validatePlanDraft,
} from "../src/domain/plans.js";

const profile: UserProfile = {
  userId: "user-1",
  email: "user@example.com",
  displayName: "Test User",
  experienceLevel: "beginner",
  primaryGoal: "Build general strength",
  equipment: ["dumbbells"],
  trainingDaysPerWeek: 2,
  preferredSessionMinutes: 35,
  movementNotes: "",
  onboardingCompletedAt: "2026-08-20T00:00:00.000Z",
};

const draft: GeneratedPlanDraft = {
  title: "Four-week strength foundation",
  summary: "Two balanced sessions using controlled full-body strength work.",
  rationale: ["Matches two available days", "Uses the available dumbbells"],
  weeklyProgression: [
    "Learn the movements",
    "Add one repetition where comfortable",
    "Add a small amount of load while preserving technique",
    "Consolidate with the same or slightly lower volume",
  ],
  days: [
    {
      dayOffset: 0,
      name: "Strength A",
      focus: "Squat, push, and core",
      estimatedMinutes: 35,
      exercises: [
        { exerciseId: "goblet-squat", sets: 3, repRange: "8-10 reps", restSeconds: 90, tempo: null, coachingNotes: "Use a controlled depth." },
        { exerciseId: "dumbbell-floor-press", sets: 3, repRange: "8-12 reps", restSeconds: 90, tempo: null, coachingNotes: "Keep wrists stacked." },
        { exerciseId: "dead-bug", sets: 2, repRange: "6-8 per side", restSeconds: 45, tempo: null, coachingNotes: "Keep the back comfortable." },
      ],
    },
    {
      dayOffset: 3,
      name: "Strength B",
      focus: "Hinge, pull, and carry",
      estimatedMinutes: 35,
      exercises: [
        { exerciseId: "dumbbell-rdl", sets: 3, repRange: "8-10 reps", restSeconds: 90, tempo: null, coachingNotes: "Move through the hips." },
        { exerciseId: "one-arm-dumbbell-row", sets: 3, repRange: "8-12 per side", restSeconds: 75, tempo: null, coachingNotes: "Keep the torso braced." },
        { exerciseId: "farmer-carry", sets: 3, repRange: "30 seconds", restSeconds: 60, tempo: null, coachingNotes: "Walk tall." },
      ],
    },
  ],
};

test("filters the exercise catalog by equipment and experience", () => {
  const exercises = availableExercises(profile.equipment, profile.experienceLevel);
  assert.ok(exercises.some((exercise) => exercise.id === "goblet-squat"));
  assert.ok(!exercises.some((exercise) => exercise.id === "barbell-back-squat"));
  assert.ok(!exercises.some((exercise) => exercise.id === "dumbbell-overhead-press"));
});

test("materializes four weeks of dated workouts from a validated plan", () => {
  const catalog = availableExercises(profile.equipment, profile.experienceLevel);
  const generated = materializePlan({
    draft,
    profile,
    catalog,
    userId: profile.userId,
    version: 1,
    model: "test-model",
    startDate: new Date("2026-08-24T00:00:00.000Z"),
    now: new Date("2026-08-20T00:00:00.000Z"),
  });

  assert.equal(generated.workouts.length, 8);
  assert.equal(generated.workouts[0]?.scheduledFor.toISOString(), "2026-08-24T00:00:00.000Z");
  assert.equal(generated.workouts[7]?.scheduledFor.toISOString(), "2026-09-17T00:00:00.000Z");
  assert.equal(generated.workouts[0]?.exercises[0]?.name, "Goblet Squat");
});

test("rejects plans that reference unavailable exercises", () => {
  const invalid = structuredClone(draft);
  invalid.days[0]!.exercises[0]!.exerciseId = "invented-exercise";
  assert.throws(
    () => validatePlanDraft(invalid, profile, availableExercises(profile.equipment, profile.experienceLevel)),
    PlanValidationError,
  );
});

test("chooses the current or next Monday when no start date is supplied", () => {
  assert.equal(
    resolvePlanStartDate(undefined, new Date("2026-08-20T13:00:00.000Z")).toISOString(),
    "2026-08-24T00:00:00.000Z",
  );
});
