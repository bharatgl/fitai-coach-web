import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_EXERCISES = 302;
const EXPECTED_FRAMES = 906;
const REPOSITORY = "https://github.com/bryllim/workout-guide";
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DATA_OUTPUT = join(ROOT, "frontend/data/workout-guide-exercises.json");
const MEDIA_OUTPUT = join(ROOT, "frontend/public/exercises/workout-guide");

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredString(value, field, id = "unknown") {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Workout Guide exercise ${id} has an invalid ${field}`);
  }
  return value.trim();
}

function requiredStrings(value, field, id) {
  if (!Array.isArray(value)) {
    throw new Error(`Workout Guide exercise ${id} has an invalid ${field}`);
  }
  return value.map((item) => requiredString(item, field, id));
}

const sourceDirectory = argument("--source");
const sourceCommit = argument("--source-commit");
if (!sourceDirectory || !sourceCommit) {
  throw new Error(
    "Usage: npm run exercises:import:workout-guide -- --source /path/to/workout-guide --source-commit <sha>",
  );
}

const sourceRoot = resolve(sourceDirectory);
const packageRoot = join(sourceRoot, "packages/workout-guide");
const manifest = JSON.parse(await readFile(join(packageRoot, "manifest.json"), "utf8"));
if (!Array.isArray(manifest) || manifest.length !== EXPECTED_EXERCISES) {
  throw new Error(
    `Expected ${EXPECTED_EXERCISES} Workout Guide exercises, received ${Array.isArray(manifest) ? manifest.length : "invalid data"}`,
  );
}

const exercises = [];
let copiedFrames = 0;
for (const exercise of manifest) {
  const id = requiredString(exercise.id, "id");
  const slug = requiredString(exercise.slug, "slug", id);
  if (!/^exercise-[a-z0-9-]+$/.test(id) || !/^[a-z0-9-]+$/.test(slug)) {
    throw new Error(`Workout Guide exercise ${id} has an unsafe identifier`);
  }
  if (!Array.isArray(exercise.frames) || exercise.frames.length !== 3) {
    throw new Error(`Workout Guide exercise ${id} must have exactly three frames`);
  }

  const frames = [];
  for (const [position, frame] of exercise.frames.entries()) {
    const expectedPath = `assets/${slug}/frame-${position + 1}.svg`;
    if (frame.index !== position + 1 || frame.path !== expectedPath || frame.format !== "svg") {
      throw new Error(`Workout Guide exercise ${id} has an unexpected frame manifest`);
    }
    if (frame.width !== 512 || frame.height !== 512) {
      throw new Error(`Workout Guide exercise ${id} frame is not 512 by 512`);
    }

    const sourcePath = join(packageRoot, expectedPath);
    const svg = await readFile(sourcePath, "utf8");
    if (
      !svg.startsWith("<svg")
      || /<script|<foreignObject|\bon[a-z]+\s*=|(?:href|src)\s*=\s*["'](?:https?:|\/\/|data:)/i.test(svg)
    ) {
      throw new Error(`Workout Guide exercise ${id} contains an unsafe SVG frame`);
    }

    const outputDirectory = join(MEDIA_OUTPUT, "assets", slug);
    await mkdir(outputDirectory, { recursive: true });
    await copyFile(sourcePath, join(outputDirectory, `frame-${position + 1}.svg`));
    frames.push(`/exercises/workout-guide/assets/${slug}/frame-${position + 1}.svg`);
    copiedFrames += 1;
  }

  exercises.push({
    id,
    slug,
    name: requiredString(exercise.name, "name", id),
    exerciseType: requiredString(exercise.exerciseType, "exerciseType", id),
    equipment: requiredString(exercise.equipment, "equipment", id),
    primaryMuscle: requiredString(exercise.primaryMuscle, "primaryMuscle", id),
    secondaryMuscles: requiredStrings(exercise.secondaryMuscles, "secondaryMuscles", id),
    frames,
  });
}

if (copiedFrames !== EXPECTED_FRAMES) {
  throw new Error(`Expected ${EXPECTED_FRAMES} Workout Guide frames, copied ${copiedFrames}`);
}
if (new Set(exercises.map(({ id }) => id)).size !== EXPECTED_EXERCISES) {
  throw new Error("Workout Guide manifest contains duplicate exercise IDs");
}

exercises.sort((left, right) => left.name.localeCompare(right.name, "en"));
const output = {
  schemaVersion: 1,
  source: {
    name: "Workout Guide",
    repository: REPOSITORY,
    homepage: "https://bryllim.github.io/workout-guide/",
    commit: sourceCommit,
    license: "CC BY-SA 4.0",
    attribution: "Exercise artwork by Bryl Lim, derived in part from Everkinetic",
    changes: "No changes to the imported SVG artwork; frames are sequenced by ForgeFit UI.",
  },
  exercises,
};

await mkdir(dirname(DATA_OUTPUT), { recursive: true });
await writeFile(DATA_OUTPUT, `${JSON.stringify(output, null, 2)}\n`, "utf8");
for (const notice of ["LICENSE-ASSETS", "ATTRIBUTION.md", "LICENSES.md"]) {
  await copyFile(join(packageRoot, notice), join(MEDIA_OUTPUT, notice));
}

console.log(`Imported ${exercises.length} Workout Guide exercises and ${copiedFrames} SVG frames`);
