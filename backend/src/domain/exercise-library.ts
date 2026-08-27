import type {
  ExerciseLibraryItem,
  ExerciseLibraryResponse,
  ExerciseLibrarySource,
} from "@fitai/contracts";
import libraryData from "../data/exercises.json" with { type: "json" };

type LibraryData = {
  schemaVersion: number;
  source: ExerciseLibrarySource;
  exercises: ExerciseLibraryItem[];
};

type SearchExerciseLibraryInput = {
  query?: string;
  bodyPart?: string;
  equipment?: string;
  target?: string;
  offset?: number;
  limit?: number;
};

const data = libraryData as LibraryData;

export const exerciseLibrary = data.exercises;
export const exerciseLibrarySource = data.source;

function normalize(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}

const searchableExercises = exerciseLibrary.map((exercise) => ({
  exercise,
  searchText: normalize([
    exercise.name,
    exercise.bodyPart,
    exercise.equipment,
    exercise.target,
    exercise.muscleGroup,
    ...exercise.secondaryMuscles,
  ].join(" ")),
}));

const filters = {
  bodyParts: [...new Set(exerciseLibrary.map(({ bodyPart }) => bodyPart))].sort(),
  equipment: [...new Set(exerciseLibrary.map((exercise) => exercise.equipment))].sort(),
  targets: [...new Set(exerciseLibrary.map(({ target }) => target))].sort(),
};

export function findExerciseLibraryItem(id: string) {
  return exerciseLibrary.find((exercise) => exercise.id === id) ?? null;
}

export function searchExerciseLibrary(
  input: SearchExerciseLibraryInput = {},
): ExerciseLibraryResponse {
  const query = normalize(input.query ?? "");
  const bodyPart = normalize(input.bodyPart ?? "");
  const equipment = normalize(input.equipment ?? "");
  const target = normalize(input.target ?? "");
  const offset = input.offset ?? 0;
  const limit = input.limit ?? 24;

  const matches = searchableExercises.filter(({ exercise, searchText }) =>
    (!query || searchText.includes(query)) &&
    (!bodyPart || normalize(exercise.bodyPart) === bodyPart) &&
    (!equipment || normalize(exercise.equipment) === equipment) &&
    (!target || normalize(exercise.target) === target),
  );

  return {
    items: matches.slice(offset, offset + limit).map(({ exercise }) => exercise),
    total: matches.length,
    offset,
    limit,
    filters,
    source: exerciseLibrarySource,
  };
}
