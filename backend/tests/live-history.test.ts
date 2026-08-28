import assert from "node:assert/strict";
import test from "node:test";
import {
  compactDatedLiveHistory,
  compactLiveHistory,
  formatCoachLocalDateTime,
} from "../src/domain/live-history.js";

test("converts persisted coach messages into chronological Gemini history", () => {
  const history = compactLiveHistory([
    { role: "assistant", content: "Latest reply" },
    { role: "user", content: "Earlier question" },
  ]);

  assert.deepEqual(history, [
    { role: "user", text: "Earlier question" },
    { role: "model", text: "Latest reply" },
  ]);
});

test("bounds live history while retaining the newest conversation", () => {
  const history = compactLiveHistory([
    { role: "assistant", content: "newest answer" },
    { role: "user", content: "x".repeat(2_000) },
    { role: "assistant", content: "old answer" },
  ], 20);

  assert.equal(history.reduce((total, turn) => total + turn.text.length, 0), 20);
  assert.equal(history.at(-1)?.text, "newest answer");
  assert.equal(history.some((turn) => turn.text === "old answer"), false);
});

test("does not seed an orphaned model reply without a preceding user turn", () => {
  assert.deepEqual(compactLiveHistory([
    { role: "assistant", content: "orphaned reply" },
  ]), []);
});

test("labels persisted live history with its original local date and time", () => {
  const history = compactDatedLiveHistory([
    {
      role: "assistant",
      content: "Will you sleep soon?",
      createdAt: new Date("2026-08-27T18:00:00.000Z"),
    },
    {
      role: "user",
      content: "I will sleep tonight.",
      createdAt: new Date("2026-08-27T17:59:00.000Z"),
    },
  ], 24_000, "Asia/Kolkata");

  assert.match(history[0]?.text ?? "", /Thursday, 27 August 2026/);
  assert.match(history[0]?.text ?? "", /Asia\/Kolkata/);
  assert.match(history[0]?.text ?? "", /I will sleep tonight/);
  assert.match(history[1]?.text ?? "", /Will you sleep soon/);
});

test("formats the session clock in the member's timezone", () => {
  assert.match(
    formatCoachLocalDateTime(new Date("2026-08-28T09:00:00.000Z"), "Asia/Kolkata"),
    /Friday, 28 August 2026.*2:30:00 pm.*Asia\/Kolkata/,
  );
});
