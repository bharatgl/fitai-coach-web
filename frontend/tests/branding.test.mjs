import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("presents forgefit.space consistently across public product surfaces", async () => {
  const [brand, layout, landing, signIn, coach, movementTracker] = await Promise.all([
    readFile(new URL("../components/BrandLockup.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/LandingPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/signin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/FitAICoach.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/MovementTracker.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(brand, /forgefit/);
  assert.match(brand, /\.space/);
  assert.match(layout, /forgefit\.space — Adaptive training intelligence/);
  assert.match(landing, /BrandLockup/);
  assert.doesNotMatch(landing, /FitAI Coach/);
  assert.match(signIn, /BrandLockup/);
  assert.match(coach, /forgefit\.space could not connect/);
  assert.match(movementTracker, /forgefit\.space receives only compact rep timing/);
});
