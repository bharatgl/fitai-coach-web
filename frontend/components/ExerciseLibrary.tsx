"use client";

import Image from "next/image";
import { useDeferredValue, useMemo, useState } from "react";
import referenceLibraryData from "../../backend/src/data/exercises.json";
import repdbLibraryData from "@/data/repdb-exercises.json";
import workoutGuideLibraryData from "@/data/workout-guide-exercises.json";
import styles from "./ExerciseLibrary.module.css";

type ExerciseImage = { main?: string; start?: string; peak?: string; frames?: string[] };
type Exercise = {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  equipment: string;
  bodyPart: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  goals: string[];
  instructions: string[];
  tips: string[];
  images: ExerciseImage;
};

type ReferenceExercise = {
  id: string;
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  muscleGroup: string;
  secondaryMuscles: string[];
  instructions: string[];
};

type RepdbExercise = Exercise;
type WorkoutGuideExercise = {
  id: string;
  name: string;
  exerciseType: string;
  equipment: string;
  primaryMuscle: string;
  secondaryMuscles: string[];
  frames: string[];
};

const pageSize = 24;

function readable(value: string) {
  return value.replaceAll("_", " ");
}

function normalizedName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function normalizedTaxonomy(value: string) {
  const normalized = readable(value).trim().toLowerCase();
  return normalized === "bodyweight" ? "body weight" : normalized;
}

function bodyPartForMuscle(value: string) {
  const muscle = value.toLowerCase();
  if (["chest"].includes(muscle)) return "chest";
  if (["shoulders", "rear delts"].includes(muscle)) return "shoulders";
  if (["biceps", "triceps"].includes(muscle)) return "upper arms";
  if (["forearms"].includes(muscle)) return "lower arms";
  if (["calves"].includes(muscle)) return "lower legs";
  if (["core"].includes(muscle)) return "waist";
  if (["back", "lats", "lower back", "upper back", "posterior chain"].includes(muscle)) return "back";
  if (["quads", "hamstrings", "glutes", "adductors", "legs", "hips"].includes(muscle)) return "upper legs";
  return "full body";
}

function hasVisuals(exercise: Exercise) {
  return Object.keys(exercise.images).length > 0;
}

const repdbExercises = repdbLibraryData.exercises as RepdbExercise[];
const repdbByName = new Map(
  repdbExercises.map((exercise) => [normalizedName(exercise.name), exercise]),
);
const workoutGuideExercises = workoutGuideLibraryData.exercises as WorkoutGuideExercise[];
const workoutGuideByName = new Map(
  workoutGuideExercises.map((exercise) => [normalizedName(exercise.name), exercise]),
);
const seenNames = new Set<string>();

const referenceExercises = (referenceLibraryData.exercises as ReferenceExercise[])
  .filter((exercise) => {
    const name = normalizedName(exercise.name);
    if (seenNames.has(name)) return false;
    seenNames.add(name);
    return true;
  })
  .map((exercise): Exercise => {
    const illustrated = repdbByName.get(normalizedName(exercise.name));
    const demonstrated = workoutGuideByName.get(normalizedName(exercise.name));
    return {
      id: exercise.id,
      name: exercise.name,
      description: illustrated?.description
        ?? `A ${normalizedTaxonomy(exercise.equipment)} movement targeting the ${readable(exercise.target)}.`,
      category: illustrated?.category ?? "strength",
      difficulty: illustrated?.difficulty ?? "reference",
      equipment: normalizedTaxonomy(exercise.equipment),
      bodyPart: normalizedTaxonomy(exercise.bodyPart),
      primaryMuscles: illustrated?.primaryMuscles ?? [exercise.target],
      secondaryMuscles: [...new Set([
        ...exercise.secondaryMuscles,
        ...(illustrated?.secondaryMuscles ?? []),
      ])],
      goals: illustrated?.goals ?? [],
      instructions: illustrated?.instructions ?? exercise.instructions,
      tips: illustrated?.tips ?? [],
      images: demonstrated ? { frames: demonstrated.frames } : illustrated?.images ?? {},
    };
  });

const baseExercises = [
  ...referenceExercises,
  ...repdbExercises
    .filter((exercise) => !seenNames.has(normalizedName(exercise.name)))
    .map((exercise): Exercise => {
      const demonstrated = workoutGuideByName.get(normalizedName(exercise.name));
      return {
        ...exercise,
        equipment: normalizedTaxonomy(exercise.equipment),
        bodyPart: normalizedTaxonomy(exercise.bodyPart),
        images: demonstrated ? { frames: demonstrated.frames } : exercise.images,
      };
    }),
];
const baseNames = new Set(baseExercises.map((exercise) => normalizedName(exercise.name)));
const exercises = [
  ...baseExercises,
  ...workoutGuideExercises
    .filter((exercise) => !baseNames.has(normalizedName(exercise.name)))
    .map((exercise): Exercise => ({
      id: exercise.id,
      name: exercise.name,
      description: `A three-position visual demonstration for ${exercise.name.toLowerCase()}.`,
      category: readable(exercise.exerciseType),
      difficulty: "visual guide",
      equipment: normalizedTaxonomy(exercise.equipment),
      bodyPart: bodyPartForMuscle(exercise.primaryMuscle),
      primaryMuscles: [exercise.primaryMuscle],
      secondaryMuscles: exercise.secondaryMuscles,
      goals: [],
      instructions: [],
      tips: [],
      images: { frames: exercise.frames },
    })),
].sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "base" }));

const illustratedCount = exercises.filter(hasVisuals).length;
const demoCount = exercises.filter((exercise) => exercise.images.frames).length;

function ExerciseImages({ exercise }: { exercise: Exercise }) {
  if (exercise.images.frames) {
    return (
      <div className={`${styles.images} ${styles.demoFrames}`} aria-label={`${exercise.name} three-position demonstration`}>
        {exercise.images.frames.map((path, index) => (
          <figure key={path}>
            <Image
              src={path}
              alt={`${exercise.name} — position ${index + 1} of 3`}
              width={512}
              height={512}
              sizes="(max-width: 42rem) 30vw, (max-width: 70rem) 15vw, 9rem"
              unoptimized
            />
            <figcaption>{["Setup", "Move", "Finish"][index]}</figcaption>
          </figure>
        ))}
      </div>
    );
  }

  if (!hasVisuals(exercise)) {
    return (
      <div className={styles.textGuide} aria-label={`${exercise.name} text instruction guide`}>
        <span>{exercise.name.slice(0, 1)}</span>
        <div>
          <strong>{readable(exercise.primaryMuscles[0] ?? exercise.bodyPart)}</strong>
          <small>Step-by-step text guide</small>
        </div>
      </div>
    );
  }

  const poses: Array<[string, string | undefined]> = exercise.images.main
    ? [["Exercise", exercise.images.main]]
    : [["Start", exercise.images.start], ["Finish", exercise.images.peak]];

  return (
    <div className={styles.images}>
      {poses.map(([label, path]) => path && (
        <figure key={label}>
          <Image
            src={path}
            alt={`${exercise.name} — ${label.toLowerCase()} position`}
            width={512}
            height={512}
            sizes="(max-width: 42rem) 44vw, (max-width: 70rem) 22vw, 13rem"
          />
          <figcaption>{label}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export function ExerciseLibrary({ embedded = false }: { embedded?: boolean }) {
  const [query, setQuery] = useState("");
  const [bodyPart, setBodyPart] = useState("all");
  const [equipment, setEquipment] = useState("all");
  const [illustratedOnly, setIllustratedOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const bodyParts = useMemo(
    () => [...new Set(exercises.map((exercise) => exercise.bodyPart))].sort(),
    [],
  );
  const equipmentOptions = useMemo(
    () => [...new Set(exercises.map((exercise) => exercise.equipment))].sort(),
    [],
  );
  const matches = useMemo(() => exercises.filter((exercise) => {
    const searchable = [
      exercise.name,
      exercise.description,
      exercise.bodyPart,
      exercise.equipment,
      ...exercise.primaryMuscles,
      ...exercise.secondaryMuscles,
    ].join(" ").toLowerCase();
    return (!deferredQuery || searchable.includes(deferredQuery))
      && (bodyPart === "all" || exercise.bodyPart === bodyPart)
      && (equipment === "all" || exercise.equipment === equipment)
      && (!illustratedOnly || hasVisuals(exercise));
  }), [bodyPart, deferredQuery, equipment, illustratedOnly]);
  const visible = matches.slice(0, visibleCount);

  function resetResults() {
    setVisibleCount(pageSize);
  }

  return (
    <section className={`${styles.library} ${embedded ? styles.embedded : ""}`} aria-labelledby="exercise-library-title">
      <header className={styles.intro}>
        <div>
          <p>Complete bodybuilding movement reference</p>
          <h1 id="exercise-library-title">Find your next <em>exercise.</em></h1>
          <span>
            The complete ForgeFit reference library, expanded with licensed RepDB
            illustrations and open three-position Workout Guide demonstrations.
          </span>
        </div>
        <dl>
          <div><dt>Unique exercises</dt><dd>{exercises.length.toLocaleString()}</dd></div>
          <div><dt>3-step demos</dt><dd>{demoCount}</dd></div>
          <div><dt>Illustrated</dt><dd>{illustratedCount}</dd></div>
        </dl>
      </header>

      <form className={styles.filters} role="search" onSubmit={(event) => event.preventDefault()}>
        <label className={styles.search}>
          <span>Search exercises</span>
          <input
            type="search"
            value={query}
            placeholder="Try lateral raise, chest, cable…"
            onChange={(event) => { setQuery(event.target.value); resetResults(); }}
          />
        </label>
        <label>
          <span>Body part</span>
          <select value={bodyPart} onChange={(event) => { setBodyPart(event.target.value); resetResults(); }}>
            <option value="all">All body parts</option>
            {bodyParts.map((value) => <option value={value} key={value}>{readable(value)}</option>)}
          </select>
        </label>
        <label>
          <span>Equipment</span>
          <select value={equipment} onChange={(event) => { setEquipment(event.target.value); resetResults(); }}>
            <option value="all">All equipment</option>
            {equipmentOptions.map((value) => <option value={value} key={value}>{readable(value)}</option>)}
          </select>
        </label>
        <label className={styles.checkFilter}>
          <input
            type="checkbox"
            checked={illustratedOnly}
            onChange={(event) => { setIllustratedOnly(event.target.checked); resetResults(); }}
          />
          <span>Illustrated only</span>
        </label>
      </form>

      <div className={styles.resultsLine} aria-live="polite">
        <strong>{matches.length} exercises</strong>
        <span>Informational reference—not individualized medical or injury advice.</span>
      </div>

      {visible.length ? (
        <div className={styles.grid}>
          {visible.map((exercise) => (
            <article className={styles.card} key={exercise.id}>
              <ExerciseImages exercise={exercise} />
              <div className={styles.cardBody}>
                <div className={styles.tags}>
                  <span>{readable(exercise.bodyPart)}</span>
                  <span>{readable(exercise.equipment)}</span>
                  <span>{exercise.difficulty}</span>
                  {exercise.images.frames ? <span>3-step demo</span> : hasVisuals(exercise) && <span>illustrated</span>}
                </div>
                <h2>{exercise.name}</h2>
                <p>{exercise.description}</p>
                <small>
                  <b>Primary:</b> {exercise.primaryMuscles.map(readable).join(", ")}
                </small>
                {exercise.instructions.length > 0 ? (
                  <details>
                    <summary>Setup and instructions <span>+</span></summary>
                    <ol>{exercise.instructions.map((step) => <li key={step}>{step}</li>)}</ol>
                    {exercise.tips.length > 0 && (
                      <div className={styles.tips}>
                        <strong>Form cues</strong>
                        <ul>{exercise.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
                      </div>
                    )}
                  </details>
                ) : (
                  <p className={styles.visualNote}>Use the three positions as a movement reference. Ask your coach for individualized setup and loading.</p>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <h2>No exercises match those filters.</h2>
          <button type="button" onClick={() => { setQuery(""); setBodyPart("all"); setEquipment("all"); resetResults(); }}>
            Clear filters
          </button>
        </div>
      )}

      {visible.length < matches.length && (
        <button className={styles.loadMore} type="button" onClick={() => setVisibleCount((count) => count + pageSize)}>
          Show more exercises
        </button>
      )}

      <footer className={styles.credit}>
        The catalogue combines the MIT-licensed Exercises Dataset, illustrations and exercise data
        by <a href="https://repdb.co" target="_blank" rel="noreferrer">RepDB</a>, and
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a> demonstrations
        from <a href="https://bryllim.github.io/workout-guide/" target="_blank" rel="noreferrer">Workout Guide</a>
        by Bryl Lim, derived in part from Everkinetic. Imported artwork is unmodified.
      </footer>
    </section>
  );
}
