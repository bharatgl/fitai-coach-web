import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("uses Unified for the main product while preserving parked legacy branding", async () => {
  const [brand, layout, page, landing, signIn, coach, movementTracker] = await Promise.all([
    readFile(new URL("../components/BrandLockup.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/LandingPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/signin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/FitAICoach.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/MovementTracker.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(brand, /forgefit\.space/);
  assert.doesNotMatch(brand, /Unified agents/);
  assert.match(layout, /Unified Agents — Build, test, and deploy AI agents/);
  assert.match(page, /Unified — Build, test, and deploy agents across Cloud and Edge/);
  assert.match(landing, /UnifiedBrandLockup/);
  assert.match(landing, /aria-label="Unified agents"/);
  assert.match(landing, /Agent Studio/);
  assert.match(landing, /Cloud Runtime/);
  assert.match(landing, /Edge Runtime/);
  assert.match(signIn, /BrandLockup/);
  assert.match(signIn, /Continue building your agents/);
  assert.match(coach, /forgefit\.space could not connect/);
  assert.match(movementTracker, /forgefit\.space receives only compact rep timing/);
});
