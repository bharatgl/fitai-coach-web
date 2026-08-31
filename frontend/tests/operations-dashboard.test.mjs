import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("provides an authenticated operations dashboard with usage, health, performance, and logs", async () => {
  const [page, dashboard, styles, route, telemetry] = await Promise.all([
    readFile(new URL("../app/studio/operations/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/OperationsDashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/OperationsDashboard.module.css", import.meta.url), "utf8"),
    readFile(new URL("../../backend/src/routes/operations.ts", import.meta.url), "utf8"),
    readFile(new URL("../../backend/src/services/request-telemetry.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /await auth\(\)/);
  assert.match(page, /callbackUrl=\/studio\/operations/);
  assert.match(dashboard, /\/v1\/operations\/dashboard\?range=/);
  assert.match(dashboard, /automatic refresh every 60 seconds/);
  assert.match(dashboard, /Token usage/);
  assert.match(dashboard, /Budget guardrails/);
  assert.match(dashboard, /System health/);
  assert.match(dashboard, /API performance/);
  assert.match(dashboard, /Backend logs/);
  assert.match(dashboard, /Search backend logs/);
  assert.match(route, /providerSettingsStatus/);
  assert.match(route, /database\.command\(\{ ping: 1 \}\)/);
  assert.match(route, /OPS_MONTHLY_TOKEN_LIMIT/);
  assert.match(telemetry, /expiresAt/);
  assert.doesNotMatch(telemetry, /authorization|apiKey|prompt|content:/i);
  assert.match(styles, /@media\(max-width:760px\)/);
});
