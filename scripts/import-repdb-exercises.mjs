import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_COUNT = 250;
const REPOSITORY = "https://github.com/RepDB/exercise-dataset";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA_OUTPUT = join(ROOT, "frontend/data/repdb-exercises.json");
const MEDIA_OUTPUT = join(ROOT, "frontend/public/exercises/repdb");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredString(value, field, id = "unknown") {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`RepDB exercise ${id} has an invalid ${field}`);
  }
  return value.trim();
}

function strings(value, field, id, required = false) {
  if (value == null && !required) return [];
  if (!Array.isArray(value) || (required && value.length === 0)) {
    throw new Error(`RepDB exercise ${id} has an invalid ${field}`);
  }
  return value.map((item) => requiredString(item, field, id));
}

const sourceDirectory = argument("--source");
const sourceCommit = argument("--source-commit");
if (!sourceDirectory || !sourceCommit) {
  throw new Error(
    "Usage: npm run exercises:import:repdb -- --source /path/to/RepDB/exercise-dataset --source-commit <sha>",
  );
}

const sourceRoot = resolve(sourceDirectory);
const source = JSON.parse(await readFile(join(sourceRoot, "exercises.json"), "utf8"));
if (source.count !== EXPECTED_COUNT || source.exercises?.length !== EXPECTED_COUNT) {
  throw new Error(
    `Expected ${EXPECTED_COUNT} RepDB exercises, received ${source.exercises?.length ?? "invalid data"}`,
  );
}

await mkdir(join(MEDIA_OUTPUT, "images"), { recursive: true });
const copiedImages = new Set();

async function importImage(relativePath, id) {
  const path = requiredString(relativePath, "image path", id);
  if (!/^images\/flat\/[a-z0-9-]+\.webp$/.test(path)) {
    throw new Error(`RepDB exercise ${id} references an unexpected image path: ${path}`);
  }
  const fileName = basename(path);
  if (!copiedImages.has(fileName)) {
    await copyFile(join(sourceRoot, path), join(MEDIA_OUTPUT, "images", fileName));
    copiedImages.add(fileName);
  }
  return `/exercises/repdb/images/${fileName}`;
}

const exercises = [];
for (const exercise of source.exercises) {
  const id = requiredString(exercise.id, "id");
  const flat = exercise.images?.flat;
  const images = flat?.main
    ? { main: await importImage(flat.main, id) }
    : flat?.start && flat?.peak
      ? {
          start: await importImage(flat.start, id),
          peak: await importImage(flat.peak, id),
        }
      : null;
  if (!images) throw new Error(`RepDB exercise ${id} has no usable flat images`);

  exercises.push({
    id,
    name: requiredString(exercise.name_en, "name_en", id),
    description: requiredString(exercise.description_en, "description_en", id),
    category: requiredString(exercise.category, "category", id),
    difficulty: requiredString(exercise.difficulty, "difficulty", id),
    equipment: typeof exercise.equipment === "string" ? exercise.equipment : "bodyweight",
    bodyPart: requiredString(exercise.body_part, "body_part", id),
    primaryMuscles: strings(exercise.primary_muscles, "primary_muscles", id, true),
    secondaryMuscles: strings(exercise.secondary_muscles, "secondary_muscles", id),
    goals: strings(exercise.goals, "goals", id),
    instructions: strings(exercise.instructions_en, "instructions_en", id, true),
    tips: strings(exercise.tips_en, "tips_en", id),
    images,
  });
}

if (new Set(exercises.map(({ id }) => id)).size !== EXPECTED_COUNT) {
  throw new Error("RepDB source contains duplicate exercise IDs");
}

exercises.sort((left, right) => left.name.localeCompare(right.name, "en"));
const output = {
  schemaVersion: 1,
  source: {
    name: "RepDB free tier",
    repository: REPOSITORY,
    homepage: "https://repdb.co",
    commit: sourceCommit,
    license: "RepDB Free Tier License v1.0",
    attribution: "Exercise data by RepDB (repdb.co)",
  },
  exercises,
};

await mkdir(dirname(DATA_OUTPUT), { recursive: true });
await writeFile(DATA_OUTPUT, `${JSON.stringify(output, null, 2)}\n`, "utf8");
await copyFile(join(sourceRoot, "LICENSE-DATA.md"), join(MEDIA_OUTPUT, "LICENSE-DATA.md"));
await copyFile(join(sourceRoot, "ATTRIBUTION.md"), join(MEDIA_OUTPUT, "ATTRIBUTION.md"));

console.log(
  `Imported ${exercises.length} RepDB exercises and ${copiedImages.size} licensed images`,
);
