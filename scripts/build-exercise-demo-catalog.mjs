import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const referencePath = join(root, "backend/src/data/exercises.json");
const workoutGuidePath = join(root, "frontend/data/workout-guide-exercises.json");
const outputPath = join(root, "backend/src/data/exercise-demos.json");

const [referenceData, workoutGuideData] = await Promise.all([
  readFile(referencePath, "utf8").then(JSON.parse),
  readFile(workoutGuidePath, "utf8").then(JSON.parse),
]);

function normalizedName(value) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function readable(value) {
  return value.replaceAll("_", " ").trim().toLowerCase();
}

function normalizedTaxonomy(value) {
  const normalized = readable(value);
  return normalized === "bodyweight" ? "body weight" : normalized;
}

function bodyPartForMuscle(value) {
  const muscle = value.toLowerCase();
  if (muscle === "chest") return "chest";
  if (["shoulders", "rear delts"].includes(muscle)) return "shoulders";
  if (["biceps", "triceps"].includes(muscle)) return "upper arms";
  if (muscle === "forearms") return "lower arms";
  if (muscle === "calves") return "lower legs";
  if (muscle === "core") return "waist";
  if (["back", "lats", "lower back", "upper back", "posterior chain"].includes(muscle)) return "back";
  if (["quads", "hamstrings", "glutes", "adductors", "legs", "hips"].includes(muscle)) return "upper legs";
  return "full body";
}

const referenceByName = new Map(
  referenceData.exercises.map((exercise) => [normalizedName(exercise.name), exercise]),
);
const exercises = workoutGuideData.exercises
  .map((exercise) => {
    const normalized = normalizedName(exercise.name);
    const reference = referenceByName.get(normalized);
    const primaryMuscle = reference?.target ?? exercise.primaryMuscle;
    return {
      id: exercise.id,
      name: exercise.name,
      description: `A three-position visual demonstration for ${exercise.name.toLowerCase()}.`,
      category: readable(exercise.exerciseType),
      difficulty: "visual guide",
      equipment: normalizedTaxonomy(exercise.equipment),
      bodyPart: reference
        ? normalizedTaxonomy(reference.bodyPart)
        : bodyPartForMuscle(exercise.primaryMuscle),
      primaryMuscles: [primaryMuscle],
      secondaryMuscles: [...new Set([
        ...exercise.secondaryMuscles,
        ...(reference?.secondaryMuscles ?? []),
      ])],
      instructions: reference?.instructions ?? [],
      tips: [],
      frames: exercise.frames,
      animation: exercise.animation,
    };
  })
  .sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "base" }));

const output = {
  schemaVersion: 1,
  generatedFrom: {
    referenceCommit: referenceData.source.commit,
    workoutGuideCommit: workoutGuideData.source.commit,
  },
  source: workoutGuideData.source,
  exercises,
};

await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);
console.log(`Wrote ${exercises.length} visual exercise demos to ${outputPath}`);
