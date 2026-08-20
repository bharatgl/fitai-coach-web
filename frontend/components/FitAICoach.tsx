"use client";

import type {
  CoachMessage,
  CoachResponse,
  DashboardResponse,
  GeneratePlanResponse,
  StartWorkoutResponse,
  UserProfile,
  WorkoutSession,
  WorkoutSessionResponse,
} from "@fitai/contracts";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";

type View = "today" | "coach" | "plan" | "history" | "workout";
type CurrentUser = { id: string; name: string; email: string };

export default function FitAICoach({ user }: { user: CurrentUser }) {
  const [view, setView] = useState<View>("today");
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [activeSession, setActiveSession] = useState<WorkoutSession | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadDashboard() {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest<DashboardResponse>("/v1/dashboard");
      setDashboard(data);
      setActiveSession(data.activeSession);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load FitAI");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    apiRequest<DashboardResponse>("/v1/dashboard")
      .then((data) => {
        if (active) {
          setDashboard(data);
          setActiveSession(data.activeSession);
        }
      })
      .catch((cause: unknown) => {
        if (active) {
          setError(cause instanceof Error ? cause.message : "Unable to load FitAI");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <StatusScreen title="Loading your training data…" />;
  if (error)
    return <StatusScreen title="FitAI could not connect" detail={error} retry={loadDashboard} />;
  if (!dashboard?.profile)
    return <Onboarding user={user} onSaved={loadDashboard} />;

  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const nav: [View, string, string][] = [
    ["today", "⌁", "Today"],
    ["coach", "◌", "Coach"],
    ["plan", "▤", "Plan"],
    ["history", "◴", "History"],
  ];

  async function startWorkout(plannedWorkoutId: string) {
    const response = await apiRequest<StartWorkoutResponse>(
      `/v1/workouts/${plannedWorkoutId}/start`,
      { method: "POST", body: JSON.stringify({}) },
    );
    setActiveSession(response.session);
    setView("workout");
  }

  async function closeWorkout() {
    setActiveSession(null);
    await loadDashboard();
    setView("history");
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => setView("today")}>
          <span>F</span>FitAI <i>Coach</i>
        </button>
        <p className="label">YOUR WORKSPACE</p>
        <nav>
          {nav.map(([id, icon, name]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={view === id ? "active" : ""}
            >
              <span>{icon}</span>
              {name}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <p>✦ Fitness guidance, not medical care.</p>
          <div className="profile">
            <b>{initials}</b>
            <span>
              <strong>{user.name}</strong>
              <small>{dashboard.profile.experienceLevel}</small>
            </span>
          </div>
          <Link className="signout" href="/api/auth/signout">
            Sign out
          </Link>
        </div>
      </aside>
      <section className="main">
        <header className="topbar">
          <span>
            <i /> CONNECTED TO FITAI API
          </span>
          <div>{new Intl.DateTimeFormat("en", { dateStyle: "full" }).format(new Date())}</div>
        </header>
        {view === "today" && (
          <Today
            dashboard={dashboard}
            activeSession={activeSession}
            onStart={startWorkout}
            onResume={() => setView("workout")}
          />
        )}
        {view === "coach" && (
          <Coach initialMessages={dashboard.recentMessages} />
        )}
        {view === "plan" && (
          <Plan dashboard={dashboard} refresh={loadDashboard} onStart={startWorkout} />
        )}
        {view === "history" && <History dashboard={dashboard} />}
        {view === "workout" && activeSession && (
          <WorkoutRunner
            session={activeSession}
            onSession={setActiveSession}
            onClose={closeWorkout}
          />
        )}
      </section>
    </main>
  );
}

function StatusScreen({
  title,
  detail,
  retry,
}: {
  title: string;
  detail?: string;
  retry?: () => void | Promise<void>;
}) {
  return (
    <main className="auth-shell">
      <section className="auth-card">
        <span className="auth-mark">F</span>
        <h1>{title}</h1>
        {detail && <p>{detail}</p>}
        {retry && (
          <button className="primary" onClick={() => void retry()}>
            Try again
          </button>
        )}
      </section>
    </main>
  );
}

function Onboarding({ user, onSaved }: { user: CurrentUser; onSaved: () => Promise<void> }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest<{ profile: UserProfile }>("/v1/profile", {
        method: "PUT",
        body: JSON.stringify({
          experienceLevel: form.get("experienceLevel"),
          primaryGoal: form.get("primaryGoal"),
          equipment: String(form.get("equipment") ?? "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          trainingDaysPerWeek: Number(form.get("trainingDaysPerWeek")),
          preferredSessionMinutes: Number(form.get("preferredSessionMinutes")),
          movementNotes: form.get("movementNotes"),
        }),
      });
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save your profile");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="onboarding-shell">
      <form className="onboarding-card" onSubmit={submit}>
        <p className="label">WELCOME, {user.name.toUpperCase()}</p>
        <h1>Set up your real training profile.</h1>
        <p>This information is saved to your account and used by your coach.</p>
        <label>
          Experience level
          <select name="experienceLevel" defaultValue="beginner">
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </label>
        <label>
          Primary goal
          <input name="primaryGoal" required placeholder="Build strength" />
        </label>
        <label>
          Available equipment
          <input name="equipment" placeholder="Dumbbells, resistance bands" />
        </label>
        <div className="form-row">
          <label>
            Days per week
            <input name="trainingDaysPerWeek" type="number" min="1" max="7" defaultValue="3" />
          </label>
          <label>
            Minutes per session
            <input name="preferredSessionMinutes" type="number" min="10" max="180" defaultValue="35" />
          </label>
        </div>
        <label>
          Movement considerations
          <textarea name="movementNotes" rows={3} placeholder="Anything your coach should account for" />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary" disabled={saving}>
          {saving ? "Saving…" : "Save profile →"}
        </button>
      </form>
    </main>
  );
}

function Today({
  dashboard,
  activeSession,
  onStart,
  onResume,
}: {
  dashboard: DashboardResponse;
  activeSession: WorkoutSession | null;
  onStart: (workoutId: string) => Promise<void>;
  onResume: () => void;
}) {
  const nextWorkout = dashboard.upcomingWorkouts[0];
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    if (!nextWorkout) return;
    setStarting(true);
    setError("");
    try {
      await onStart(nextWorkout.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start this workout");
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="wrap">
      <section className="intro">
        <div>
          <p className="label">TODAY</p>
          <h1>
            Train with <em>real context.</em>
          </h1>
          <p>Your dashboard now reads from your authenticated FitAI account.</p>
        </div>
      </section>
      {activeSession || nextWorkout ? (
        <section className="hero">
          <div>
            <p className="label">{activeSession ? "SESSION IN PROGRESS" : "NEXT SESSION"}</p>
            <h2>{activeSession?.name ?? nextWorkout?.name}</h2>
            <p>{activeSession ? `${activeSession.totalSets} sets recorded` : nextWorkout?.focus}</p>
            <button
              className="primary"
              disabled={starting}
              onClick={activeSession ? onResume : () => void start()}
            >
              {activeSession ? "Resume workout →" : starting ? "Starting…" : "Start workout →"}
            </button>
            {error && <small className="form-error">{error}</small>}
          </div>
        </section>
      ) : (
        <section className="card empty-state">
          <p className="label">NO ACTIVE WORKOUT</p>
          <h2>Your profile is ready.</h2>
          <p>Your first generated plan will appear here after adaptive planning is connected.</p>
        </section>
      )}
    </div>
  );
}

function Coach({ initialMessages }: { initialMessages: CoachMessage[] }) {
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  async function send(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true);
    setError("");
    setDraft("");
    try {
      const response = await apiRequest<CoachResponse>("/v1/coach/messages", {
        method: "POST",
        body: JSON.stringify({ message }),
      });
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: message,
          safetyCategory: "none",
          createdAt: new Date().toISOString(),
        },
        response.message,
      ]);
    } catch (cause) {
      setDraft(message);
      setError(cause instanceof Error ? cause.message : "The coach request failed");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="wrap">
      <section className="intro">
        <div>
          <p className="label">AI COACH</p>
          <h1>Your account-aware <em>fitness guide.</em></h1>
          <p>Responses come from the configured AI model and are saved to your account.</p>
        </div>
      </section>
      <section className="coach-layout single">
        <div className="card chat">
          <div className="messages">
            {messages.length === 0 && <p className="empty-copy">Start a conversation with your coach.</p>}
            {messages.map((message) => (
              <div className={message.role === "user" ? "mine" : "theirs"} key={message.id}>
                <i>{message.role === "user" ? "YOU" : "✦"}</i>
                <p>{message.content}</p>
              </div>
            ))}
          </div>
          <form onSubmit={send}>
            <input value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Ask about your training…" />
            <button type="submit" disabled={sending}>↑</button>
          </form>
          {error && <small className="form-error">{error}</small>}
        </div>
      </section>
    </div>
  );
}

function Plan({
  dashboard,
  refresh,
  onStart,
}: {
  dashboard: DashboardResponse;
  refresh: () => Promise<void>;
  onStart: (workoutId: string) => Promise<void>;
}) {
  const [generating, setGenerating] = useState(false);
  const [startingId, setStartingId] = useState("");
  const [error, setError] = useState("");

  async function generate() {
    setGenerating(true);
    setError("");
    try {
      await apiRequest<GeneratePlanResponse>("/v1/plans/generate", {
        method: "POST",
        body: JSON.stringify({}),
      });
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to generate your plan");
    } finally {
      setGenerating(false);
    }
  }

  async function start(workoutId: string) {
    setStartingId(workoutId);
    setError("");
    try {
      await onStart(workoutId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to start this workout");
    } finally {
      setStartingId("");
    }
  }

  return (
    <div className="wrap">
      <section className="intro">
        <div>
          <p className="label">TRAINING PLAN</p>
          <h1>Your adaptive <em>schedule.</em></h1>
          <p>Built from your real goal, experience, equipment, and available time.</p>
        </div>
        <button className="primary" disabled={generating} onClick={() => void generate()}>
          {generating
            ? "Designing your plan…"
            : dashboard.activePlan
              ? "Generate a new version"
              : "Generate my plan"}
        </button>
      </section>
      {error && <p className="form-error plan-error">{error}</p>}
      {dashboard.activePlan && (
        <section className="plan-band">
          <b>v{dashboard.activePlan.version}</b>
          <span>
            <strong>{dashboard.activePlan.title}</strong>
            <small>{dashboard.activePlan.summary}</small>
          </span>
        </section>
      )}
      <section className="days">
        {dashboard.upcomingWorkouts.map((workout) => (
          <article key={workout.id}>
            <p>
              WEEK {workout.weekNumber} · {new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(workout.scheduledFor))}
            </p>
            <h3>{workout.name}</h3>
            <small>{workout.focus} · {workout.estimatedMinutes} min</small>
            <ul className="exercise-list">
              {workout.exercises.map((exercise) => (
                <li key={exercise.exerciseId}>
                  <span>{exercise.name}</span>
                  <b>
                    {exercise.sets} × {exercise.repRange}
                    {exercise.loadAdjustmentPercent
                      ? ` · ${exercise.loadAdjustmentPercent > 0 ? "+" : ""}${exercise.loadAdjustmentPercent}% load`
                      : ""}
                  </b>
                </li>
              ))}
            </ul>
            <button
              className="outline session-start"
              disabled={Boolean(startingId)}
              onClick={() => void start(workout.id)}
            >
              {startingId === workout.id
                ? "Starting…"
                : workout.status === "in_progress"
                  ? "Resume session"
                  : "Start session"}
            </button>
          </article>
        ))}
      </section>
      {dashboard.upcomingWorkouts.length === 0 && (
        <section className="card empty-state">
          <h2>No plan generated yet.</h2>
          <p>Generate a four-week plan after reviewing your profile information.</p>
        </section>
      )}
    </div>
  );
}

function formatDuration(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function WorkoutRunner({
  session,
  onSession,
  onClose,
}: {
  session: WorkoutSession;
  onSession: (session: WorkoutSession) => void;
  onClose: () => Promise<void>;
}) {
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [reflection, setReflection] = useState(session.reflection);
  const [perceivedEffort, setPerceivedEffort] = useState(7);

  async function update(path: string, init: RequestInit) {
    setWorking(true);
    setError("");
    try {
      const response = await apiRequest<WorkoutSessionResponse>(path, init);
      onSession(response.session);
      return response.session;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Workout update failed");
      return null;
    } finally {
      setWorking(false);
    }
  }

  async function changeStatus() {
    await update(`/v1/workout-sessions/${session.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ action: session.status === "paused" ? "resume" : "pause" }),
    });
  }

  async function logSet(
    exerciseId: string,
    input: { reps: number; loadKg: number; effortRpe: number },
  ) {
    await update(`/v1/workout-sessions/${session.id}/sets`, {
      method: "POST",
      body: JSON.stringify({ exerciseId, ...input }),
    });
  }

  async function substitute(exerciseId: string) {
    await update(`/v1/workout-sessions/${session.id}/substitutions`, {
      method: "POST",
      body: JSON.stringify({ exerciseId }),
    });
  }

  async function finish() {
    const result = await update(`/v1/workout-sessions/${session.id}/finish`, {
      method: "POST",
      body: JSON.stringify({ reflection, perceivedEffort }),
    });
    if (result) await onClose();
  }

  async function abandon() {
    if (!window.confirm("Abandon this workout? It will be recorded as skipped.")) return;
    const result = await update(`/v1/workout-sessions/${session.id}/abandon`, {
      method: "POST",
      body: JSON.stringify({ reflection }),
    });
    if (result) await onClose();
  }

  return (
    <div className="wrap workout-runner">
      <section className="intro workout-heading">
        <div>
          <p className="label">LIVE WORKOUT · {session.status.toUpperCase()}</p>
          <h1>{session.name}</h1>
          <p>{session.totalSets} sets · {session.totalVolumeKg} kg volume · {formatDuration(session.durationSeconds)}</p>
        </div>
        <button className="outline" disabled={working} onClick={() => void changeStatus()}>
          {session.status === "paused" ? "Resume workout" : "Pause workout"}
        </button>
      </section>
      {session.status === "paused" && (
        <section className="pause-banner">Workout paused. Resume it before recording another set.</section>
      )}
      {error && <p className="form-error plan-error">{error}</p>}
      <section className="workout-exercises">
        {session.exercises.map((exercise) => (
          <ExerciseLogger
            key={exercise.exerciseId}
            exercise={exercise}
            disabled={working || session.status !== "active"}
            onLog={logSet}
            onSubstitute={substitute}
          />
        ))}
      </section>
      <section className="card finish-card">
        <div>
          <p className="label">SESSION REFLECTION</p>
          <h2>Close the loop.</h2>
          <p>Your effort and completed work update future load recommendations.</p>
        </div>
        <label>
          Overall effort (RPE {perceivedEffort}/10)
          <input
            type="range"
            min="1"
            max="10"
            value={perceivedEffort}
            onChange={(event) => setPerceivedEffort(Number(event.target.value))}
          />
        </label>
        <label>
          Reflection
          <textarea
            rows={3}
            maxLength={2_000}
            value={reflection}
            onChange={(event) => setReflection(event.target.value)}
            placeholder="What felt strong, difficult, or worth changing next time?"
          />
        </label>
        <div className="finish-actions">
          <button className="danger-link" disabled={working} onClick={() => void abandon()}>
            Abandon workout
          </button>
          <button className="primary" disabled={working || session.totalSets === 0} onClick={() => void finish()}>
            {working ? "Saving…" : "Finish workout →"}
          </button>
        </div>
      </section>
    </div>
  );
}

function ExerciseLogger({
  exercise,
  disabled,
  onLog,
  onSubstitute,
}: {
  exercise: WorkoutSession["exercises"][number];
  disabled: boolean;
  onLog: (
    exerciseId: string,
    input: { reps: number; loadKg: number; effortRpe: number },
  ) => Promise<void>;
  onSubstitute: (exerciseId: string) => Promise<void>;
}) {
  const [reps, setReps] = useState(8);
  const [loadKg, setLoadKg] = useState(0);
  const [effortRpe, setEffortRpe] = useState(7);

  return (
    <article className="card exercise-logger">
      <header>
        <div>
          <p className="label">
            {exercise.sets.length}/{exercise.prescribedSets} PRESCRIBED SETS
          </p>
          <h3>{exercise.name}</h3>
          <small>{exercise.repRange} · {exercise.coachingNotes}</small>
          {exercise.substitutedFor && (
            <small className="substitution-note">Substituted for {exercise.substitutedFor.name}</small>
          )}
        </div>
        <button
          className="substitute"
          disabled={disabled || exercise.sets.length > 0}
          onClick={() => void onSubstitute(exercise.exerciseId)}
        >
          Find substitute
        </button>
      </header>
      <div className="logged-sets">
        {exercise.sets.map((set) => (
          <span key={set.id}>
            <b>Set {set.setNumber}</b>
            {set.reps} reps · {set.loadKg} kg · RPE {set.effortRpe}
          </span>
        ))}
      </div>
      <div className="set-entry">
        <label>
          Reps
          <input type="number" min="1" max="100" value={reps} onChange={(event) => setReps(Number(event.target.value))} />
        </label>
        <label>
          Load (kg)
          <input type="number" min="0" max="1000" step="0.5" value={loadKg} onChange={(event) => setLoadKg(Number(event.target.value))} />
        </label>
        <label>
          Set RPE
          <input type="number" min="1" max="10" value={effortRpe} onChange={(event) => setEffortRpe(Number(event.target.value))} />
        </label>
        <button
          className="primary"
          disabled={disabled || exercise.sets.length >= exercise.prescribedSets + 2}
          onClick={() => void onLog(exercise.exerciseId, { reps, loadKg, effortRpe })}
        >
          Log set
        </button>
      </div>
    </article>
  );
}

function History({ dashboard }: { dashboard: DashboardResponse }) {
  const completed = useMemo(
    () => dashboard.recentSessions.filter((session) => session.status === "completed"),
    [dashboard.recentSessions],
  );
  return (
    <div className="wrap">
      <section className="intro"><div><p className="label">TRAINING HISTORY</p><h1>Your completed <em>work.</em></h1></div></section>
      <section className="history">
        <div className="card stats">
          <p className="label">LIFETIME PROGRESS</p>
          <div><b>{dashboard.progress.completedSessions}</b><small>completed sessions</small></div>
          <div><b>{dashboard.progress.completedSets}</b><small>completed sets</small></div>
          <div><b>{dashboard.progress.totalVolumeKg}</b><small>kilograms of recorded volume</small></div>
          <div><b>{dashboard.progress.averageEffort ?? "—"}</b><small>average session RPE</small></div>
        </div>
        <div className="card session-list">
          {dashboard.recentSessions.map((session) => (
            <article key={session.id}>
              <span>
                <b>{session.name}</b>
                <small>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.startedAt))}</small>
              </span>
              <span className={`session-status ${session.status}`}>{session.status}</span>
              <small>{session.totalSets} sets · {session.totalVolumeKg} kg · {formatDuration(session.durationSeconds)}</small>
              {session.reflection && <p>{session.reflection}</p>}
            </article>
          ))}
          {completed.length === 0 && dashboard.recentSessions.length === 0 && <p>No sessions recorded yet.</p>}
        </div>
      </section>
    </div>
  );
}
