import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

test("persists one user-scoped readiness check-in per local date", async () => {
  const [routes, indexes, dashboard] = await Promise.all([
    readFile(new URL("../src/routes/readiness.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/db.ts", import.meta.url), "utf8"),
    readFile(new URL("../src/routes/dashboard.ts", import.meta.url), "utf8"),
  ]);

  assert.match(routes, /put\(\s*"\/v1\/readiness"/);
  assert.match(routes, /\{ userId: user\.id, date: input\.date \}/);
  assert.match(routes, /readinessInput\.parse\(request\.body\)/);
  assert.match(indexes, /\{ userId: 1, date: 1 \}, \{ unique: true \}/);
  assert.match(dashboard, /latestReadiness/);
});
