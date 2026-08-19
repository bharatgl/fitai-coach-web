import assert from "node:assert/strict";
import test from "node:test";
import { classifySafetyMessage } from "../src/safety.js";

test("urgent symptoms stop the workout and bypass the model", () => {
  const result = classifySafetyMessage("I have chest pain and cannot breathe");
  assert.equal(result?.safetyCategory, "emergency");
  assert.equal(result?.shouldPauseWorkout, true);
});

test("pain symptoms stop the workout", () => {
  const result = classifySafetyMessage("I felt a sharp pain in my knee");
  assert.equal(result?.safetyCategory, "pain");
  assert.equal(result?.shouldPauseWorkout, true);
});

test("ordinary coaching requests proceed to the model", () => {
  assert.equal(classifySafetyMessage("How should I pace my squats?"), null);
});
