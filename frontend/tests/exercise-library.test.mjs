import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

test("vendors and uploads the complete attributed RepDB free tier", async () => {
  const [rawData, uploadScript, landing] = await Promise.all([
    readFile(new URL("../data/repdb-exercises.json", import.meta.url), "utf8"),
    readFile(new URL("../../infra/gcp/upload-exercise-assets.sh", import.meta.url), "utf8"),
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
  assert.match(uploadScript, /frontend\/public\/exercises/);
  assert.match(uploadScript, /max-age=31536000,immutable/);
  assert.match(landing, /Exercise data by/);
  assert.match(landing, /href="\/exercises"/);
});

test("fetches paginated visual demos without bundling the source catalogs", async () => {
  const [rawReference, rawRepdb, rawWorkoutGuide, generatedDemos, component, styles, page, dockerfile] = await Promise.all([
    readFile(new URL("../../backend/src/data/exercises.json", import.meta.url), "utf8"),
    readFile(new URL("../data/repdb-exercises.json", import.meta.url), "utf8"),
    readFile(new URL("../data/workout-guide-exercises.json", import.meta.url), "utf8"),
    readFile(new URL("../../backend/src/data/exercise-demos.json", import.meta.url), "utf8"),
    readFile(new URL("../components/ExerciseLibrary.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/ExerciseLibrary.module.css", import.meta.url), "utf8"),
    readFile(new URL("../app/exercises/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
  ]);
  const reference = JSON.parse(rawReference).exercises;
  const repdb = JSON.parse(rawRepdb).exercises;
  const workoutGuide = JSON.parse(rawWorkoutGuide).exercises;
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
    ...workoutGuide.map(({ name }) => normalizedName(name)),
  ]);
  const illustratedNames = new Set([
    ...repdb.map(({ name }) => normalizedName(name)),
    ...workoutGuide.map(({ name }) => normalizedName(name)),
  ]);

  assert.equal(reference.length, 1_324);
  assert.equal(repdb.length, 250);
  assert.equal(workoutGuide.length, 302);
  assert.equal(JSON.parse(generatedDemos).exercises.length, 302);
  assert.equal(uniqueNames.size, 1_725);
  assert.equal(illustratedNames.size, 479);
  assert.doesNotMatch(component, /referenceLibraryData|repdbLibraryData|workoutGuideLibraryData/);
  assert.match(component, /useInfiniteQuery/);
  assert.match(component, /\/v1\/exercise-demos/);
  assert.match(component, /staleTime: 24 \* 60 \* 60 \* 1_000/);
  assert.match(component, /loading="lazy"/);
  assert.doesNotMatch(dockerfile, /backend\/src\/data\/exercises\.json/);
  assert.doesNotMatch(component, /seenNames|baseExercises|directoryRow/);
  assert.doesNotMatch(component, /LibraryMode|Directory|directory exercises/);
  assert.match(component, /ExercisePreview/);
  assert.match(component, /Hover to play/);
  assert.match(component, /onPointerEnter=.*setPreviewing\(true\)/);
  assert.match(component, /onPointerLeave=.*setPreviewing\(false\)/);
  assert.match(component, /role="dialog"/);
  assert.match(component, /aria-haspopup="dialog"/);
  assert.match(styles, /live-pulse/);
  assert.doesNotMatch(component, /Step-by-step text guide|Illustrated only/);
  assert.match(page, /302 animated bodybuilding/);
});

test("vendors the complete open Workout Guide demonstration set with provenance", async () => {
  const [rawData, component] = await Promise.all([
    readFile(new URL("../data/workout-guide-exercises.json", import.meta.url), "utf8"),
    readFile(new URL("../components/ExerciseLibrary.tsx", import.meta.url), "utf8"),
  ]);
  const data = JSON.parse(rawData);
  const paths = new Set();
  const animations = new Set();

  assert.equal(data.exercises.length, 302);
  assert.equal(new Set(data.exercises.map(({ id }) => id)).size, 302);
  assert.equal(data.source.commit, "aac599224bb9780305239607ef98540b7e0ce389");
  assert.equal(data.source.license, "CC BY-SA 4.0");
  assert.equal(data.schemaVersion, 2);
  assert.match(data.source.changes, /SVG artwork is unmodified.*generated looping GIF previews/);
  for (const exercise of data.exercises) {
    assert.equal(exercise.frames.length, 3);
    assert.match(exercise.animation, /^\/exercises\/workout-guide\/assets\/[a-z0-9-]+\/movement\.gif$/);
    animations.add(exercise.animation);
    const animation = await readFile(new URL(`../public${exercise.animation}`, import.meta.url));
    assert.equal(animation.subarray(0, 6).toString("ascii"), "GIF89a");
    for (const path of exercise.frames) {
      assert.match(path, /^\/exercises\/workout-guide\/assets\/[a-z0-9-]+\/frame-[123]\.svg$/);
      paths.add(path);
      await access(new URL(`../public${path}`, import.meta.url));
    }
  }

  assert.equal(paths.size, 906);
  assert.equal(animations.size, 302);
  await access(new URL("../public/exercises/workout-guide/LICENSE-ASSETS", import.meta.url));
  await access(new URL("../public/exercises/workout-guide/ATTRIBUTION.md", import.meta.url));
  assert.match(component, /creativecommons\.org\/licenses\/by-sa\/4\.0/);
  assert.match(component, /GIF previews only sequence the supplied frames/);
});
