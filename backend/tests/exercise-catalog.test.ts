import assert from "node:assert/strict";
import test from "node:test";
import { exerciseCatalog } from "../src/domain/exercise-catalog.js";

test("every catalog exercise has one valid curated YouTube demonstration", () => {
  const videoIds = exerciseCatalog.map((exercise) => exercise.video.videoId);

  assert.equal(new Set(videoIds).size, exerciseCatalog.length);
  for (const exercise of exerciseCatalog) {
    assert.equal(exercise.video.provider, "youtube");
    assert.match(exercise.video.videoId, /^[A-Za-z0-9_-]{11}$/);
    assert.ok(exercise.video.title.trim());
    assert.ok(exercise.video.channel.trim());
  }
});
