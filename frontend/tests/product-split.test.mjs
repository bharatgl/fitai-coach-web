import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("parks FitAI and Career entry points while preserving their implementation", async () => {
  const [root, flags, fitness, fitnessEntry, fitnessStyles, fitnessCoach, career, exercises, careerUi, careerStyles, workspace] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/product-flags.server.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/fitness/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/FitAIEntry.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/FitAIEntry.module.css", import.meta.url), "utf8"),
    readFile(new URL("../components/FitAICoach.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/career/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/exercises/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/CareerReadiness.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/CareerReadiness.module.css", import.meta.url), "utf8"),
    readFile(new URL("../components/SpecialistWorkspace.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(root, /LandingPage/);
  assert.match(flags, /SHOW_FITNESS_PRODUCT === "true"/);
  assert.match(flags, /SHOW_CAREER_PRODUCT === "true"/);
  assert.match(fitness, /if \(!productFlags\(\)\.showFitness\) redirect\("\/"\)/);
  assert.match(fitness, /FitAIEntry/);
  assert.match(fitnessEntry, /Adaptive training/);
  assert.match(fitnessEntry, /Check readiness/);
  assert.match(fitnessEntry, /Execute the plan/);
  assert.match(fitnessEntry, /Adapt what comes next/);
  assert.match(fitnessStyles, /#c8ff4b|#b9f35a/i);
  assert.match(fitnessCoach, /Build a plan you can actually train/);
  assert.match(fitnessCoach, /Training setup progress/);
  assert.match(fitnessCoach, /Build my first plan/);
  assert.match(career, /CareerProductEntry/);
  assert.match(career, /if \(!productFlags\(\)\.showCareer\) redirect\("\/"\)/);
  assert.match(exercises, /if \(!productFlags\(\)\.showFitness\) redirect\("\/"\)/);
  assert.match(careerUi, /\/v1\/career\/overview/);
  assert.match(careerUi, /\/v1\/career\/profile/);
  assert.match(careerUi, /\/v1\/career\/targets/);
  assert.match(careerUi, /\/v1\/career\/applications/);
  assert.match(careerUi, /\/v1\/career\/interviews/);
  assert.match(careerUi, /does not submit external applications/i);
  assert.match(careerUi, /Private career workspace/);
  assert.match(careerUi, /READINESS PATH/);
  assert.match(careerUi, /Loading your brief/);
  assert.doesNotMatch(careerUi, /ROLE BRIEF · IN PROGRESS/);
  assert.match(careerStyles, /--career-bg: #0b0f14/);
  assert.match(workspace, /Finish & get feedback/);
  assert.match(workspace, /grounded excerpts/);
});
