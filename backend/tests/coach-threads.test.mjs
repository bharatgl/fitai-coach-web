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
  assert.match(source, /patch\("\/v1\/coach\/threads\/:threadId"/);
  assert.match(source, /delete\("\/v1\/coach\/threads\/:threadId"/);
  assert.match(source, /patch\(\s*"\/v1\/coach\/messages\/:messageId"/);
  assert.match(source, /\{ userId: user\.id, threadId, createdAt:/);
  assert.match(source, /role: "user"/);
  assert.match(source, /deleteMany\(\{[\s\S]*threadId/);
  assert.match(source, /migrateLegacyMessages/);
});
