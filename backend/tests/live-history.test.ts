import assert from "node:assert/strict";
import test from "node:test";
import { compactLiveHistory } from "../src/domain/live-history.js";

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
