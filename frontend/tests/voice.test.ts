import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  collectSpeechTranscript,
  speechRecognitionConstructor,
  speechRecognitionErrorMessage,
  type BrowserSpeechRecognition,
  type SpeechRecognitionConstructor,
} from "../lib/voice.js";

class FakeRecognition implements BrowserSpeechRecognition {
  continuous = false;
  interimResults = false;
  lang = "";
  onstart = null;
  onresult = null;
  onerror = null;
  onend = null;
  start() {}
  stop() {}
  abort() {}
}

test("uses the standard speech recognizer before the prefixed fallback", () => {
  class StandardRecognition extends FakeRecognition {}
  class PrefixedRecognition extends FakeRecognition {}
  const standard = StandardRecognition as SpeechRecognitionConstructor;
  const prefixed = PrefixedRecognition as SpeechRecognitionConstructor;

  assert.equal(speechRecognitionConstructor({
    SpeechRecognition: standard,
    webkitSpeechRecognition: prefixed,
  }), standard);
  assert.equal(speechRecognitionConstructor({ webkitSpeechRecognition: prefixed }), prefixed);
  assert.equal(speechRecognitionConstructor({}), null);
});

test("combines final and interim recognition results without retaining audio", () => {
  const transcript = collectSpeechTranscript({
    resultIndex: 0,
    results: Object.assign([
      Object.assign([{ transcript: "  How many reps  " }], { isFinal: true }),
      Object.assign([{ transcript: " should I do " }], { isFinal: false }),
    ], { length: 2 }),
  });

  assert.deepEqual(transcript, {
    finalTranscript: "How many reps",
    interimTranscript: "should I do",
    combinedTranscript: "How many reps should I do",
  });
  assert.equal("audio" in transcript, false);
});

test("turns browser speech failures into actionable text fallbacks", () => {
  assert.match(speechRecognitionErrorMessage("not-allowed"), /permission was denied/i);
  assert.match(speechRecognitionErrorMessage("no-speech"), /No speech was detected/);
  assert.match(speechRecognitionErrorMessage("audio-capture"), /No microphone/);
  assert.match(speechRecognitionErrorMessage("network"), /speech service is unavailable/);
});

test("keeps the implemented voice fallback out of the client dependency graph", async () => {
  const packageJson = JSON.parse(await readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  )) as { dependencies: Record<string, string> };
  assert.equal(packageJson.dependencies["@google/genai"], undefined);
});
