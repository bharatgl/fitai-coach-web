import assert from "node:assert/strict";
import test from "node:test";
import { exerciseCatalog } from "../src/domain/exercise-catalog.js";

test("every catalog exercise has one valid curated YouTube demonstration", () => {
  const videoIds = exerciseCatalog.map((exercise) => {
    assert.ok(exercise.video);
    return exercise.video.videoId;
  });

  assert.equal(new Set(videoIds).size, exerciseCatalog.length);
  for (const exercise of exerciseCatalog) {
    const video = exercise.video;
    assert.ok(video);
    assert.equal(video.provider, "youtube");
    assert.match(video.videoId, /^[A-Za-z0-9_-]{11}$/);
    assert.ok(video.title.trim());
    assert.ok(video.channel.trim());
  }
});
