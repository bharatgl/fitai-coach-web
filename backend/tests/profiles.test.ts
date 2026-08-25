import assert from "node:assert/strict";
import test from "node:test";
import { serializeProfile } from "../src/domain/profiles.js";

test("provides safe personalization defaults for existing profiles", () => {
  const profile = serializeProfile({
    userId: "existing-user",
    email: "existing@example.com",
    displayName: "Existing User",
    experienceLevel: "intermediate",
    primaryGoal: "Build strength",
    equipment: ["dumbbells"],
    trainingDaysPerWeek: 3,
    preferredSessionMinutes: 45,
    movementNotes: "",
    onboardingCompletedAt: new Date("2026-08-20T00:00:00.000Z"),
  });

  assert.equal(profile.gender, "prefer_not_to_say");
  assert.equal(profile.age, null);
  assert.equal(profile.heightCm, null);
  assert.equal(profile.weightKg, null);
  assert.equal(profile.bodyConsiderations, "");
});

test("serializes user-provided body context without inference", () => {
  const profile = serializeProfile({
    userId: "personalized-user",
    email: "personalized@example.com",
    displayName: "Personalized User",
    experienceLevel: "beginner",
    gender: "woman",
    age: 31,
    heightCm: 168.5,
    weightKg: 64.2,
    primaryGoal: "Build lower-body strength",
    equipment: [],
    trainingDaysPerWeek: 3,
    preferredSessionMinutes: 35,
    movementNotes: "Avoid jumping",
    bodyConsiderations: "Prefer low-impact training",
    onboardingCompletedAt: new Date("2026-08-20T00:00:00.000Z"),
  });

  assert.equal(profile.gender, "woman");
  assert.equal(profile.heightCm, 168.5);
  assert.equal(profile.weightKg, 64.2);
  assert.equal(profile.bodyConsiderations, "Prefer low-impact training");
});
