import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("presents the unified agent platform and a controlled creation journey", async () => {
  const [page, landing, styles, layout, brand, favicon, unifiedFavicon, providers, globals] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/LandingPage.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/LandingPage.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/BrandLockup.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/favicon.svg", import.meta.url), "utf8"),
    readFile(new URL("../public/unified-favicon.svg", import.meta.url), "utf8"),
    readFile(new URL("../components/AppProviders.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(landing, /"use client"/);
  assert.match(landing, /Agent Studio · Cloud · Edge/);
  assert.match(landing, /Build the agent[\s\S]*Decide where it runs/);
  assert.match(landing, /Describe the outcome/);
  assert.match(landing, /Review the plan/);
  assert.match(landing, /Test what matters/);
  assert.match(landing, /Release with control/);
  assert.match(landing, /Voice never becomes publish permission/);
  assert.match(landing, /Nothing is silently published or deployed/);
  assert.match(landing, /Edge runtime in development/);

  assert.match(landing, /Hosted page/);
  assert.match(landing, /Web embed/);
  assert.match(landing, /JavaScript \+ React/);
  assert.match(landing, /API \+ realtime/);
  assert.match(landing, /Edge Hub/);
  assert.match(landing, /managed credits/);
  assert.match(landing, /bring approved provider credentials/);
  assert.match(landing, /showFitness \|\| showCareer/);
  assert.match(landing, /Legacy products remain preserved behind server-controlled rollback flags/);

  assert.match(landing, /aria-label="Product navigation"/);
  assert.match(landing, /aria-label="Platform availability"/);
  assert.match(landing, /aria-label="Conversation trace preview"/);
  assert.match(styles, /prefers-reduced-motion: reduce/);
  assert.match(styles, /:focus-visible/);
  assert.match(styles, /@media \(max-width: 48rem\)/);
  assert.match(styles, /@media \(max-width: 24rem\)/);
  assert.doesNotMatch(styles, /#c8ff4b|#b9f35a|#c7fa45/i);

  assert.match(page, /Unified — Build, test, and deploy agents across Cloud and Edge/);
  assert.match(page, /unified-favicon\.svg/);
  assert.match(layout, /Unified Agents — Build, test, and deploy AI agents/);
  assert.match(brand, /forgefit\.space/);
  assert.match(favicon, /#B9EF32/);
  assert.match(unifiedFavicon, /#1B1E25/);
  assert.doesNotMatch(providers, /data-theme|forgefit-theme-toggle|matchMedia/);
  assert.doesNotMatch(globals, /data-theme="dark"[\s\S]*BotStudio-module/);
});
