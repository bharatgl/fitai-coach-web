import assert from "node:assert/strict";
import test from "node:test";
import { isBenignMediaPipeStartupLog } from "../lib/mediapipe-runtime.js";

test("filters only MediaPipe's mislabeled XNNPACK startup information", () => {
  assert.equal(isBenignMediaPipeStartupLog([
    "INFO: Created TensorFlow Lite XNNPACK delegate for CPU.",
  ]), true);
  assert.equal(isBenignMediaPipeStartupLog(["Camera initialization failed"]), false);
  assert.equal(isBenignMediaPipeStartupLog([new Error("Pose detection failed")]), false);
});
