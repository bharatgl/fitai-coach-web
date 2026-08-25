"use client";

import type {
  CoachMessage,
  CoachResponse,
  CoachThread,
  CoachThreadDetail,
  CoachThreadListResponse,
  CreateCoachThreadResponse,
  DashboardResponse,
  GeneratePlanResponse,
  PlannedWorkout,
  StartWorkoutResponse,
  UserProfile,
  WorkoutSession,
  WorkoutSessionResponse,
} from "@fitai/contracts";
import {
  Button,
  Card,
  Eyebrow,
  Field,
  PageHeader,
  StatusBadge,
} from "@fitai/ui";
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
              aria-current={view === id ? "page" : undefined}
            >
              <span aria-hidden="true">{icon}</span>
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
        <header className="mobile-header hidden">
          <button className="brand" onClick={() => setView("today")} aria-label="Go to Today">
            <span>F</span>FitAI <i>Coach</i>
          </button>
          <span className="mobile-avatar" aria-label={`Signed in as ${user.name}`}>{initials}</span>
        </header>
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
        <nav className="mobile-nav hidden" aria-label="Primary navigation">
          {nav.map(([id, icon, name]) => (
            <button
              key={id}
              onClick={() => setView(id)}
              className={view === id ? "active" : ""}
              aria-current={view === id ? "page" : undefined}
            >
              <span aria-hidden="true">{icon}</span>
              <small>{name}</small>
            </button>
          ))}
        </nav>
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
      <Card className="auth-card" padding="lg">
        <span className="auth-mark">F</span>
        <h1>{title}</h1>
        {detail && <p>{detail}</p>}
        {retry && (
          <Button onClick={() => void retry()}>
            Try again
          </Button>
        )}
      </Card>
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
        <Eyebrow>WELCOME, {user.name}</Eyebrow>
        <h1>Set up your real training profile.</h1>
        <p>This information is saved to your account and used by your coach.</p>
        <Field label="Experience level">
          <select name="experienceLevel" defaultValue="beginner">
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </Field>
        <Field label="Primary goal">
          <input name="primaryGoal" required placeholder="Build strength" />
        </Field>
        <Field label="Available equipment" hint="Separate multiple items with commas.">
          <input name="equipment" placeholder="Dumbbells, resistance bands" />
        </Field>
        <div className="form-row">
          <Field label="Days per week">
            <input name="trainingDaysPerWeek" type="number" min="1" max="7" defaultValue="3" />
          </Field>
          <Field label="Minutes per session">
            <input name="preferredSessionMinutes" type="number" min="10" max="180" defaultValue="35" />
          </Field>
        </div>
        <Field label="Movement considerations" hint="Optional. Include injuries, mobility limitations, or movements to avoid.">
          <textarea name="movementNotes" rows={3} placeholder="Anything your coach should account for" />
        </Field>
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button type="submit" busy={saving} fullWidth>
          {saving ? "Saving…" : "Save profile"}
        </Button>
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
      <PageHeader
        eyebrow="Today"
        title={<>Train with <em>real context.</em></>}
        description="Your training, progress, and next best action in one calm workspace."
      />
      {activeSession || nextWorkout ? (
        <Card className="hero" tone="dark" padding="lg">
          <div>
            <Eyebrow>{activeSession ? "Session in progress" : "Next session"}</Eyebrow>
            <h2>{activeSession?.name ?? nextWorkout?.name}</h2>
            <p>{activeSession ? `${activeSession.totalSets} sets recorded` : nextWorkout?.focus}</p>
            <Button
              size="lg"
              busy={starting}
              onClick={activeSession ? onResume : () => void start()}
            >
              {activeSession ? "Resume workout" : starting ? "Starting…" : "Start workout"}
            </Button>
            {error && <small className="form-error" role="alert">{error}</small>}
          </div>
        </Card>
      ) : (
        <Card className="empty-state" padding="lg">
          <Eyebrow>No active workout</Eyebrow>
          <h2>Your profile is ready.</h2>
          <p>Generate your first adaptive plan to see the next workout here.</p>
        </Card>
      )}
    </div>
  );
}

function Coach({ initialMessages }: { initialMessages: CoachMessage[] }) {
  const [threads, setThreads] = useState<CoachThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [error, setError] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;
  const templates = [
    {
      title: "Review today's workout",
      prompt: "Review today's workout and tell me what to prioritize before I begin.",
    },
    {
      title: "Adjust my plan",
      prompt: "I need to adjust this week's plan around my current schedule and recovery.",
    },
    {
      title: "Recovery check-in",
      prompt: "Help me assess my recovery and decide how hard I should train today.",
    },
    {
      title: "Build a nutrition habit",
      prompt: "Help me choose one realistic nutrition habit that supports my current goal.",
    },
  ];

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await apiRequest<CoachThreadListResponse>("/v1/coach/threads");
        if (!active) return;
        setThreads(response.threads);
        const first = response.threads[0];
        if (first) {
          setActiveThreadId(first.id);
          const detail = await apiRequest<CoachThreadDetail>(`/v1/coach/threads/${first.id}`);
          if (active) setMessages(detail.messages);
        } else {
          setMessages([]);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load conversations");
      } finally {
        if (active) setLoadingThreads(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  function promoteThread(thread: CoachThread) {
    setThreads((current) => [thread, ...current.filter((item) => item.id !== thread.id)]);
  }

  async function openThread(threadId: string) {
    if (threadId === activeThreadId) return;
    setError("");
    setActiveThreadId(threadId);
    setMessages([]);
    try {
      const detail = await apiRequest<CoachThreadDetail>(`/v1/coach/threads/${threadId}`);
      setMessages(detail.messages);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open this conversation");
    }
  }

  function newChat() {
    setActiveThreadId(null);
    setMessages([]);
    setDraft("");
    setError("");
    setEditingMessageId(null);
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true);
    setError("");
    setDraft("");
    const optimisticId = `pending-${crypto.randomUUID()}`;
    setMessages((current) => [
      ...current,
      {
        id: optimisticId,
        role: "user",
        content: message,
        safetyCategory: "none",
        createdAt: new Date().toISOString(),
      },
    ]);
    try {
      const response = await apiRequest<CoachResponse>("/v1/coach/messages", {
        method: "POST",
        body: JSON.stringify({ message, threadId: activeThreadId ?? undefined }),
      });
      setMessages((current) => [
        ...current.filter((item) => item.id !== optimisticId),
        response.userMessage,
        response.message,
      ]);
      setActiveThreadId(response.thread.id);
      promoteThread(response.thread);
    } catch (cause) {
      setMessages((current) => current.filter((item) => item.id !== optimisticId));
      setDraft(message);
      setError(cause instanceof Error ? cause.message : "The coach request failed");
    } finally {
      setSending(false);
    }
  }

  async function renameThread(event: FormEvent, threadId: string) {
    event.preventDefault();
    const title = renameDraft.trim();
    if (!title) return;
    try {
      const response = await apiRequest<CreateCoachThreadResponse>(`/v1/coach/threads/${threadId}`, {
        method: "PATCH",
        body: JSON.stringify({ title }),
      });
      setThreads((current) => current.map((thread) => thread.id === threadId ? response.thread : thread));
      setRenamingId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to rename this conversation");
    }
  }

  async function deleteThread(threadId: string) {
    if (!window.confirm("Delete this conversation and all of its messages?")) return;
    try {
      await apiRequest<void>(`/v1/coach/threads/${threadId}`, { method: "DELETE" });
      const remaining = threads.filter((thread) => thread.id !== threadId);
      setThreads(remaining);
      if (activeThreadId === threadId) {
        const next = remaining[0];
        if (next) await openThread(next.id);
        else newChat();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete this conversation");
    }
  }

  async function saveMessageEdit(event: FormEvent, messageId: string) {
    event.preventDefault();
    const content = editDraft.trim();
    if (!content || sending) return;
    setSending(true);
    setError("");
    try {
      const detail = await apiRequest<CoachThreadDetail>(`/v1/coach/messages/${messageId}`, {
        method: "PATCH",
        body: JSON.stringify({ content }),
      });
      setMessages(detail.messages);
      promoteThread(detail.thread);
      setEditingMessageId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to edit this message");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="wrap coach-page">
      <section className="coach-workspace">
        <aside className="thread-panel" aria-label="Coach conversations">
          <div className="thread-panel-head">
            <div>
              <Eyebrow>Conversations</Eyebrow>
              <strong>Your coaching history</strong>
            </div>
            <Button size="sm" onClick={newChat}>New chat</Button>
          </div>
          <div className="thread-list">
            {loadingThreads && <p className="thread-empty">Loading conversations…</p>}
            {!loadingThreads && threads.length === 0 && (
              <p className="thread-empty">Your conversations will appear here.</p>
            )}
            {threads.map((thread) => (
              <div className={thread.id === activeThreadId ? "thread-item active" : "thread-item"} key={thread.id}>
                {renamingId === thread.id ? (
                  <form className="thread-rename" onSubmit={(event) => void renameThread(event, thread.id)}>
                    <label className="ui-visually-hidden" htmlFor={`rename-${thread.id}`}>Conversation title</label>
                    <input id={`rename-${thread.id}`} value={renameDraft} maxLength={80} onChange={(event) => setRenameDraft(event.target.value)} />
                    <button type="submit" aria-label="Save conversation title">✓</button>
                    <button type="button" aria-label="Cancel rename" onClick={() => setRenamingId(null)}>×</button>
                  </form>
                ) : (
                  <>
                    <button className="thread-open" type="button" onClick={() => void openThread(thread.id)}>
                      <span>{thread.title}</span>
                      <small>{thread.messageCount} messages</small>
                    </button>
                    <div className="thread-actions">
                      <button type="button" aria-label={`Rename ${thread.title}`} onClick={() => { setRenamingId(thread.id); setRenameDraft(thread.title); }}>✎</button>
                      <button type="button" aria-label={`Delete ${thread.title}`} onClick={() => void deleteThread(thread.id)}>×</button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </aside>
        <Card className="chat" padding="md">
          <header className="chat-header">
            <div>
              <Eyebrow>AI coach · {activeThread ? "Conversation" : "New conversation"}</Eyebrow>
              <strong>{activeThread?.title ?? "What can I help with?"}</strong>
              <span>Account-aware guidance for your training, recovery, and plan.</span>
            </div>
            {activeThread && <small>{activeThread.messageCount} messages</small>}
          </header>
          <div className="messages">
            {messages.length === 0 && !loadingThreads && (
              <div className="chat-starter">
                <h2>How can I help you train today?</h2>
                <p>Choose a starting point or write your own question.</p>
                <div className="prompt-templates">
                  {templates.map((template) => (
                    <button type="button" key={template.title} onClick={() => setDraft(template.prompt)}>
                      <strong>{template.title}</strong>
                      <span>{template.prompt}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message) => (
              <article className={message.role === "user" ? "mine" : "theirs"} key={message.id}>
                <i>{message.role === "user" ? "YOU" : "✦"}</i>
                <div className="message-body">
                  {editingMessageId === message.id ? (
                    <form className="message-edit" onSubmit={(event) => void saveMessageEdit(event, message.id)}>
                      <label className="ui-visually-hidden" htmlFor={`edit-${message.id}`}>Edit message</label>
                      <textarea id={`edit-${message.id}`} value={editDraft} onChange={(event) => setEditDraft(event.target.value)} />
                      <small>Saving will regenerate replies after this message.</small>
                      <div>
                        <Button size="sm" type="submit" busy={sending}>Save and resend</Button>
                        <Button size="sm" type="button" variant="ghost" onClick={() => setEditingMessageId(null)}>Cancel</Button>
                      </div>
                    </form>
                  ) : (
                    <>
                      <p>{message.content}</p>
                      <footer>
                        {message.editedAt && <small>Edited</small>}
                        {message.role === "user" && !message.id.startsWith("pending-") && (
                          <button type="button" onClick={() => { setEditingMessageId(message.id); setEditDraft(message.content); }}>Edit</button>
                        )}
                      </footer>
                    </>
                  )}
                </div>
              </article>
            ))}
          </div>
          <form className="chat-composer" onSubmit={send}>
            <label className="ui-visually-hidden" htmlFor="coach-message">Message your AI coach</label>
            <textarea
              id="coach-message"
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder="Ask about your training…"
            />
            <button type="submit" disabled={sending} aria-label="Send message">↑</button>
          </form>
          {error && <small className="form-error" role="alert">{error}</small>}
        </Card>
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
  const weeklyWorkouts = useMemo(() => {
    const weeks = new Map<number, Map<string, PlannedWorkout[]>>();
    for (const workout of dashboard.upcomingWorkouts) {
      const date = workout.scheduledFor.slice(0, 10);
      const days = weeks.get(workout.weekNumber) ?? new Map<string, PlannedWorkout[]>();
      days.set(date, [...(days.get(date) ?? []), workout]);
      weeks.set(workout.weekNumber, days);
    }
    return [...weeks.entries()]
      .sort(([left], [right]) => left - right)
      .map(([weekNumber, days]) => ({
        weekNumber,
        days: [...days.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([date, workouts]) => ({ date, workouts })),
      }));
  }, [dashboard.upcomingWorkouts]);

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
      <PageHeader
        eyebrow="Training plan"
        title={<>Your adaptive <em>schedule.</em></>}
        description="Built around your goal, experience, equipment, and available time."
        actions={
          <Button busy={generating} onClick={() => void generate()}>
            {generating
              ? "Designing your plan…"
              : dashboard.activePlan
                ? "Generate a new version"
                : "Generate my plan"}
          </Button>
        }
      />
      {error && <p className="form-error plan-error" role="alert">{error}</p>}
      {dashboard.activePlan && (
        <section className="plan-band">
          <b>v{dashboard.activePlan.version}</b>
          <span>
            <strong>{dashboard.activePlan.title}</strong>
            <small>{dashboard.activePlan.summary}</small>
          </span>
        </section>
      )}
      <section className="plan-weeks" aria-label="Workout schedule">
        {weeklyWorkouts.map((week) => {
          const firstDate = week.days[0]?.date;
          const lastDate = week.days.at(-1)?.date;
          const dateRange = firstDate && lastDate
            ? `${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${firstDate}T12:00:00`))} – ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${lastDate}T12:00:00`))}`
            : "";
          return (
            <section className="plan-week" key={week.weekNumber} aria-labelledby={`week-${week.weekNumber}`}>
              <header className="plan-week-header">
                <div>
                  <Eyebrow>Week {week.weekNumber}</Eyebrow>
                  <h2 id={`week-${week.weekNumber}`}>{dateRange}</h2>
                </div>
                {dashboard.activePlan?.weeklyProgression[week.weekNumber - 1] && (
                  <p>{dashboard.activePlan.weeklyProgression[week.weekNumber - 1]}</p>
                )}
              </header>
              <div className="plan-timeline">
                {week.days.map((day) => {
                  const date = new Date(`${day.date}T12:00:00`);
                  return (
                    <section className="plan-timeline-day" key={day.date}>
                      <time className="plan-date" dateTime={day.date}>
                        <strong>{new Intl.DateTimeFormat("en", { weekday: "short" }).format(date)}</strong>
                        <span>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date)}</span>
                      </time>
                      <div className="plan-day-workouts">
                        {day.workouts.map((workout) => (
                          <Card as="article" key={workout.id} padding="md" className="plan-day">
                            <div className="plan-day-heading">
                              <div>
                                <h3>{workout.name}</h3>
                                <small>{workout.focus} · {workout.estimatedMinutes} min</small>
                              </div>
                              <StatusBadge tone={workout.status === "in_progress" ? "warning" : "neutral"}>
                                {workout.status === "in_progress" ? "In progress" : "Planned"}
                              </StatusBadge>
                            </div>
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
                            <Button
                              variant="secondary"
                              className="session-start"
                              disabled={Boolean(startingId)}
                              onClick={() => void start(workout.id)}
                            >
                              {startingId === workout.id
                                ? "Starting…"
                                : workout.status === "in_progress"
                                  ? "Resume session"
                                  : "Start session"}
                            </Button>
                          </Card>
                        ))}
                      </div>
                    </section>
                  );
                })}
              </div>
            </section>
          );
        })}
      </section>
      {weeklyWorkouts.length === 0 && (
        <Card className="empty-state" padding="lg">
          <h2>No plan generated yet.</h2>
          <p>Generate a four-week plan after reviewing your profile information.</p>
        </Card>
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
      <PageHeader
        className="workout-heading"
        eyebrow={<>Live workout · <StatusBadge tone={session.status === "paused" ? "warning" : "success"}>{session.status}</StatusBadge></>}
        title={session.name}
        description={`${session.totalSets} sets · ${session.totalVolumeKg} kg volume · ${formatDuration(session.durationSeconds)}`}
        actions={
          <Button variant="secondary" disabled={working} onClick={() => void changeStatus()}>
            {session.status === "paused" ? "Resume workout" : "Pause workout"}
          </Button>
        }
      />
      {session.status === "paused" && (
        <section className="pause-banner">Workout paused. Resume it before recording another set.</section>
      )}
      {error && <p className="form-error plan-error" role="alert">{error}</p>}
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
      <Card className="finish-card" padding="lg">
        <div>
          <Eyebrow>Session reflection</Eyebrow>
          <h2>Close the loop.</h2>
          <p>Your effort and completed work update future load recommendations.</p>
        </div>
        <Field label={`Overall effort (RPE ${perceivedEffort}/10)`}>
          <input
            type="range"
            min="1"
            max="10"
            value={perceivedEffort}
            onChange={(event) => setPerceivedEffort(Number(event.target.value))}
          />
        </Field>
        <Field label="Reflection" hint="Optional, but useful for future adjustments.">
          <textarea
            rows={3}
            maxLength={2_000}
            value={reflection}
            onChange={(event) => setReflection(event.target.value)}
            placeholder="What felt strong, difficult, or worth changing next time?"
          />
        </Field>
        <div className="finish-actions">
          <Button variant="danger" disabled={working} onClick={() => void abandon()}>
            Abandon workout
          </Button>
          <Button busy={working} disabled={session.totalSets === 0} onClick={() => void finish()}>
            {working ? "Saving…" : "Finish workout →"}
          </Button>
        </div>
      </Card>
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
    <Card as="article" className="exercise-logger" padding="md">
      <header>
        <div>
          <Eyebrow>
            {exercise.sets.length}/{exercise.prescribedSets} PRESCRIBED SETS
          </Eyebrow>
          <h3>{exercise.name}</h3>
          <small>{exercise.repRange} · {exercise.coachingNotes}</small>
          {exercise.substitutedFor && (
            <small className="substitution-note">Substituted for {exercise.substitutedFor.name}</small>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="substitute"
          disabled={disabled || exercise.sets.length > 0}
          onClick={() => void onSubstitute(exercise.exerciseId)}
        >
          Find substitute
        </Button>
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
        <Field label="Reps">
          <input type="number" min="1" max="100" value={reps} onChange={(event) => setReps(Number(event.target.value))} />
        </Field>
        <Field label="Load (kg)">
          <input type="number" min="0" max="1000" step="0.5" value={loadKg} onChange={(event) => setLoadKg(Number(event.target.value))} />
        </Field>
        <Field label="Set RPE">
          <input type="number" min="1" max="10" value={effortRpe} onChange={(event) => setEffortRpe(Number(event.target.value))} />
        </Field>
        <Button
          disabled={disabled || exercise.sets.length >= exercise.prescribedSets + 2}
          onClick={() => void onLog(exercise.exerciseId, { reps, loadKg, effortRpe })}
        >
          Log set
        </Button>
      </div>
    </Card>
  );
}

function History({ dashboard }: { dashboard: DashboardResponse }) {
  const completed = useMemo(
    () => dashboard.recentSessions.filter((session) => session.status === "completed"),
    [dashboard.recentSessions],
  );
  return (
    <div className="wrap">
      <PageHeader eyebrow="Training history" title={<>Your completed <em>work.</em></>} description="Track consistency, effort, and recorded training volume over time." />
      <section className="history">
        <Card className="stats" padding="md">
          <Eyebrow>Lifetime progress</Eyebrow>
          <div><b>{dashboard.progress.completedSessions}</b><small>completed sessions</small></div>
          <div><b>{dashboard.progress.completedSets}</b><small>completed sets</small></div>
          <div><b>{dashboard.progress.totalVolumeKg}</b><small>kilograms of recorded volume</small></div>
          <div><b>{dashboard.progress.averageEffort ?? "—"}</b><small>average session RPE</small></div>
        </Card>
        <Card className="session-list" padding="md">
          {dashboard.recentSessions.map((session) => (
            <article key={session.id}>
              <span>
                <b>{session.name}</b>
                <small>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.startedAt))}</small>
              </span>
              <StatusBadge tone={session.status === "completed" ? "success" : session.status === "abandoned" ? "danger" : "warning"}>{session.status}</StatusBadge>
              <small>{session.totalSets} sets · {session.totalVolumeKg} kg · {formatDuration(session.durationSeconds)}</small>
              {session.reflection && <p>{session.reflection}</p>}
            </article>
          ))}
          {completed.length === 0 && dashboard.recentSessions.length === 0 && <p>No sessions recorded yet.</p>}
        </Card>
      </section>
    </div>
  );
}
