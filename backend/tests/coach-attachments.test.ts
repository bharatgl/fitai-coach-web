import assert from "node:assert/strict";
import test from "node:test";
import { shouldReuseRecentCoachAttachments } from "../src/domain/coach-attachments.js";

test("recognizes follow-ups that need a recent conversation attachment", () => {
  for (const message of [
    "Review the file I uploaded",
    "What does that PDF say?",
    "Please analyse this image",
    "Summarize it for me",
    "Check the progress report",
  ]) {
    assert.equal(shouldReuseRecentCoachAttachments(message), true, message);
  }
});

test("does not resend old files for unrelated coaching messages", () => {
  for (const message of [
    "How should I warm up today?",
    "Move my workout to Friday",
    "What should I eat after training?",
  ]) {
    assert.equal(shouldReuseRecentCoachAttachments(message), false, message);
  }
});
