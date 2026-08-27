import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("vendors the complete RepDB free tier as attributed in-app exercise visuals", async () => {
  const [rawData, component, landing] = await Promise.all([
    readFile(new URL("../data/repdb-exercises.json", import.meta.url), "utf8"),
    readFile(new URL("../components/ExerciseLibrary.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/LandingPage.tsx", import.meta.url), "utf8"),
  ]);
  const data = JSON.parse(rawData);

  assert.equal(data.exercises.length, 250);
  assert.equal(new Set(data.exercises.map(({ id }) => id)).size, 250);
  assert.equal(data.source.commit, "045845b61e4aefd9e684fa84518b84c665ea3cd3");
  assert.match(data.source.license, /RepDB Free Tier License/);
  assert.doesNotMatch(rawData, /premium-samples|Gym visual/i);

  const paths = new Set();
  for (const exercise of data.exercises) {
    assert.ok(exercise.instructions.length > 0);
    assert.ok(exercise.primaryMuscles.length > 0);
    const exercisePaths = Object.values(exercise.images);
    assert.ok(exercisePaths.length >= 1);
    for (const path of exercisePaths) {
      assert.match(path, /^\/exercises\/repdb\/images\/[a-z0-9-]+\.webp$/);
      paths.add(path);
      await access(new URL(`../public${path}`, import.meta.url));
    }
  }
  assert.equal(paths.size, 459);
  await access(new URL("../public/exercises/repdb/LICENSE-DATA.md", import.meta.url));
  assert.match(component, /exercise data by/i);
  assert.match(component, /https:\/\/repdb\.co/);
  assert.match(landing, /Exercise data by/);
  assert.match(landing, /href="\/exercises"/);
});

test("presents the complete reference and RepDB libraries as one deduplicated catalogue", async () => {
  const [rawReference, rawRepdb, component, page] = await Promise.all([
    readFile(new URL("../../backend/src/data/exercises.json", import.meta.url), "utf8"),
    readFile(new URL("../data/repdb-exercises.json", import.meta.url), "utf8"),
    readFile(new URL("../components/ExerciseLibrary.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/exercises/page.tsx", import.meta.url), "utf8"),
  ]);
  const reference = JSON.parse(rawReference).exercises;
  const repdb = JSON.parse(rawRepdb).exercises;
  const normalizedName = (value) => value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
  const uniqueNames = new Set([
    ...reference.map(({ name }) => normalizedName(name)),
    ...repdb.map(({ name }) => normalizedName(name)),
  ]);

  assert.equal(reference.length, 1_324);
  assert.equal(repdb.length, 250);
  assert.equal(uniqueNames.size, 1_521);
  assert.match(component, /referenceLibraryData\.exercises/);
  assert.match(component, /repdbLibraryData\.exercises/);
  assert.match(component, /seenNames\.has/);
  assert.match(component, /Illustrated only/);
  assert.match(page, /more than 1,500 bodybuilding/);
});
