import assert from "node:assert/strict";
import test from "node:test";
import {
  buildCameraAnalysisContents,
  liveCameraAnalysisSystemPrompt,
} from "../src/vision.js";

test("builds a privacy-limited multimodal camera analysis request", () => {
  const contents = buildCameraAnalysisContents({
    focus: "physique",
    memberContext: { goal: "bodybuilding" },
    imageBase64: "jpeg-data",
    mimeType: "image/jpeg",
    dimensions: { width: 640, height: 480 },
  });
  const serialized = JSON.stringify(contents);

  assert.match(serialized, /physique/);
  assert.match(serialized, /inlineData/);
  assert.match(serialized, /jpeg-data/);
  assert.match(liveCameraAnalysisSystemPrompt, /exact body-fat percentage/);
  assert.match(liveCameraAnalysisSystemPrompt, /face or partial torso/);
  assert.match(liveCameraAnalysisSystemPrompt, /needs_better_view/);
});
