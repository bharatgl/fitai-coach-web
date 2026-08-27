import assert from "node:assert/strict";
import test from "node:test";
import { youtubeEmbedUrl, youtubeThumbnailUrl } from "../components/ExerciseVideo.js";

test("builds a privacy-enhanced YouTube embed URL from a video ID", () => {
  assert.equal(
    youtubeEmbedUrl("MeIiIdhvXT4"),
    "https://www.youtube-nocookie.com/embed/MeIiIdhvXT4?rel=0&modestbranding=1",
  );
});

test("builds a YouTube preview thumbnail URL from a video ID", () => {
  assert.equal(
    youtubeThumbnailUrl("MeIiIdhvXT4"),
    "https://i.ytimg.com/vi/MeIiIdhvXT4/mqdefault.jpg",
  );
});

test("rejects untrusted YouTube URL fragments", () => {
  assert.throws(() => youtubeEmbedUrl("not/a/video"), /Invalid YouTube video ID/);
  assert.throws(() => youtubeThumbnailUrl("not/a/video"), /Invalid YouTube video ID/);
});
