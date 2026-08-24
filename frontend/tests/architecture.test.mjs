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
  assert.match(coach, /\/v1\/coach\/threads/);
  assert.match(coach, /New chat/);
  assert.match(coach, /Rename/);
  assert.match(coach, /Save and resend/);
  assert.match(coach, /prompt-templates/);
  assert.match(coach, /plan-weeks/);
  assert.match(coach, /plan-timeline-day/);
  assert.match(coach, /\/v1\/plans\/generate/);
  assert.match(coach, /\/v1\/workouts\/\$\{plannedWorkoutId\}\/start/);
  assert.match(coach, /\/v1\/workout-sessions\/\$\{session\.id\}\/sets/);
  assert.match(coach, /\/v1\/workout-sessions\/\$\{session\.id\}\/finish/);
  assert.match(coach, /WorkoutRunner/);
});

test("contains no obsolete Cloudflare application entry points", async () => {
  const packageJson = await readFile(
    new URL("../package.json", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(packageJson, /vinext|wrangler|cloudflare/i);
  await assert.rejects(access(new URL("../vite.config.ts", import.meta.url)));
});

test("uses the shared responsive design system", async () => {
  const [layout, coach, styles, uiPackage, uiSource, uiStyles] = await Promise.all([
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/FitAICoach.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../../packages/ui/package.json", import.meta.url), "utf8"),
    readFile(new URL("../../packages/ui/src/index.tsx", import.meta.url), "utf8"),
    readFile(new URL("../../packages/ui/src/styles.css", import.meta.url), "utf8"),
  ]);

  assert.match(layout, /@fitai\/ui\/styles\.css/);
  assert.match(uiPackage, /"name": "@fitai\/ui"/);
  assert.match(uiSource, /export function Button/);
  assert.match(uiSource, /export function Field/);
  assert.match(uiSource, /export function PageHeader/);
  assert.match(uiStyles, /:focus-visible/);
  assert.match(uiStyles, /prefers-reduced-motion/);
  assert.match(coach, /className="mobile-nav hidden"/);
  assert.match(coach, /className="mobile-header hidden"/);
  assert.match(coach, /aria-label="Primary navigation"/);
  assert.match(coach, /aria-current=/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /@media\(max-width:380px\)/);
  assert.match(styles, /\.coach-workspace/);
  assert.match(styles, /\.plan-timeline/);
});
