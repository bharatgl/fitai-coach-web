import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

test("persists isolated coach conversations with management routes", async () => {
  const source = await readFile(
    new URL("../src/routes/coach.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /get\("\/v1\/coach\/threads"/);
  assert.match(source, /post\("\/v1\/coach\/threads"/);
  assert.match(source, /scope: z\.enum\(\["general", "plan"\]\)/);
  assert.match(source, /scope: thread\.scope/);
  assert.match(source, /patch\("\/v1\/coach\/threads\/:threadId"/);
  assert.match(source, /pinned: z\.boolean\(\)\.optional\(\)/);
  assert.match(source, /archived: z\.boolean\(\)\.optional\(\)/);
  assert.match(source, /sort\(\{ archived: 1, pinned: -1, updatedAt: -1 \}\)/);
  assert.match(source, /delete\("\/v1\/coach\/threads\/:threadId"/);
  assert.match(source, /patch\(\s*"\/v1\/coach\/messages\/:messageId"/);
  assert.match(source, /\{ userId: user\.id, threadId, createdAt:/);
  assert.match(source, /role: "user"/);
  assert.match(source, /deleteMany\(\{[\s\S]*threadId/);
  assert.match(source, /migrateLegacyMessages/);
  assert.match(source, /post\(\s*"\/v1\/coach\/attachments"/);
  assert.match(source, /get\("\/v1\/coach\/attachments\/:attachmentId"/);
  assert.match(source, /attachmentSignatureMatches/);
  assert.match(source, /maxAttachmentBytes = 5 \* 1024 \* 1024/);
  assert.match(source, /messageId: userMessage\.id/);
  assert.match(source, /dataBase64: Buffer\.from/);
  assert.match(source, /threadId: input\.threadId \?\? null/);
  assert.match(source, /shouldReuseRecentCoachAttachments\(message\)/);
  assert.match(source, /threadId, messageId: \{ \$ne: null \}/);
  assert.match(source, /limit\(maxAttachmentsPerMessage\)/);
  assert.match(source, /post\(\s*"\/v1\/coach\/live-avatar-token"/);
  assert.match(source, /post\(\s*"\/v1\/coach\/elevenlabs-session"/);
  assert.match(source, /post\(\s*"\/v1\/coach\/live-camera-analysis"/);
  assert.match(source, /post\(\s*"\/v1\/coach\/live-attachment-review"/);
  assert.match(source, /post\(\s*"\/v1\/coach\/generated-pdfs"/);
  assert.match(source, /call review_recent_attachment before answering/);
  assert.match(source, /call create_pdf_document/);
  assert.match(source, /shouldGenerateCoachPdf\(input\.message\)/);
  assert.match(source, /clientTurnId: z\.string\(\)\.uuid\(\)\.optional\(\)/);
  assert.match(source, /\{ userId: user\.id, clientTurnId, role: "user" \}/);
  assert.match(source, /analyzeCameraFrame/);
  assert.match(source, /bodyLimit: 1_350_000/);
  assert.match(source, /createElevenLabsSignedUrl/);
  assert.match(source, /user_name: userName/);
  assert.match(source, /https:\/\/api\.simli\.ai\/compose\/token/);
  assert.match(source, /"x-simli-api-key": config\.SIMLI_API_KEY/);
  assert.match(source, /natural Indian English cadence/);
  assert.match(source, /Hindi, Punjabi, or Hinglish/);
  assert.match(source, /call analyze_camera_view before answering/);
});
