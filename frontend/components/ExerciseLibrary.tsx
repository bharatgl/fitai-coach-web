"use client";

import Image from "next/image";
import { useDeferredValue, useMemo, useState } from "react";
import libraryData from "@/data/repdb-exercises.json";
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
};

const exercises = libraryData.exercises as Exercise[];
const pageSize = 24;

function readable(value: string) {
  return value.replaceAll("_", " ");
}

function ExerciseImages({ exercise }: { exercise: Exercise }) {
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
      && (equipment === "all" || exercise.equipment === equipment);
  }), [bodyPart, deferredQuery, equipment]);
  const visible = matches.slice(0, visibleCount);

  function resetResults() {
    setVisibleCount(pageSize);
  }

  return (
    <section className={`${styles.library} ${embedded ? styles.embedded : ""}`} aria-labelledby="exercise-library-title">
      <header className={styles.intro}>
        <div>
          <p>Illustrated movement reference</p>
          <h1 id="exercise-library-title">Find your next <em>exercise.</em></h1>
          <span>
            250 illustrated movements for setup and form reference. The wider ForgeFit
            metadata library contains 1,324 movements.
          </span>
        </div>
        <dl>
          <div><dt>Illustrated</dt><dd>250</dd></div>
          <div><dt>Reference library</dt><dd>1,324</dd></div>
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
        Illustrations and exercise data by <a href="https://repdb.co" target="_blank" rel="noreferrer">RepDB</a>.
        Free-tier assets are used in-app with attribution.
      </footer>
    </section>
  );
}
