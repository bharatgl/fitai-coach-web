import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("applies one mobile layout contract across every workspace section", async () => {
  const [styles, coach] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../components/FitAICoach.tsx", import.meta.url), "utf8"),
  ]);
  const contract = styles.slice(styles.indexOf("/* Mobile product contract"));

  assert.match(contract, /html,body\{overflow-x:clip\}/);
  assert.match(contract, /\.today-primary-grid,[^}]*\.plan-dashboard-layout,[^}]*\.history-baseline,[^}]*\.workout-command-grid\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(contract, /\.mobile-nav button\.active\{background:rgb\(200 255 75 \/ 7%\);border:0;box-shadow:none;color:#d7ff78\}/);
  assert.match(contract, /\.mobile-nav button:focus-visible\{[^}]*outline-offset:-2px/);
  assert.match(contract, /\.today-side-stack\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(contract, /\.plan-next-exercises li\{[^}]*grid-template-columns:1\.15rem minmax\(0,1fr\)/);
  assert.match(contract, /\.plan-kicker\{[^}]*grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(contract, /\.plan-overview-meta\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(contract, /\.plan-overview-meta span\{[^}]*display:grid;[^}]*min-height:3\.35rem/);
  assert.match(coach, /<span><b>\{dashboard\.activePlan\.durationWeeks\}<\/b><small>Week block<\/small><\/span>/);
  assert.match(contract, /\.plan-coach-mobile-launch\{[^}]*display:grid;[^}]*grid-template-columns:2\.25rem minmax\(0,1fr\) auto/);
  assert.match(coach, /aria-controls="plan-coach-panel"/);
  assert.match(coach, /composer\?\.scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
  assert.match(coach, /id="plan-coach-panel"/);
  assert.match(contract, /\.plan-schedule-table tr\{[^}]*grid-template-areas:"date status" "workout workout" "duration movements"/);
  assert.match(contract, /\.plan-schedule-table td:nth-child\(2\)\{[^}]*grid-area:workout/);
  assert.match(contract, /\.coach-page\{height:calc\(100dvh/);
  assert.match(contract, /\.coach-voice-home\{min-height:clamp\(23rem,48dvh,25rem\)/);
  assert.match(contract, /\.coach-voice-home-privacy,\.coach-voice-home-listening\{display:none\}/);
  assert.match(coach, /id="coach-text-chat"/);
  assert.match(coach, /aria-label="Proposed plan change"/);
  assert.match(coach, /Apply to saved plan/);
  assert.match(coach, /Keep current plan/);
  assert.match(coach, /\/v1\/plan-adjustments\/\$\{proposal\.id\}\/confirm/);
  assert.match(contract, /\.plan-adjustment-proposal>div\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(contract, /\.history-filters\{[^}]*overflow-x:auto/);
  assert.match(contract, /\.workout-live-actions\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(contract, /\.form-row,\.body-metrics,\.readiness-basics,\.readiness-ratings\{grid-template-columns:minmax\(0,1fr\)\}/);
});

test("uses a single-column exercise library on phones", async () => {
  const styles = await readFile(
    new URL("../components/ExerciseLibrary.module.css", import.meta.url),
    "utf8",
  );
  const phoneStyles = styles.slice(styles.indexOf("@media (max-width: 42rem)"));

  assert.match(phoneStyles, /\.filters \{ grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(phoneStyles, /\.grid \{[^}]*grid-template-columns: minmax\(0, 1fr\); \}/);
  assert.match(phoneStyles, /font-size: 1rem; min-height: 2\.75rem/);
  assert.match(phoneStyles, /max-height: calc\(100dvh - 1rem\)/);
});

test("keeps the plan dashboard visual-first with progressive disclosure", async () => {
  const [styles, coach] = await Promise.all([
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../components/FitAICoach.tsx", import.meta.url), "utf8"),
  ]);
  const visualDashboard = styles.slice(styles.indexOf("/* Plan analytics"));

  assert.match(coach, /className="plan-insights-grid"/);
  assert.match(coach, /className="plan-load-chart"/);
  assert.match(coach, /className="plan-focus-bars"/);
  assert.match(coach, /className="plan-progress-ring"/);
  assert.match(coach, /<details className="plan-schedule-details">/);
  assert.match(coach, /primarySession\.exercises\.slice\(0, 4\)/);
  assert.match(coach, /<details className="plan-exercise-details">/);
  assert.match(visualDashboard, /@media\(max-width:480px\)\{[^}]*\.plan-insights-grid\{grid-template-columns:minmax\(0,1fr\)\}/);
});
