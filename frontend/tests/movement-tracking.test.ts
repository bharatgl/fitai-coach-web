import assert from "node:assert/strict";
import test from "node:test";
import {
  createRepDetector,
  movementProfileForExercise,
  type PosePoint,
} from "../lib/movement-tracking.js";

function kneeLandmarks(angleDegrees: number, visibility = 0.95): PosePoint[] {
  const landmarks = Array.from({ length: 33 }, () => ({ x: 0, y: 0, visibility: 0 }));
  const radians = angleDegrees * Math.PI / 180;
  landmarks[23] = { x: 1, y: 0, visibility };
  landmarks[25] = { x: 0, y: 0, visibility };
  landmarks[27] = { x: Math.cos(radians), y: Math.sin(radians), visibility };
  return landmarks;
}

test("selects supported movement profiles without guessing unsupported exercises", () => {
  assert.equal(movementProfileForExercise("goblet-squat", "Goblet Squat")?.joint, "knee");
  assert.equal(movementProfileForExercise("push-up", "Push-Up")?.joint, "elbow");
  assert.equal(movementProfileForExercise("glute-bridge", "Glute Bridge")?.kind, "hinge");
  assert.equal(movementProfileForExercise("bird-dog", "Bird Dog"), null);
});

test("counts a confidence-gated squat cycle and reports compact ROM", () => {
  const profile = movementProfileForExercise("bodyweight-squat", "Bodyweight Squat");
  assert.ok(profile);
  const detector = createRepDetector(profile);
  assert.equal(detector.ingest(kneeLandmarks(170), 0), null);
  assert.equal(detector.ingest(kneeLandmarks(145), 200), null);
  assert.equal(detector.ingest(kneeLandmarks(105), 700), null);
  const rep = detector.ingest(kneeLandmarks(165), 1_400);
  assert.equal(rep?.repNumber, 1);
  assert.equal(rep?.durationMs, 1_200);
  assert.equal(rep?.rangeOfMotionDegrees, 65);
  assert.equal(rep?.confidence, 0.95);
});

test("ignores low-confidence landmarks", () => {
  const profile = movementProfileForExercise("bodyweight-squat", "Bodyweight Squat");
  assert.ok(profile);
  const detector = createRepDetector(profile);
  detector.ingest(kneeLandmarks(170), 0);
  detector.ingest(kneeLandmarks(100, 0.4), 500);
  assert.equal(detector.ingest(kneeLandmarks(170), 1_000), null);
});
