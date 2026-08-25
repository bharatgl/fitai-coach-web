import assert from "node:assert/strict";
import test from "node:test";
import { youtubeEmbedUrl } from "../components/ExerciseVideo.js";

test("builds a privacy-enhanced YouTube embed URL from a video ID", () => {
  assert.equal(
    youtubeEmbedUrl("MeIiIdhvXT4"),
    "https://www.youtube-nocookie.com/embed/MeIiIdhvXT4?rel=0&modestbranding=1",
  );
});

test("rejects untrusted YouTube URL fragments", () => {
  assert.throws(() => youtubeEmbedUrl("not/a/video"), /Invalid YouTube video ID/);
});
