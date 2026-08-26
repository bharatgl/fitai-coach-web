import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("shows a public landing page and protects the coaching workspace", async () => {
  const [page, landing, landingStyles, tokenFactory, apiClient, coach, movementTracker] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/LandingPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/LandingPage.module.css", import.meta.url), "utf8"),
    readFile(new URL("../lib/backend-token.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/api.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/FitAICoach.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/MovementTracker.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /await auth\(\)/);
  assert.match(page, /return <LandingPage \/>/);
  assert.match(landing, /href="\/signin"/);
  assert.match(landing, /Build strength/);
  assert.doesNotMatch(landing, /Adapt as you go/);
  assert.match(landing, /One focused training system/);
  assert.match(landing, /BrandLockup/);
  assert.match(landing, /On-device tracking/);
  assert.match(landingStyles, /@media \(max-width: 60rem\)/);
  assert.match(landingStyles, /@media \(max-width: 48rem\)/);
  assert.match(landingStyles, /@media \(max-width: 36rem\)/);
  assert.match(landingStyles, /@media \(max-width: 24rem\)/);
  assert.match(tokenFactory, /setExpirationTime\("5m"\)/);
  assert.match(tokenFactory, /setAudience\("fitai-backend"\)/);
  assert.match(apiClient, /\/api\/backend/);
  assert.match(coach, /\/v1\/dashboard/);
  assert.match(coach, /\/v1\/coach\/messages/);
  assert.match(coach, /sessionId: activeSessionId/);
  assert.match(coach, /\/v1\/coach\/threads/);
  assert.doesNotMatch(coach, /New chat/);
  assert.doesNotMatch(coach, /new-chat-button/);
  assert.doesNotMatch(coach, /thread-menu-trigger/);
  assert.match(coach, /Your profile and conversation stay in context/);
  assert.match(coach, /className="coach-suggestions"/);
  assert.match(coach, /Save and resend/);
  assert.match(coach, /Attach images or PDF/);
  assert.match(coach, /\/v1\/coach\/attachments/);
  assert.match(coach, /MessageAttachments/);
  assert.match(coach, /maxCoachAttachmentBytes/);
  assert.match(coach, /name="dietaryPreference"/);
  assert.match(coach, /plan-overview/);
  assert.match(coach, /plan-week-tabs/);
  assert.match(coach, /plan-session-grid/);
  assert.match(coach, /How to read your plan/);
  assert.match(coach, /Deload/);
  assert.match(coach, /className="session-status"/);
  assert.match(coach, /\/v1\/plans\/generate/);
  assert.match(coach, /\/v1\/workouts\/\$\{plannedWorkoutId\}\/start/);
  assert.match(coach, /\/v1\/workout-sessions\/\$\{session\.id\}\/sets/);
  assert.match(coach, /\/v1\/workout-sessions\/\$\{session\.id\}\/finish/);
  assert.match(coach, /WorkoutRunner/);
  assert.match(movementTracker, /visibilitychange/);
  assert.match(movementTracker, /movementRuntimeSettings/);
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
  assert.match(uiStyles, /color-scheme: dark/);
  assert.match(uiStyles, /\.ui-button[\s\S]*border-radius: 0\.8rem/);
  assert.match(uiStyles, /backdrop-filter: blur\(24px\)/);
  assert.match(coach, /className="mobile-nav hidden"/);
  assert.match(coach, /className="mobile-header hidden"/);
  assert.match(coach, /aria-label="Primary navigation"/);
  assert.match(coach, /aria-current=/);
  assert.match(styles, /env\(safe-area-inset-bottom\)/);
  assert.match(styles, /@media\(max-width:380px\)/);
  assert.match(styles, /\.coach-workspace/);
  assert.match(styles, /\.plan-session-grid/);
  assert.match(styles, /\.plan-guide-grid/);
  assert.match(styles, /\.coach-suggestions/);
  assert.match(styles, /\.composer-attachments/);
  assert.match(styles, /\.message-attachment-image/);
  assert.match(styles, /forgefit\.space dark glass system/);
  assert.match(styles, /\.sidebar[\s\S]*backdrop-filter:blur\(28px\)/);
  assert.match(styles, /\.sidebar nav button[\s\S]*border-radius:\.8rem/);
  assert.match(styles, /box-shadow:inset 3px 0 #c8ff4b/);
  assert.match(styles, /\.session-status[\s\S]*align-self:start/);
  assert.match(styles, /\.plan-overview[\s\S]*radial-gradient/);
});
