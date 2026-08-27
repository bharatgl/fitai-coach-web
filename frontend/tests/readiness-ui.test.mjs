import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("shows a compact mobile readiness check-in and updates dashboard context", async () => {
  const [component, coach, styles] = await Promise.all([
    readFile(new URL("../components/ReadinessCheckIn.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/FitAICoach.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(component, /\/v1\/readiness/);
  assert.match(component, /self-reported/);
  assert.match(component, /type="range"/);
  assert.match(component, /busy=\{saving\}/);
  assert.match(coach, /latestReadiness: checkIn/);
  assert.match(styles, /\.readiness-summary/);
  assert.match(styles, /@media\(max-width:600px\).*readiness-summary/s);
});
