import assert from "node:assert/strict";
import test from "node:test";
import {
  appendPersonalizationEvidence,
  buildCoachContents,
  coachBehaviorContract,
  coachSystemPrompt,
  ensurePlanChangeConfirmation,
} from "../src/coach.js";

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

test("includes exact training context and enforces personalized response detail", () => {
  const contents = buildCoachContents({
    profile: { primaryGoal: "bodybuilding" },
    trainingContext: {
      readiness: { score: 54, status: "steady", source: "self_reported" },
      nextWorkout: {
        name: "Upper hypertrophy",
        exercises: [{ name: "Bench press", sets: 4, repRange: "6-8 reps" }],
      },
    },
    history: [],
    message: "Review my next workout",
  });

  assert.equal(typeof contents, "string");
  assert.match(contents as string, /Upper hypertrophy/);
  assert.match(contents as string, /Bench press/);
  assert.match(contents as string, /"source":"self_reported"/);
  assert.match(coachSystemPrompt, /name the actual workout/);
  assert.match(coachSystemPrompt, /sets, rep ranges, rest, tempo/);
  assert.match(coachSystemPrompt, /Never invent exercises/);
  assert.match(coachSystemPrompt, /Avoid vague filler/);
  assert.match(coachSystemPrompt, /personalizationEvidence/);
  assert.match(coachSystemPrompt, /must not be requested again/);
  assert.match(coachSystemPrompt, /Never ask about dietary preference when a specific value is already supplied/);
  assert.match(coachSystemPrompt, /## Starting targets/);
  assert.match(coachSystemPrompt, /natural Indian English/);
  assert.match(coachSystemPrompt, /Hindi, Punjabi, or Hinglish/);
  assert.match(coachSystemPrompt, /Avoid exaggerated spellings, forced slang, or stereotypes/);
  assert.match(coachBehaviorContract, /without agreeing automatically/);
  assert.match(coachBehaviorContract, /Never tease, flirt, use sarcasm/);
  assert.match(coachBehaviorContract, /Use the recent conversation to avoid repetition/);
  assert.match(coachBehaviorContract, /latest explicit statement about their current intent and timing/);
  assert.match(coachBehaviorContract, /Allow ordinary conversation/);
  assert.match(coachBehaviorContract, /will train tomorrow or later/);
  assert.match(coachBehaviorContract, /differs from the saved selectedWeek schedule/);
  assert.match(coachBehaviorContract, /ask one explicit yes\/no question/);
});

test("asks before changing a saved week when reported training differs from the plan", () => {
  const reply = ensurePlanChangeConfirmation({
    reply: "Do your Back session today and keep the prescribed sets.",
    message: "I already had my push day yesterday and will do the back session today.",
    hasPlanContext: true,
  });

  assert.match(reply, /Would you like me to update this week's saved plan to reflect that\?$/);
});

test("does not duplicate or force plan confirmation outside a schedule mismatch", () => {
  const existingQuestion = "Would you like me to update this week's plan?";
  assert.equal(ensurePlanChangeConfirmation({
    reply: existingQuestion,
    message: "I already did my push workout yesterday.",
    hasPlanContext: true,
  }), existingQuestion);
  assert.equal(ensurePlanChangeConfirmation({
    reply: "Use your normal warm-up.",
    message: "How should I warm up?",
    hasPlanContext: true,
  }), "Use your normal warm-up.");
  assert.equal(ensurePlanChangeConfirmation({
    reply: "Noted.",
    message: "I already did my push workout yesterday.",
    hasPlanContext: false,
  }), "Noted.");
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

test("renders an auditable personalization evidence section", () => {
  const reply = appendPersonalizationEvidence(
    "Start with bench press and keep one to two reps in reserve.",
    ["Your next workout prescribes bench press for 4 sets of 6-8 reps."],
  );

  assert.match(reply, /## Personalized from your data/);
  assert.match(reply, /4 sets of 6-8 reps/);
});
