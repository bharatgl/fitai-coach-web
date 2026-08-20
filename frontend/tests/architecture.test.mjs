import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("protects the app and calls the authenticated backend", async () => {
  const [page, tokenFactory, apiClient, coach] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/backend-token.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/api.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/FitAICoach.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /await auth\(\)/);
  assert.match(page, /redirect\("\/signin"\)/);
  assert.match(tokenFactory, /setExpirationTime\("5m"\)/);
  assert.match(tokenFactory, /setAudience\("fitai-backend"\)/);
  assert.match(apiClient, /\/api\/backend/);
  assert.match(coach, /\/v1\/dashboard/);
  assert.match(coach, /\/v1\/coach\/messages/);
  assert.match(coach, /\/v1\/plans\/generate/);
});

test("contains no obsolete Cloudflare application entry points", async () => {
  const packageJson = await readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(packageJson, /vinext|wrangler|cloudflare/i);
  await assert.rejects(access(new URL("../vite.config.ts", import.meta.url)));
});
