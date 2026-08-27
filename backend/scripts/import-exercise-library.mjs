import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const EXPECTED_EXERCISE_COUNT = 1_324;
const SOURCE_REPOSITORY = "https://github.com/hasaneyldrm/exercises-dataset";
const OUTPUT_PATH = fileURLToPath(new URL("../src/data/exercises.json", import.meta.url));

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function requiredString(value, field, sourceId) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Exercise ${sourceId ?? "unknown"} has an invalid ${field}`);
  }
  return value.trim();
}

function requiredStrings(value, field, sourceId) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Exercise ${sourceId} has no ${field}`);
  }
  return value.map((item) => requiredString(item, field, sourceId));
}

const sourcePath = argument("--source");
const sourceCommit = argument("--source-commit");
if (!sourcePath || !sourceCommit) {
  throw new Error(
    "Usage: npm run exercises:import -- --source /path/to/exercises.json --source-commit <sha>",
  );
}

const source = JSON.parse(await readFile(resolve(sourcePath), "utf8"));
if (!Array.isArray(source) || source.length !== EXPECTED_EXERCISE_COUNT) {
  throw new Error(
    `Expected ${EXPECTED_EXERCISE_COUNT} source exercises, received ${Array.isArray(source) ? source.length : "non-array data"}`,
  );
}

const exercises = source.map((exercise) => {
  const sourceId = requiredString(exercise.id, "id");
  return {
    id: `opengym-${sourceId}`,
    sourceId,
    name: requiredString(exercise.name, "name", sourceId),
    bodyPart: requiredString(exercise.body_part, "body_part", sourceId),
    equipment: requiredString(exercise.equipment, "equipment", sourceId),
    target: requiredString(exercise.target, "target", sourceId),
    muscleGroup: requiredString(exercise.muscle_group, "muscle_group", sourceId),
    secondaryMuscles: Array.isArray(exercise.secondary_muscles)
      ? exercise.secondary_muscles.map((item) => requiredString(item, "secondary_muscles", sourceId))
      : [],
    instructions: requiredStrings(
      exercise.instruction_steps?.en,
      "English instruction steps",
      sourceId,
    ),
  };
});

const ids = new Set(exercises.map(({ id }) => id));
if (ids.size !== exercises.length) {
  throw new Error("The source dataset contains duplicate exercise IDs");
}

exercises.sort((left, right) =>
  left.name.localeCompare(right.name, "en", { sensitivity: "base" }) ||
  left.id.localeCompare(right.id),
);

const output = {
  schemaVersion: 1,
  source: {
    name: "Exercises Dataset",
    repository: SOURCE_REPOSITORY,
    commit: sourceCommit,
    license: "MIT",
    importedFields: "Non-media metadata and English instruction text only",
  },
  exercises,
};

await writeFile(OUTPUT_PATH, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(`Imported ${exercises.length} exercises into ${OUTPUT_PATH}`);
