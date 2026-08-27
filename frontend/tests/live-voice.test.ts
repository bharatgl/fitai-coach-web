import assert from "node:assert/strict";
import test from "node:test";
import { decodeLiveServerMessage } from "../lib/live-voice";

const setupComplete = { setupComplete: { sessionId: "live-session" } };
const encodedSetupComplete = JSON.stringify(setupComplete);

test("decodes Gemini Live string frames", async () => {
  assert.deepEqual(await decodeLiveServerMessage(encodedSetupComplete), setupComplete);
});

test("decodes Gemini Live Blob frames", async () => {
  const frame = new Blob([encodedSetupComplete], { type: "application/json" });
  assert.deepEqual(await decodeLiveServerMessage(frame), setupComplete);
});

test("decodes Gemini Live ArrayBuffer frames", async () => {
  const frame = new TextEncoder().encode(encodedSetupComplete).buffer;
  assert.deepEqual(await decodeLiveServerMessage(frame), setupComplete);
});
