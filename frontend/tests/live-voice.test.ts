import assert from "node:assert/strict";
import test from "node:test";
import {
  decodeLiveServerMessage,
  movementSignalText,
  shouldSendMovementSignal,
  type LiveMovementSignal,
} from "../lib/live-voice";

const setupComplete = { setupComplete: { sessionId: "live-session" } };
const encodedSetupComplete = JSON.stringify(setupComplete);

test("decodes Gemini Live string frames", async () => {
  assert.deepEqual(await decodeLiveServerMessage(encodedSetupComplete), setupComplete);
});

test("decodes Gemini Live Blob frames", async () => {
  const frame = new Blob([encodedSetupComplete], { type: "application/json" });
  assert.deepEqual(await decodeLiveServerMessage(frame), setupComplete);
});

test("decodes Gemini Live ArrayBuffer frames", async () => {
  const frame = new TextEncoder().encode(encodedSetupComplete).buffer;
  assert.deepEqual(await decodeLiveServerMessage(frame), setupComplete);
});

const movementSignal: LiveMovementSignal = {
  id: "signal-1",
  sessionId: "session-1",
  exerciseId: "bodyweight-squat",
  exerciseName: "Bodyweight Squat",
  repNumber: 2,
  durationMs: 1_500,
  rangeOfMotionDegrees: 48,
  confidence: 0.91,
  cue: "Tracked range and tempo look consistent.",
  requiresCorrection: false,
};

test("sends periodic or corrective movement signals without narrating every rep", () => {
  assert.equal(shouldSendMovementSignal(movementSignal), false);
  assert.equal(shouldSendMovementSignal({ ...movementSignal, repNumber: 3 }), true);
  assert.equal(shouldSendMovementSignal({ ...movementSignal, requiresCorrection: true }), true);
});

test("labels movement signals as on-device estimates", () => {
  const text = movementSignalText(movementSignal);
  assert.match(text, /ON_DEVICE_MOVEMENT_UPDATE/);
  assert.match(text, /Bodyweight Squat/);
  assert.match(text, /Do not claim to see raw video/);
});
