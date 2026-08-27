"use client";

import Image from "next/image";
import { useDeferredValue, useMemo, useState } from "react";
import referenceLibraryData from "../../backend/src/data/exercises.json";
import repdbLibraryData from "@/data/repdb-exercises.json";
import styles from "./ExerciseLibrary.module.css";

type ExerciseImage = { main?: string; start?: string; peak?: string };
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
  source: "combined" | "reference" | "repdb";
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

type RepdbExercise = Omit<Exercise, "source">;

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

const repdbExercises = repdbLibraryData.exercises as RepdbExercise[];
const repdbByName = new Map(
  repdbExercises.map((exercise) => [normalizedName(exercise.name), exercise]),
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
      images: illustrated?.images ?? {},
      source: illustrated ? "combined" : "reference",
    };
  });

const exercises = [
  ...referenceExercises,
  ...repdbExercises
    .filter((exercise) => !seenNames.has(normalizedName(exercise.name)))
    .map((exercise): Exercise => ({
      ...exercise,
      equipment: normalizedTaxonomy(exercise.equipment),
      bodyPart: normalizedTaxonomy(exercise.bodyPart),
      source: "repdb",
    })),
].sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "base" }));

const illustratedCount = exercises.filter((exercise) => Object.keys(exercise.images).length > 0).length;

function ExerciseImages({ exercise }: { exercise: Exercise }) {
  if (!Object.keys(exercise.images).length) {
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
      && (!illustratedOnly || Object.keys(exercise.images).length > 0);
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
            Every movement from ForgeFit&apos;s 1,324-record reference library, expanded
            with RepDB exercises and licensed illustrations in one searchable catalogue.
          </span>
        </div>
        <dl>
          <div><dt>Unique exercises</dt><dd>{exercises.length.toLocaleString()}</dd></div>
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
                  {Object.keys(exercise.images).length > 0 && <span>illustrated</span>}
                </div>
                <h2>{exercise.name}</h2>
                <p>{exercise.description}</p>
                <small>
                  <b>Primary:</b> {exercise.primaryMuscles.map(readable).join(", ")}
                </small>
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
        The catalogue combines the MIT-licensed Exercises Dataset with illustrations and
        exercise data by <a href="https://repdb.co" target="_blank" rel="noreferrer">RepDB</a>.
        RepDB free-tier assets are used in-app with attribution.
      </footer>
    </section>
  );
}
