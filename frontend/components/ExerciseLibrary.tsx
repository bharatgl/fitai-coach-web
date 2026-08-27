"use client";

import Image from "next/image";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import referenceLibraryData from "../../backend/src/data/exercises.json";
import repdbLibraryData from "@/data/repdb-exercises.json";
import workoutGuideLibraryData from "@/data/workout-guide-exercises.json";
import styles from "./ExerciseLibrary.module.css";

type ExerciseImage = { main?: string; start?: string; peak?: string; frames?: string[]; animation?: string };
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
  animation: string;
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
      images: demonstrated
        ? { frames: demonstrated.frames, animation: demonstrated.animation }
        : illustrated?.images ?? {},
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
        images: demonstrated
          ? { frames: demonstrated.frames, animation: demonstrated.animation }
          : exercise.images,
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
      images: { frames: exercise.frames, animation: exercise.animation },
    })),
].sort((left, right) => left.name.localeCompare(right.name, "en", { sensitivity: "base" }));

const demoExercises = exercises.filter((exercise) => exercise.images.frames);
type LibraryMode = "demos" | "directory";

function ExercisePreview({ exercise, active }: { exercise: Exercise; active: boolean }) {
  const previewSource = active
    ? exercise.images.animation ?? exercise.images.frames?.[0] ?? ""
    : exercise.images.frames?.[0] ?? exercise.images.animation ?? "";
  return (
    <div className={styles.preview} aria-label={`${exercise.name} movement preview`}>
      <Image
        key={previewSource}
        src={previewSource}
        alt=""
        width={512}
        height={512}
        sizes="(max-width: 42rem) 90vw, (max-width: 70rem) 44vw, 22vw"
        unoptimized
      />
      <span className={`${styles.previewBadge} ${active ? styles.previewPlaying : ""}`}>
        {active ? "Playing" : "Hover to play"}
      </span>
    </div>
  );
}

function ExerciseCard({ exercise, onSelect }: { exercise: Exercise; onSelect: () => void }) {
  const [previewing, setPreviewing] = useState(false);
  return (
    <button
      className={styles.card}
      type="button"
      aria-haspopup="dialog"
      onBlur={() => setPreviewing(false)}
      onClick={onSelect}
      onFocus={() => setPreviewing(true)}
      onPointerEnter={() => setPreviewing(true)}
      onPointerLeave={() => setPreviewing(false)}
    >
      <ExercisePreview exercise={exercise} active={previewing} />
      <div className={styles.cardBody}>
        <div className={styles.cardHeading}>
          <h2>{exercise.name}</h2>
          <span aria-hidden="true">↗</span>
        </div>
        <p>{readable(exercise.primaryMuscles[0] ?? exercise.bodyPart)} · {readable(exercise.equipment)}</p>
      </div>
    </button>
  );
}

function ExercisePositions({ exercise }: { exercise: Exercise }) {
  const frames = exercise.images.frames ?? [];
  return (
    <div className={styles.positionStrip} aria-label={`${exercise.name} three-position demonstration`}>
      {frames.map((path, index) => (
        <figure key={path}>
          <Image
            src={path}
            alt={`${exercise.name} — ${["setup", "movement", "finish"][index]} position`}
            width={512}
            height={512}
            sizes="(max-width: 42rem) 30vw, 15rem"
            unoptimized
          />
          <figcaption>{["Setup", "Move", "Finish"][index]}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export function ExerciseLibrary({ embedded = false }: { embedded?: boolean }) {
  const [mode, setMode] = useState<LibraryMode>("demos");
  const [query, setQuery] = useState("");
  const [bodyPart, setBodyPart] = useState("all");
  const [equipment, setEquipment] = useState("all");
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const [selectedExercise, setSelectedExercise] = useState<Exercise | null>(null);
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());
  const activeExercises = mode === "demos" ? demoExercises : exercises;
  const bodyParts = useMemo(
    () => [...new Set(activeExercises.map((exercise) => exercise.bodyPart))].sort(),
    [activeExercises],
  );
  const equipmentOptions = useMemo(
    () => [...new Set(activeExercises.map((exercise) => exercise.equipment))].sort(),
    [activeExercises],
  );
  const matches = useMemo(() => activeExercises.filter((exercise) => {
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
  }), [activeExercises, bodyPart, deferredQuery, equipment]);
  const visible = matches.slice(0, visibleCount);

  useEffect(() => {
    if (!selectedExercise) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedExercise(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedExercise]);

  function resetResults() {
    setVisibleCount(pageSize);
  }

  function selectMode(nextMode: LibraryMode) {
    setMode(nextMode);
    setQuery("");
    setBodyPart("all");
    setEquipment("all");
    setSelectedExercise(null);
    resetResults();
  }

  return (
    <section className={`${styles.library} ${embedded ? styles.embedded : ""}`} aria-labelledby="exercise-library-title">
      {embedded ? (
        <header className={styles.compactIntro}>
          <div>
            <p>Movement library</p>
            <h1 id="exercise-library-title">Exercise demos</h1>
          </div>
          <span>{demoExercises.length} visual guides · {exercises.length.toLocaleString()} directory movements</span>
        </header>
      ) : (
        <header className={styles.intro}>
          <div>
            <p>Movement library</p>
            <h1 id="exercise-library-title">See it. Learn it. <em>Train it.</em></h1>
            <span>Clear movement previews first. Detailed setup and the complete exercise directory are one click away.</span>
          </div>
        </header>
      )}

      <div className={styles.toolbar}>
        <nav className={styles.viewTabs} aria-label="Exercise library views">
          <button type="button" aria-pressed={mode === "demos"} onClick={() => selectMode("demos")}>
            Demos <span>{demoExercises.length}</span>
          </button>
          <button type="button" aria-pressed={mode === "directory"} onClick={() => selectMode("directory")}>
            Directory <span>{exercises.length.toLocaleString()}</span>
          </button>
        </nav>

        <form className={styles.filters} role="search" onSubmit={(event) => event.preventDefault()}>
          <label className={styles.search}>
            <span>Search exercises</span>
            <input
              type="search"
              value={query}
              placeholder={mode === "demos" ? "Search demos…" : "Search directory…"}
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
      </div>

      <div className={styles.resultsLine} aria-live="polite">
        <strong>{matches.length} {mode === "demos" ? "visual demos" : "directory exercises"}</strong>
      </div>

      {visible.length ? (
        mode === "demos" ? (
          <div className={styles.grid}>
            {visible.map((exercise) => (
              <ExerciseCard exercise={exercise} key={exercise.id} onSelect={() => setSelectedExercise(exercise)} />
            ))}
          </div>
        ) : (
          <div className={styles.directory}>
            {visible.map((exercise) => (
              <article className={styles.directoryRow} key={exercise.id}>
                <div className={styles.directoryHeading}>
                  <div>
                    <div className={styles.tags}>
                      <span>{readable(exercise.bodyPart)}</span>
                      <span>{readable(exercise.equipment)}</span>
                    </div>
                    <h2>{exercise.name}</h2>
                  </div>
                  <small><b>Primary:</b> {exercise.primaryMuscles.map(readable).join(", ")}</small>
                </div>
                <p>{exercise.description}</p>
                {exercise.instructions.length > 0 && (
                  <details>
                    <summary>Read instructions <span>+</span></summary>
                    <ol>{exercise.instructions.map((step) => <li key={step}>{step}</li>)}</ol>
                  </details>
                )}
              </article>
            ))}
          </div>
        )
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

      {selectedExercise && (
        <div className={styles.modalBackdrop} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedExercise(null);
        }}>
          <section className={styles.exerciseModal} role="dialog" aria-modal="true" aria-labelledby="exercise-detail-title">
            <button className={styles.modalClose} type="button" onClick={() => setSelectedExercise(null)} aria-label="Close exercise details">×</button>
            <header className={styles.modalHeader}>
              <p>{readable(selectedExercise.bodyPart)} · {readable(selectedExercise.equipment)}</p>
              <h2 id="exercise-detail-title">{selectedExercise.name}</h2>
              <span>Primary: {selectedExercise.primaryMuscles.map(readable).join(", ")}</span>
            </header>
            <ExercisePositions exercise={selectedExercise} />
            <div className={styles.modalBody}>
              {selectedExercise.instructions.length > 0 ? (
                <>
                  <h3>How to perform it</h3>
                  <ol>{selectedExercise.instructions.map((step) => <li key={step}>{step}</li>)}</ol>
                  {selectedExercise.tips.length > 0 && (
                    <div className={styles.tips}>
                      <strong>Form cues</strong>
                      <ul>{selectedExercise.tips.map((tip) => <li key={tip}>{tip}</li>)}</ul>
                    </div>
                  )}
                </>
              ) : (
                <p>This is a visual movement reference. Ask your coach to personalize setup, range of motion, and loading for your experience and equipment.</p>
              )}
            </div>
          </section>
        </div>
      )}

      <footer className={styles.credit}>
        The catalogue combines the MIT-licensed Exercises Dataset, illustrations and exercise data
        by <a href="https://repdb.co" target="_blank" rel="noreferrer">RepDB</a>, and
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a> demonstrations
        from <a href="https://bryllim.github.io/workout-guide/" target="_blank" rel="noreferrer">Workout Guide</a>
        by Bryl Lim, derived in part from Everkinetic. Source artwork is unmodified; GIF previews only sequence the supplied frames.
      </footer>
    </section>
  );
}
