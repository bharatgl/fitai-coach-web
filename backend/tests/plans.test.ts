import assert from "node:assert/strict";
import test from "node:test";
import { buildDeterministicPlan, type GeneratedPlanDraft } from "@fitai/ai";
import type { UserProfile } from "@fitai/contracts";
import { availableExercises } from "../src/domain/exercise-catalog.js";
import {
  materializePlan,
  PlanValidationError,
  resolvePlanStartDate,
  restorePlanVersion,
  validatePlanDraft,
} from "../src/domain/plans.js";

const profile: UserProfile = {
  userId: "user-1",
  email: "user@example.com",
  displayName: "Test User",
  experienceLevel: "beginner",
  gender: "prefer_not_to_say",
  age: 32,
  heightCm: 172,
  weightKg: 72,
  dietaryPreference: "no_preference",
  primaryGoal: "Build general strength",
  trainingPhase: "general",
  programDurationWeeks: 4,
  equipment: ["dumbbells"],
  trainingDaysPerWeek: 2,
  preferredSessionMinutes: 35,
  movementNotes: "",
  bodyConsiderations: "",
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
  weeks: [1, 2, 3, 4].map((weekNumber) => ({
    weekNumber,
    days: [
      {
        dayOffset: 0,
        name: `Strength A${weekNumber}`,
        focus: "Squat, push, and core",
        estimatedMinutes: 35,
        exercises: [
          { exerciseId: "goblet-squat", sets: 3, repRange: `${7 + weekNumber}-10 reps`, restSeconds: 90, tempo: null, coachingNotes: "Use a controlled depth." },
          { exerciseId: "dumbbell-floor-press", sets: 3, repRange: "8-12 reps", restSeconds: 90, tempo: null, coachingNotes: "Keep wrists stacked." },
          { exerciseId: "dead-bug", sets: 2, repRange: "6-8 per side", restSeconds: 45, tempo: null, coachingNotes: "Keep the back comfortable." },
        ],
      },
      {
        dayOffset: 3,
        name: `Strength B${weekNumber}`,
        focus: "Hinge, pull, and carry",
        estimatedMinutes: 35,
        exercises: [
          { exerciseId: "dumbbell-rdl", sets: 3, repRange: "8-10 reps", restSeconds: 90, tempo: null, coachingNotes: "Move through the hips." },
          { exerciseId: "one-arm-dumbbell-row", sets: 3, repRange: "8-12 per side", restSeconds: 75, tempo: null, coachingNotes: "Keep the torso braced." },
          { exerciseId: "farmer-carry", sets: 3, repRange: `${25 + weekNumber * 5} seconds`, restSeconds: 60, tempo: null, coachingNotes: "Walk tall." },
        ],
      },
    ],
  })),
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
  assert.equal(generated.workouts[0]?.exercises[0]?.video?.provider, "youtube");
  assert.equal(generated.plan.restoredFromVersion, null);
  assert.notEqual(
    generated.workouts[0]?.exercises[0]?.repRange,
    generated.workouts[2]?.exercises[0]?.repRange,
  );
});

test("restores an archived plan as a new immutable version with fresh dates", () => {
  const catalog = availableExercises(profile.equipment, profile.experienceLevel);
  const generated = materializePlan({
    draft,
    profile,
    catalog,
    userId: profile.userId,
    version: 2,
    model: "test-model",
    startDate: new Date("2026-08-24T00:00:00.000Z"),
    now: new Date("2026-08-20T00:00:00.000Z"),
  });
  generated.plan.status = "archived";
  generated.workouts.forEach((workout) => { workout.status = "skipped"; });

  const restored = restorePlanVersion({
    sourcePlan: generated.plan,
    sourceWorkouts: generated.workouts,
    userId: profile.userId,
    version: 5,
    startDate: new Date("2026-09-07T00:00:00.000Z"),
    now: new Date("2026-09-01T00:00:00.000Z"),
  });

  assert.equal(restored.plan.version, 5);
  assert.equal(restored.plan.status, "active");
  assert.equal(restored.plan.restoredFromVersion, 2);
  assert.notEqual(restored.plan.id, generated.plan.id);
  assert.equal(restored.workouts[0]?.scheduledFor.toISOString(), "2026-09-07T00:00:00.000Z");
  assert.equal(restored.workouts[0]?.status, "planned");
  assert.notEqual(restored.workouts[0]?.id, generated.workouts[0]?.id);
  assert.equal(generated.workouts[0]?.status, "skipped");
});

test("rejects plans that reference unavailable exercises", () => {
  const invalid = structuredClone(draft);
  invalid.weeks[0]!.days[0]!.exercises[0]!.exerciseId = "invented-exercise";
  assert.throws(
    () => validatePlanDraft(invalid, profile, availableExercises(profile.equipment, profile.experienceLevel)),
    PlanValidationError,
  );
});

test("rejects a copied week with identical prescriptions", () => {
  const invalid = structuredClone(draft);
  invalid.weeks[1]!.days = structuredClone(invalid.weeks[0]!.days);
  assert.throws(
    () => validatePlanDraft(invalid, profile, availableExercises(profile.equipment, profile.experienceLevel)),
    PlanValidationError,
  );
});

test("rejects identical workouts assigned to different dates", () => {
  const invalid = structuredClone(draft);
  invalid.weeks[0]!.days[1]!.exercises = structuredClone(
    invalid.weeks[0]!.days[0]!.exercises,
  );
  assert.throws(
    () => validatePlanDraft(invalid, profile, availableExercises(profile.equipment, profile.experienceLevel)),
    PlanValidationError,
  );
});

test("rejects beginner-sized sessions for an advanced hour-long profile", () => {
  const advancedProfile = {
    ...profile,
    experienceLevel: "advanced" as const,
    preferredSessionMinutes: 60,
  };
  assert.throws(
    () => validatePlanDraft(
      draft,
      advancedProfile,
      availableExercises(advancedProfile.equipment, advancedProfile.experienceLevel),
    ),
    /needs at least 5 movements/,
  );
});

test("requires the complete configured program horizon", () => {
  const longProfile = {
    ...profile,
    experienceLevel: "advanced" as const,
    trainingPhase: "bulk" as const,
    programDurationWeeks: 12 as const,
    preferredSessionMinutes: 60,
  };
  assert.throws(
    () => validatePlanDraft(
      draft,
      longProfile,
      availableExercises(longProfile.equipment, longProfile.experienceLevel),
    ),
    /weeks 1 through 12/,
  );
});

test("validates the local fallback for a six-day advanced bodybuilding profile", () => {
  const advancedProfile: UserProfile = {
    ...profile,
    experienceLevel: "advanced",
    trainingPhase: "bulk",
    programDurationWeeks: 12,
    equipment: ["full gym"],
    trainingDaysPerWeek: 6,
    preferredSessionMinutes: 120,
  };
  const catalog = availableExercises(advancedProfile.equipment, advancedProfile.experienceLevel);
  const fallback = buildDeterministicPlan(advancedProfile, catalog);

  assert.doesNotThrow(() => validatePlanDraft(fallback, advancedProfile, catalog));
  assert.equal(fallback.weeks.length, 12);
  assert.equal(fallback.weeks[0]?.days.length, 6);
  assert.ok(fallback.weeks[0]!.days.every((day) => day.exercises.length >= 5));
});

test("chooses the current or next Monday when no start date is supplied", () => {
  assert.equal(
    resolvePlanStartDate(undefined, new Date("2026-08-20T13:00:00.000Z")).toISOString(),
    "2026-08-24T00:00:00.000Z",
  );
});
