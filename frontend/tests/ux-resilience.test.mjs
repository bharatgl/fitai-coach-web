import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("provides branded route, not-found, and sign-out states", async () => {
  const [loading, notFound, signOut, signIn, coach] = await Promise.all([
    readFile(new URL("../app/loading.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/not-found.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/signout/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/signin/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/FitAICoach.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(loading, /RouteSkeleton/);
  assert.match(notFound, /Page not found — forgefit\.space/);
  assert.match(notFound, /robots: \{ index: false, follow: false \}/);
  assert.match(notFound, /Your training[\s\S]*safe and unchanged/);
  assert.match(signOut, /await auth\(\)/);
  assert.match(signOut, /await signOut\(\{ redirectTo: "\/signout" \}\)/);
  assert.match(signOut, /AsyncSubmitButton/);
  assert.match(signIn, /pendingLabel="Opening secure sign in…"/);
  assert.match(coach, /href="\/signout"/);
  assert.doesNotMatch(coach, /href="\/api\/auth\/signout"/);
});

test("uses an in-memory server-state cache and lazy-loads camera tracking", async () => {
  const [coach, providers, layout, packageJson] = await Promise.all([
    readFile(new URL("../components/FitAICoach.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/AppProviders.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(packageJson, /@tanstack\/react-query/);
  assert.match(providers, /QueryClientProvider/);
  assert.match(layout, /<AppProviders>/);
  assert.match(coach, /queryKey: \["dashboard", user\.id\]/);
  assert.match(providers, /staleTime: 30_000/);
  assert.match(coach, /dynamic\([\s\S]*@\/components\/MovementTracker/);
  assert.doesNotMatch(providers, /localStorage|sessionStorage|persist\(/);
});

test("shows scoped progress for workout mutations", async () => {
  const coach = await readFile(
    new URL("../components/FitAICoach.tsx", import.meta.url),
    "utf8",
  );

  assert.match(coach, /workingAction === "status"/);
  assert.match(coach, /workingAction === "finish"/);
  assert.match(coach, /workingAction === `log-\$\{exercise\.exerciseId\}`/);
  assert.match(coach, /busy=\{startingId === primarySession\.id\}/);
});
