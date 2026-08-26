import assert from "node:assert/strict";
import test from "node:test";
import { buildCoachContents } from "../src/coach.js";

test("builds multimodal coach content when attachments are present", () => {
  const contents = buildCoachContents({
    profile: { primaryGoal: "strength" },
    history: [],
    message: "Check my form",
    attachments: [{
      name: "squat.jpg",
      mimeType: "image/jpeg",
      dataBase64: "ZmFrZS1pbWFnZQ==",
    }],
  });

  assert.ok(Array.isArray(contents));
  const first = contents[0];
  if (!first || typeof first !== "object" || !("parts" in first) || !Array.isArray(first.parts)) {
    assert.fail("Expected structured multimodal content");
  }
  assert.equal(first.parts[1]?.text, "Attached file: squat.jpg");
  assert.deepEqual(first.parts[2]?.inlineData, {
    data: "ZmFrZS1pbWFnZQ==",
    mimeType: "image/jpeg",
  });
});

test("keeps text-only coach requests simple", () => {
  const contents = buildCoachContents({
    profile: {},
    history: [],
    message: "How should I warm up?",
  });

  assert.equal(typeof contents, "string");
  assert.match(contents as string, /How should I warm up/);
});

test("includes dietary preference in coach context", () => {
  const contents = buildCoachContents({
    profile: { primaryGoal: "strength", dietaryPreference: "vegetarian" },
    history: [],
    message: "What should I eat after training?",
  });

  assert.equal(typeof contents, "string");
  assert.match(contents as string, /"dietaryPreference":"vegetarian"/);
});

test("includes only compact validated movement aggregates in coach context", () => {
  const contents = buildCoachContents({
    profile: {},
    history: [],
    message: "How did those reps look?",
    movementContext: {
      sessionId: "session-1",
      sessionName: "Strength A",
      sessionStatus: "active",
      capturedReps: 2,
      exercises: [{
        exerciseId: "bodyweight-squat",
        exerciseName: "Bodyweight Squat",
        capturedReps: 2,
        averageDurationMs: 1_350,
        averageRangeOfMotionDegrees: 64.5,
        averageConfidence: 0.91,
        lastCapturedAt: "2026-08-24T10:00:05.000Z",
      }],
    },
  });

  assert.equal(typeof contents, "string");
  assert.match(contents as string, /"activeMovementSummary"/);
  assert.match(contents as string, /"capturedReps":2/);
  assert.doesNotMatch(contents as string, /landmarks|cameraFrame/);
});
