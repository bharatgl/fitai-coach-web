"use client";

/* The source media is already SVG, GIF, or WebP and is served directly by GCS/CDN. */
/* eslint-disable @next/next/no-img-element */
import type { ExerciseDemo, ExerciseDemoResponse } from "@fitai/contracts";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useDeferredValue, useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";
import styles from "./ExerciseLibrary.module.css";

const pageSize = 24;

function readable(value: string) {
  return value.replaceAll("_", " ");
}

function ExercisePreview({ exercise, active }: { exercise: ExerciseDemo; active: boolean }) {
  const previewSource = active
    ? exercise.animation || exercise.frames[0]
    : exercise.frames[0] || exercise.animation;
  return (
    <div className={styles.preview} aria-label={`${exercise.name} movement preview`}>
      <img
        key={previewSource}
        src={previewSource}
        alt=""
        width={512}
        height={512}
        loading="lazy"
        decoding="async"
        fetchPriority="low"
      />
      <span className={`${styles.previewBadge} ${active ? styles.previewPlaying : ""}`}>
        {active ? "Playing" : "Hover to play"}
      </span>
    </div>
  );
}

function ExerciseCard({ exercise, onSelect }: { exercise: ExerciseDemo; onSelect: () => void }) {
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

function ExercisePositions({ exercise }: { exercise: ExerciseDemo }) {
  const frames = exercise.frames;
  return (
    <div className={styles.positionStrip} aria-label={`${exercise.name} three-position demonstration`}>
      {frames.map((path, index) => (
        <figure key={path}>
          <img
            src={path}
            alt={`${exercise.name} — ${["setup", "movement", "finish"][index]} position`}
            width={512}
            height={512}
            loading="lazy"
            decoding="async"
          />
          <figcaption>{["Setup", "Move", "Finish"][index]}</figcaption>
        </figure>
      ))}
    </div>
  );
}

export function ExerciseLibrary({ embedded = false }: { embedded?: boolean }) {
  const [query, setQuery] = useState("");
  const [bodyPart, setBodyPart] = useState("all");
  const [equipment, setEquipment] = useState("all");
  const [selectedExercise, setSelectedExercise] = useState<ExerciseDemo | null>(null);
  const deferredQuery = useDeferredValue(query.trim());
  const demosQuery = useInfiniteQuery({
    queryKey: ["exercise-demos", deferredQuery, bodyPart, equipment],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => {
      const search = new URLSearchParams({
        offset: String(pageParam),
        limit: String(pageSize),
      });
      if (deferredQuery) search.set("query", deferredQuery);
      if (bodyPart !== "all") search.set("bodyPart", bodyPart);
      if (equipment !== "all") search.set("equipment", equipment);
      return apiRequest<ExerciseDemoResponse>(`/v1/exercise-demos?${search}`, { signal });
    },
    getNextPageParam: (lastPage) => {
      const nextOffset = lastPage.offset + lastPage.items.length;
      return nextOffset < lastPage.total ? nextOffset : undefined;
    },
    gcTime: 24 * 60 * 60 * 1_000,
    staleTime: 24 * 60 * 60 * 1_000,
  });
  const firstPage = demosQuery.data?.pages[0];
  const visible = demosQuery.data?.pages.flatMap((page) => page.items) ?? [];
  const total = firstPage?.total ?? 0;
  const bodyParts = firstPage?.filters.bodyParts ?? [];
  const equipmentOptions = firstPage?.filters.equipment ?? [];

  useEffect(() => {
    if (!selectedExercise) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setSelectedExercise(null);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [selectedExercise]);

  return (
    <section className={`${styles.library} ${embedded ? styles.embedded : ""}`} aria-labelledby="exercise-library-title">
      {embedded ? (
        <header className={styles.compactIntro}>
          <div>
            <p>Movement library</p>
            <h1 id="exercise-library-title">Exercise demos</h1>
          </div>
          <span>{total || 302} animated movement guides</span>
        </header>
      ) : (
        <header className={styles.intro}>
          <div>
            <p>Movement library</p>
            <h1 id="exercise-library-title">See it. Learn it. <em>Train it.</em></h1>
            <span>Hover to preview each movement, then open any exercise for setup positions and practical form guidance.</span>
          </div>
        </header>
      )}

      <div className={styles.toolbar}>
        <form className={styles.filters} role="search" onSubmit={(event) => event.preventDefault()}>
          <label className={styles.search}>
            <span>Search exercises</span>
            <input
              type="search"
              value={query}
              placeholder="Search movement demos…"
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label>
            <span>Body part</span>
            <select value={bodyPart} onChange={(event) => setBodyPart(event.target.value)}>
              <option value="all">All body parts</option>
              {bodyParts.map((value) => <option value={value} key={value}>{readable(value)}</option>)}
            </select>
          </label>
          <label>
            <span>Equipment</span>
            <select value={equipment} onChange={(event) => setEquipment(event.target.value)}>
              <option value="all">All equipment</option>
              {equipmentOptions.map((value) => <option value={value} key={value}>{readable(value)}</option>)}
            </select>
          </label>
        </form>
      </div>

      <div className={styles.resultsLine} aria-live="polite">
        <strong>{demosQuery.isPending ? "Loading visual demos…" : `${total} visual demos`}</strong>
      </div>

      {demosQuery.isError && !firstPage ? (
        <div className={styles.empty}>
          <h2>The movement library could not connect.</h2>
          <button type="button" onClick={() => void demosQuery.refetch()}>Try again</button>
        </div>
      ) : visible.length ? (
        <div className={styles.grid}>
          {visible.map((exercise) => (
            <ExerciseCard exercise={exercise} key={exercise.id} onSelect={() => setSelectedExercise(exercise)} />
          ))}
        </div>
      ) : !demosQuery.isPending ? (
        <div className={styles.empty}>
          <h2>No exercises match those filters.</h2>
          <button type="button" onClick={() => { setQuery(""); setBodyPart("all"); setEquipment("all"); }}>
            Clear filters
          </button>
        </div>
      ) : null}

      {demosQuery.hasNextPage && (
        <button
          className={styles.loadMore}
          type="button"
          disabled={demosQuery.isFetchingNextPage}
          onClick={() => void demosQuery.fetchNextPage()}
        >
          {demosQuery.isFetchingNextPage ? "Loading more…" : "Show more exercises"}
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
        The catalogue combines the MIT-licensed Exercises Dataset with{" "}
        <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noreferrer">CC BY-SA 4.0</a> demonstrations
        from <a href="https://bryllim.github.io/workout-guide/" target="_blank" rel="noreferrer">Workout Guide</a>
        by Bryl Lim, derived in part from Everkinetic. Source artwork is unmodified; GIF previews only sequence the supplied frames.
      </footer>
    </section>
  );
}
