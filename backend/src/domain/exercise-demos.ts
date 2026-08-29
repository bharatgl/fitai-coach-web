import type {
  ExerciseDemo,
  ExerciseDemoResponse,
  ExerciseDemoSource,
} from "@fitai/contracts";
import demoData from "../data/exercise-demos.json" with { type: "json" };

type DemoData = {
  schemaVersion: number;
  source: ExerciseDemoSource;
  exercises: ExerciseDemo[];
};

type SearchExerciseDemosInput = {
  query?: string;
  bodyPart?: string;
  equipment?: string;
  offset?: number;
  limit?: number;
};

const data = demoData as DemoData;

export const exerciseDemos = data.exercises;
export const exerciseDemoSource = data.source;

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

function configuredAssetUrl(path: string) {
  const baseUrl = process.env.EXERCISE_ASSET_BASE_URL?.replace(/\/$/, "");
  return baseUrl ? `${baseUrl}${path}` : path;
}

const searchableDemos = exerciseDemos.map((exercise) => ({
  exercise,
  searchText: normalize([
    exercise.name,
    exercise.description,
    exercise.category,
    exercise.bodyPart,
    exercise.equipment,
    ...exercise.primaryMuscles,
    ...exercise.secondaryMuscles,
  ].join(" ")),
}));

const filters = {
  bodyParts: [...new Set(exerciseDemos.map(({ bodyPart }) => bodyPart))].sort(),
  equipment: [...new Set(exerciseDemos.map(({ equipment }) => equipment))].sort(),
};

export function searchExerciseDemos(
  input: SearchExerciseDemosInput = {},
): ExerciseDemoResponse {
  const query = normalize(input.query ?? "");
  const bodyPart = normalize(input.bodyPart ?? "");
  const equipment = normalize(input.equipment ?? "");
  const offset = input.offset ?? 0;
  const limit = input.limit ?? 24;
  const matches = searchableDemos.filter(({ exercise, searchText }) =>
    (!query || searchText.includes(query)) &&
    (!bodyPart || normalize(exercise.bodyPart) === bodyPart) &&
    (!equipment || normalize(exercise.equipment) === equipment),
  );

  return {
    items: matches.slice(offset, offset + limit).map(({ exercise }) => ({
      ...exercise,
      frames: exercise.frames.map(configuredAssetUrl),
      animation: configuredAssetUrl(exercise.animation),
    })),
    total: matches.length,
    offset,
    limit,
    filters,
    source: exerciseDemoSource,
  };
}
