"use client";

import type {
  CoachMessage,
  CoachResponse,
  DashboardResponse,
  GeneratePlanResponse,
  UserProfile,
} from "@fitai/contracts";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiRequest } from "@/lib/api";

type View = "today" | "coach" | "plan" | "history";
type CurrentUser = { id: string; name: string; email: string };

function recordText(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

export default function FitAICoach({ user }: { user: CurrentUser }) {
  const [view, setView] = useState<View>("today");
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadDashboard() {
    setLoading(true);
    setError("");
    try {
      setDashboard(await apiRequest<DashboardResponse>("/v1/dashboard"));
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
        if (active) setDashboard(data);
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
        {view === "today" && <Today dashboard={dashboard} />}
        {view === "coach" && (
          <Coach initialMessages={dashboard.recentMessages} />
        )}
        {view === "plan" && (
          <Plan dashboard={dashboard} refresh={loadDashboard} />
        )}
        {view === "history" && <History dashboard={dashboard} />}
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

function Today({ dashboard }: { dashboard: DashboardResponse }) {
  const nextWorkout = dashboard.upcomingWorkouts[0];
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
      {nextWorkout ? (
        <section className="hero">
          <div>
            <p className="label">NEXT SESSION</p>
            <h2>{nextWorkout.name}</h2>
            <p>{nextWorkout.focus}</p>
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
          <p>Responses come from the configured OpenAI model and are saved to your account.</p>
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
}: {
  dashboard: DashboardResponse;
  refresh: () => Promise<void>;
}) {
  const [generating, setGenerating] = useState(false);
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
                  <b>{exercise.sets} × {exercise.repRange}</b>
                </li>
              ))}
            </ul>
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

function History({ dashboard }: { dashboard: DashboardResponse }) {
  const completed = useMemo(
    () => dashboard.recentSessions.filter((session) => recordText(session, "status") === "completed"),
    [dashboard.recentSessions],
  );
  return (
    <div className="wrap">
      <section className="intro"><div><p className="label">TRAINING HISTORY</p><h1>Your completed <em>work.</em></h1></div></section>
      <section className="history">
        <div className="card stats"><p className="label">RECORDED SESSIONS</p><div><b>{completed.length}</b><small>completed sessions</small></div></div>
        <div className="card session-list">
          {dashboard.recentSessions.map((session, index) => (
            <article key={`${recordText(session, "id")}-${index}`}><b>{recordText(session, "name") || "Workout session"}</b><small>{recordText(session, "startedAt")}</small></article>
          ))}
          {dashboard.recentSessions.length === 0 && <p>No sessions recorded yet.</p>}
        </div>
      </section>
    </div>
  );
}
