import assert from "node:assert/strict";
import test from "node:test";
import { parseCoachMessage } from "../components/CoachMessageContent.js";

test("structures detailed coach replies into readable blocks", () => {
  const blocks = parseCoachMessage(`## Today’s priorities

1. Bench press: 4 × 6-8
2. Chest-supported row: 3 × 8-10

Personalized from your data

- Readiness is 54/100.
- Legs are still sore.`);

  assert.deepEqual(blocks, [
    { kind: "heading", text: "Today’s priorities" },
    { kind: "steps", items: ["Bench press: 4 × 6-8", "Chest-supported row: 3 × 8-10"] },
    { kind: "paragraph", text: "Personalized from your data" },
    { kind: "bullets", items: ["Readiness is 54/100.", "Legs are still sore."] },
  ]);
});
