"use client";

import type {
  CoachAttachment,
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
  UpdateCoachThreadRequest,
  UploadCoachAttachmentResponse,
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
import Image from "next/image";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { apiRequest } from "@/lib/api";
import { BrandLockup } from "@/components/BrandLockup";
import { ExerciseVideoButton } from "@/components/ExerciseVideo";
import { MovementTracker } from "@/components/MovementTracker";

type View = "today" | "coach" | "plan" | "history" | "profile" | "workout";
type CurrentUser = { id: string; name: string; email: string };
type NavIconName = "today" | "coach" | "plan" | "history";
type ThreadActionIconName = "more" | "share" | "rename" | "pin" | "archive" | "delete";
type PendingCoachAttachment = {
  key: string;
  file: File;
  previewUrl: string | null;
};

const coachAttachmentTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const maxCoachAttachmentBytes = 5 * 1024 * 1024;
const maxCoachAttachments = 3;

function AttachmentIcon({ kind = "attach" }: { kind?: "attach" | "file" | "remove" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === "attach" ? (
        <path d="m20.5 11.5-8.9 8.9a6 6 0 0 1-8.5-8.5l9.6-9.6a4.25 4.25 0 0 1 6 6l-9.6 9.6a2.5 2.5 0 0 1-3.5-3.5l8.8-8.8" />
      ) : kind === "file" ? (
        <><path d="M6 2.75h8l4 4V21H6Z" /><path d="M14 2.75V7h4M9 12h6M9 16h4" /></>
      ) : (
        <path d="m7 7 10 10M17 7 7 17" />
      )}
    </svg>
  );
}

function attachmentUrl(attachmentId: string) {
  return `/api/backend/coach/attachments/${attachmentId}`;
}

function formatAttachmentSize(size: number) {
  return size < 1024 * 1024
    ? `${Math.max(1, Math.round(size / 1024))} KB`
    : `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(`Unable to read ${file.name}`));
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const commaIndex = result.indexOf(",");
      if (commaIndex < 0) reject(new Error(`Unable to read ${file.name}`));
      else resolve(result.slice(commaIndex + 1));
    };
    reader.readAsDataURL(file);
  });
}

function MessageAttachments({ attachments }: { attachments: CoachAttachment[] }) {
  if (!attachments.length) return null;
  return (
    <div className="message-attachments">
      {attachments.map((attachment) => {
        const isImage = attachment.mimeType.startsWith("image/");
        return (
          <a
            className={isImage ? "message-attachment message-attachment-image" : "message-attachment"}
            href={attachmentUrl(attachment.id)}
            key={attachment.id}
            target="_blank"
            rel="noreferrer"
            title={`Open ${attachment.name}`}
          >
            {isImage ? (
              <Image
                src={attachmentUrl(attachment.id)}
                alt={attachment.name}
                width={220}
                height={132}
                unoptimized
              />
            ) : (
              <span className="message-file-icon"><AttachmentIcon kind="file" /></span>
            )}
            <span className="message-attachment-copy">
              <strong>{attachment.name}</strong>
              <small>{attachment.mimeType === "application/pdf" ? "PDF" : "Image"} · {formatAttachmentSize(attachment.size)}</small>
            </span>
          </a>
        );
      })}
    </div>
  );
}

function NavIcon({ name }: { name: NavIconName }) {
  const paths: Record<NavIconName, React.ReactNode> = {
    today: <path d="m13 2-8 11h6l-1 9 9-12h-6z" />,
    coach: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" /><path d="M8 9h8M8 13h5" /></>,
    plan: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    history: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  };
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

function ThreadActionIcon({ name }: { name: ThreadActionIconName }) {
  return (
    <svg
      className="thread-action-icon"
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "more" ? (
        <>
          <circle cx="12" cy="5" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="12" cy="19" r="1.15" fill="currentColor" stroke="none" />
        </>
      ) : name === "share" ? (
        <>
          <path d="M12 3v12M8 7l4-4 4 4" />
          <path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8" />
        </>
      ) : name === "rename" ? (
        <>
          <path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" />
          <path d="m13.5 6.5 4 4" />
        </>
      ) : name === "pin" ? (
        <>
          <path d="m15 4 5 5-3 1-4 4-1 5-2-2-3 3-1-1 3-3-2-2 5-1 4-4Z" />
        </>
      ) : name === "archive" ? (
        <>
          <path d="M4 8h16v12H4Z" />
          <path d="M3 4h18v4H3ZM9 12h6" />
        </>
      ) : (
        <>
          <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13" />
          <path d="M10 11v5M14 11v5" />
        </>
      )}
    </svg>
  );
}

function sortCoachThreads(threads: CoachThread[]) {
  return [...threads].sort((left, right) =>
    Number(right.pinned) - Number(left.pinned)
    || right.updatedAt.localeCompare(left.updatedAt),
  );
}

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
      setError(cause instanceof Error ? cause.message : "Unable to load forgefit.space");
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
          setError(cause instanceof Error ? cause.message : "Unable to load forgefit.space");
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
    return <StatusScreen title="forgefit.space could not connect" detail={error} retry={loadDashboard} />;
  if (!dashboard?.profile)
    return <Onboarding user={user} onSaved={loadDashboard} />;

  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const nav: [View, NavIconName, string][] = [
    ["today", "today", "Today"],
    ["coach", "coach", "Coach"],
    ["plan", "plan", "Plan"],
    ["history", "history", "History"],
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
        <button className="brand" onClick={() => setView("today")} aria-label="Go to forgefit.space Today">
          <BrandLockup />
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
              <NavIcon name={icon} />
              {name}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <p>✦ Fitness guidance, not medical care.</p>
          <button className="profile" onClick={() => setView("profile")}>
            <b>{initials}</b>
            <span>
              <strong>{user.name}</strong>
              <small>{dashboard.profile.experienceLevel} · Edit profile</small>
            </span>
          </button>
          <Link className="signout" href="/api/auth/signout">
            Sign out
          </Link>
        </div>
      </aside>
      <section className={view === "coach" ? "main coach-active" : "main"}>
        <header className="mobile-header hidden">
          <button className="brand" onClick={() => setView("today")} aria-label="Go to Today">
            <BrandLockup />
          </button>
          <button
            className="mobile-avatar"
            onClick={() => setView("profile")}
            aria-label={`Edit profile for ${user.name}`}
          >
            {initials}
          </button>
        </header>
        <header className="topbar">
          <span>
            <i /> TRAINING SYSTEM ONLINE
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
        {view === "profile" && (
          <ProfileSettings
            profile={dashboard.profile}
            onSaved={async () => {
              await loadDashboard();
              setView("plan");
            }}
          />
        )}
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
              <NavIcon name={icon} />
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
        <BrandLockup />
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
          gender: form.get("gender"),
          age: optionalNumber(form.get("age")),
          heightCm: optionalNumber(form.get("heightCm")),
          weightKg: optionalNumber(form.get("weightKg")),
          primaryGoal: form.get("primaryGoal"),
          equipment: String(form.get("equipment") ?? "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          trainingDaysPerWeek: Number(form.get("trainingDaysPerWeek")),
          preferredSessionMinutes: Number(form.get("preferredSessionMinutes")),
          movementNotes: String(form.get("movementNotes") ?? ""),
          bodyConsiderations: String(form.get("bodyConsiderations") ?? ""),
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
        <ProfileFields />
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button type="submit" busy={saving} fullWidth>
          {saving ? "Saving…" : "Save profile"}
        </Button>
      </form>
    </main>
  );
}

function optionalNumber(value: FormDataEntryValue | null) {
  const normalized = String(value ?? "").trim();
  return normalized ? Number(normalized) : null;
}

function ProfileFields({ profile }: { profile?: UserProfile }) {
  return (
    <>
      <div className="form-row">
        <Field label="Experience level">
          <select name="experienceLevel" defaultValue={profile?.experienceLevel ?? "beginner"}>
            <option value="beginner">Beginner</option>
            <option value="intermediate">Intermediate</option>
            <option value="advanced">Advanced</option>
          </select>
        </Field>
        <Field
          label="Gender context"
          hint="Optional context only; forgefit.space does not create stereotyped gender workouts."
        >
          <select name="gender" defaultValue={profile?.gender ?? "prefer_not_to_say"}>
            <option value="prefer_not_to_say">Prefer not to say</option>
            <option value="woman">Woman</option>
            <option value="man">Man</option>
            <option value="non_binary">Non-binary</option>
          </select>
        </Field>
      </div>
      <div className="form-row body-metrics">
        <Field label="Age" hint="Optional">
          <input name="age" type="number" min="13" max="100" defaultValue={profile?.age ?? ""} />
        </Field>
        <Field label="Height (cm)" hint="Optional">
          <input name="heightCm" type="number" min="100" max="250" step="0.1" defaultValue={profile?.heightCm ?? ""} />
        </Field>
        <Field label="Weight (kg)" hint="Optional">
          <input name="weightKg" type="number" min="30" max="350" step="0.1" defaultValue={profile?.weightKg ?? ""} />
        </Field>
      </div>
      <Field label="Primary goal">
        <input
          name="primaryGoal"
          required
          defaultValue={profile?.primaryGoal ?? ""}
          placeholder="Build strength"
        />
      </Field>
      <Field label="Available equipment" hint="Separate multiple items with commas.">
        <input
          name="equipment"
          defaultValue={profile?.equipment.join(", ") ?? ""}
          placeholder="Dumbbells, resistance bands"
        />
      </Field>
      <div className="form-row">
        <Field label="Days per week">
          <input
            name="trainingDaysPerWeek"
            type="number"
            min="1"
            max="7"
            defaultValue={profile?.trainingDaysPerWeek ?? 3}
          />
        </Field>
        <Field label="Minutes per session">
          <input
            name="preferredSessionMinutes"
            type="number"
            min="10"
            max="180"
            defaultValue={profile?.preferredSessionMinutes ?? 35}
          />
        </Field>
      </div>
      <Field
        label="Body considerations"
        hint="Optional. Add proportions, pregnancy/postpartum context, cycle preferences, or areas needing extra support."
      >
        <textarea
          name="bodyConsiderations"
          rows={3}
          defaultValue={profile?.bodyConsiderations ?? ""}
          placeholder="For example: long femurs, prefer low-impact work, more upper-body focus"
        />
      </Field>
      <Field
        label="Movement considerations"
        hint="Optional. Include injuries, mobility limitations, or movements to avoid."
      >
        <textarea
          name="movementNotes"
          rows={3}
          defaultValue={profile?.movementNotes ?? ""}
          placeholder="Anything your coach should account for"
        />
      </Field>
    </>
  );
}

function ProfileSettings({
  profile,
  onSaved,
}: {
  profile: UserProfile;
  onSaved: () => Promise<void>;
}) {
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
          gender: form.get("gender"),
          age: optionalNumber(form.get("age")),
          heightCm: optionalNumber(form.get("heightCm")),
          weightKg: optionalNumber(form.get("weightKg")),
          primaryGoal: form.get("primaryGoal"),
          equipment: String(form.get("equipment") ?? "")
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean),
          trainingDaysPerWeek: Number(form.get("trainingDaysPerWeek")),
          preferredSessionMinutes: Number(form.get("preferredSessionMinutes")),
          movementNotes: String(form.get("movementNotes") ?? ""),
          bodyConsiderations: String(form.get("bodyConsiderations") ?? ""),
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
    <div className="wrap profile-settings">
      <PageHeader
        eyebrow="Training profile"
        title={<>Personalize around <em>your body.</em></>}
        description="Update the context used for exercise selection, volume, recovery, and coaching cues. Generate a new plan after saving to apply changes."
      />
      <form className="onboarding-card profile-card" onSubmit={submit}>
        <ProfileFields profile={profile} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <Button type="submit" busy={saving} fullWidth>
          {saving ? "Saving…" : "Save and review plan"}
        </Button>
      </form>
    </div>
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
        eyebrow="Today's training"
        title={<>Build momentum. <em>Own the session.</em></>}
        description="Your adaptive workout, live movement guidance, and performance history in one training system."
      />
      {activeSession || nextWorkout ? (
        <Card className="hero" tone="dark" padding="lg">
          <div className="hero-copy">
            <Eyebrow>{activeSession ? "Session in progress" : "Next session"}</Eyebrow>
            <h2>{activeSession?.name ?? nextWorkout?.name}</h2>
            <p>{activeSession ? `${activeSession.totalSets} sets recorded` : nextWorkout?.focus}</p>
            <div className="hero-metrics" aria-label="Workout overview">
              <span>
                <b>{activeSession ? Math.max(1, Math.round(activeSession.durationSeconds / 60)) : nextWorkout?.estimatedMinutes}</b>
                <small>minutes</small>
              </span>
              <span>
                <b>{activeSession?.exercises.length ?? nextWorkout?.exercises.length}</b>
                <small>movements</small>
              </span>
              <span>
                <b>{activeSession?.totalSets ?? nextWorkout?.exercises.reduce((sum, exercise) => sum + exercise.sets, 0)}</b>
                <small>{activeSession ? "sets done" : "work sets"}</small>
              </span>
            </div>
            <Button
              size="lg"
              busy={starting}
              onClick={activeSession ? onResume : () => void start()}
            >
              {activeSession ? "Resume workout" : starting ? "Starting…" : "Start workout"}
            </Button>
            {error && <small className="form-error" role="alert">{error}</small>}
          </div>
          <div className="performance-visual" aria-hidden="true">
            <span className="performance-orbit" />
            <span className="performance-orbit orbit-two" />
            <div className="barbell">
              <i /><i /><b /><i /><i />
            </div>
            <strong>MOVE</strong>
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
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [threadDrawerOpen, setThreadDrawerOpen] = useState(false);
  const [threadNotice, setThreadNotice] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingCoachAttachment[]>([]);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const pendingAttachmentsRef = useRef<PendingCoachAttachment[]>([]);

  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;
  const visibleThreads = useMemo(
    () => sortCoachThreads(threads.filter((thread) => !thread.archived)),
    [threads],
  );
  const archivedThreads = useMemo(
    () => sortCoachThreads(threads.filter((thread) => thread.archived)),
    [threads],
  );
  const templates = [
    {
      tag: "PREP",
      title: "Review today's workout",
      prompt: "Review today's workout and tell me what to prioritize before I begin.",
    },
    {
      tag: "PROGRAM",
      title: "Adjust my plan",
      prompt: "I need to adjust this week's plan around my current schedule and recovery.",
    },
    {
      tag: "RECOVER",
      title: "Recovery check-in",
      prompt: "Help me assess my recovery and decide how hard I should train today.",
    },
    {
      tag: "FUEL",
      title: "Build a nutrition habit",
      prompt: "Help me choose one realistic nutrition habit that supports my current goal.",
    },
  ];

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  useEffect(() => () => {
    pendingAttachmentsRef.current.forEach((attachment) => {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    });
  }, []);

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

  useEffect(() => {
    if (!openMenuId) return;
    function closeMenu(event: PointerEvent) {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest(`[data-thread-menu="${openMenuId}"]`)) {
        setOpenMenuId(null);
      }
    }
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpenMenuId(null);
    }
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openMenuId]);

  useEffect(() => {
    if (!threadDrawerOpen) return;
    function closeDrawer(event: KeyboardEvent) {
      if (event.key === "Escape") setThreadDrawerOpen(false);
    }
    document.addEventListener("keydown", closeDrawer);
    return () => document.removeEventListener("keydown", closeDrawer);
  }, [threadDrawerOpen]);

  function promoteThread(thread: CoachThread) {
    setThreads((current) => sortCoachThreads([
      thread,
      ...current.filter((item) => item.id !== thread.id),
    ]));
  }

  async function openThread(threadId: string) {
    setThreadDrawerOpen(false);
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
    setThreadDrawerOpen(false);
    setActiveThreadId(null);
    setMessages([]);
    setDraft("");
    setError("");
    setEditingMessageId(null);
    setOpenMenuId(null);
    pendingAttachments.forEach((attachment) => {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    });
    setPendingAttachments([]);
  }

  function selectAttachments(files: FileList | null) {
    const selected = Array.from(files ?? []);
    if (!selected.length) return;
    const availableSlots = maxCoachAttachments - pendingAttachments.length;
    const invalidType = selected.find((file) => !coachAttachmentTypes.has(file.type));
    const oversized = selected.find((file) => file.size > maxCoachAttachmentBytes);
    if (invalidType) {
      setError("Attach a JPEG, PNG, WebP, or PDF file.");
      return;
    }
    if (oversized) {
      setError(`${oversized.name} is larger than the 5 MB limit.`);
      return;
    }
    if (availableSlots <= 0) {
      setError("You can attach up to 3 files to one message.");
      return;
    }
    const accepted = selected.slice(0, availableSlots).map((file) => ({
      key: crypto.randomUUID(),
      file,
      previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
    }));
    setPendingAttachments((current) => [...current, ...accepted]);
    setError(selected.length > availableSlots ? "Only the first 3 attachments were added." : "");
  }

  function removePendingAttachment(key: string) {
    setPendingAttachments((current) => current.filter((attachment) => {
      if (attachment.key !== key) return true;
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      return false;
    }));
  }

  async function uploadAttachment(attachment: PendingCoachAttachment) {
    return apiRequest<UploadCoachAttachmentResponse>("/v1/coach/attachments", {
      method: "POST",
      body: JSON.stringify({
        name: attachment.file.name,
        mimeType: attachment.file.type,
        dataBase64: await fileToBase64(attachment.file),
      }),
    });
  }

  async function send(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if ((!message && !pendingAttachments.length) || sending) return;
    setSending(true);
    setError("");
    let optimisticId: string | null = null;
    try {
      const uploads = await Promise.all(pendingAttachments.map(uploadAttachment));
      const attachments = uploads.map((upload) => upload.attachment);
      optimisticId = `pending-${crypto.randomUUID()}`;
      setMessages((current) => [
        ...current,
        {
          id: optimisticId!,
          role: "user",
          content: message,
          attachments,
          safetyCategory: "none",
          createdAt: new Date().toISOString(),
        },
      ]);
      const response = await apiRequest<CoachResponse>("/v1/coach/messages", {
        method: "POST",
        body: JSON.stringify({
          message,
          attachmentIds: attachments.map((attachment) => attachment.id),
          threadId: activeThreadId ?? undefined,
        }),
      });
      setMessages((current) => [
        ...current.filter((item) => item.id !== optimisticId),
        response.userMessage,
        response.message,
      ]);
      setActiveThreadId(response.thread.id);
      promoteThread(response.thread);
      setDraft("");
      pendingAttachments.forEach((attachment) => {
        if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
      });
      setPendingAttachments([]);
    } catch (cause) {
      if (optimisticId) {
        setMessages((current) => current.filter((item) => item.id !== optimisticId));
      }
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
      setOpenMenuId(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to rename this conversation");
    }
  }

  async function updateThread(
    thread: CoachThread,
    changes: UpdateCoachThreadRequest,
  ) {
    setError("");
    setOpenMenuId(null);
    try {
      const response = await apiRequest<CreateCoachThreadResponse>(
        `/v1/coach/threads/${thread.id}`,
        { method: "PATCH", body: JSON.stringify(changes) },
      );
      setThreads((current) => sortCoachThreads(
        current.map((item) => item.id === thread.id ? response.thread : item),
      ));
      return response.thread;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update this conversation");
      return null;
    }
  }

  async function toggleThreadPin(thread: CoachThread) {
    await updateThread(thread, { pinned: !thread.pinned });
  }

  async function toggleThreadArchive(thread: CoachThread) {
    const updated = await updateThread(thread, {
      archived: !thread.archived,
      ...(thread.archived ? {} : { pinned: false }),
    });
    if (!updated?.archived || activeThreadId !== thread.id) return;
    const next = visibleThreads.find((item) => item.id !== thread.id);
    if (next) await openThread(next.id);
    else newChat();
  }

  async function shareThread(thread: CoachThread) {
    setOpenMenuId(null);
    setError("");
    try {
      const threadMessages = activeThreadId === thread.id
        ? messages
        : (await apiRequest<CoachThreadDetail>(`/v1/coach/threads/${thread.id}`)).messages;
      const transcript = [
        thread.title,
        "",
        ...threadMessages.map((message) =>
          `${message.role === "user" ? "You" : "forgefit.space Coach"}: ${message.content}`,
        ),
      ].join("\n");
      if (navigator.share) {
        await navigator.share({ title: thread.title, text: transcript });
        setThreadNotice("Conversation shared.");
      } else {
        await navigator.clipboard.writeText(transcript);
        setThreadNotice("Conversation copied to your clipboard.");
      }
      window.setTimeout(() => setThreadNotice(""), 3_000);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setError(cause instanceof Error ? cause.message : "Unable to share this conversation");
    }
  }

  async function deleteThread(threadId: string) {
    if (!window.confirm("Delete this conversation and all of its messages?")) return;
    setOpenMenuId(null);
    try {
      await apiRequest<void>(`/v1/coach/threads/${threadId}`, { method: "DELETE" });
      const remaining = threads.filter((thread) => thread.id !== threadId);
      setThreads(remaining);
      if (activeThreadId === threadId) {
        const next = remaining.find((thread) => !thread.archived);
        if (next) await openThread(next.id);
        else newChat();
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to delete this conversation");
    }
  }

  function renderThread(thread: CoachThread) {
    const menuOpen = openMenuId === thread.id;
    return (
      <div
        className={thread.id === activeThreadId ? "thread-item active" : "thread-item"}
        key={thread.id}
      >
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
              <span className="thread-title">
                <span>{thread.title}</span>
                {thread.pinned && <ThreadActionIcon name="pin" />}
              </span>
              <small>{thread.messageCount} messages</small>
            </button>
            <div className="thread-actions" data-thread-menu={thread.id}>
              <button
                className="thread-menu-trigger"
                type="button"
                title="Conversation options"
                aria-label={`Options for ${thread.title}`}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setOpenMenuId(menuOpen ? null : thread.id)}
              >
                <ThreadActionIcon name="more" />
              </button>
              {menuOpen && (
                <div className="thread-menu" role="menu" aria-label={`Actions for ${thread.title}`}>
                  <button type="button" role="menuitem" onClick={() => void shareThread(thread)}>
                    <ThreadActionIcon name="share" />
                    <span>Share</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpenMenuId(null);
                      setRenamingId(thread.id);
                      setRenameDraft(thread.title);
                    }}
                  >
                    <ThreadActionIcon name="rename" />
                    <span>Rename</span>
                  </button>
                  {!thread.archived && (
                    <button type="button" role="menuitem" onClick={() => void toggleThreadPin(thread)}>
                      <ThreadActionIcon name="pin" />
                      <span>{thread.pinned ? "Unpin" : "Pin conversation"}</span>
                    </button>
                  )}
                  <button type="button" role="menuitem" onClick={() => void toggleThreadArchive(thread)}>
                    <ThreadActionIcon name="archive" />
                    <span>{thread.archived ? "Restore conversation" : "Archive"}</span>
                  </button>
                  <div className="thread-menu-divider" role="separator" />
                  <button className="danger" type="button" role="menuitem" onClick={() => void deleteThread(thread.id)}>
                    <ThreadActionIcon name="delete" />
                    <span>Delete</span>
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
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
        <button
          className={threadDrawerOpen ? "thread-drawer-backdrop open" : "thread-drawer-backdrop"}
          type="button"
          aria-label="Close conversation history"
          tabIndex={threadDrawerOpen ? 0 : -1}
          onClick={() => setThreadDrawerOpen(false)}
        />
        <aside
          className={threadDrawerOpen ? "thread-panel open" : "thread-panel"}
          id="coach-thread-panel"
          aria-label="Coach conversations"
        >
          <div className="thread-panel-head">
            <div>
              <Eyebrow>Coach log</Eyebrow>
              <strong>Your training conversations</strong>
            </div>
            <div className="thread-panel-controls">
              <Button className="new-chat-button" size="sm" onClick={newChat}>
                <span className="new-chat-icon" aria-hidden="true">+</span>
                New chat
              </Button>
              <button
                className="thread-drawer-close"
                type="button"
                aria-label="Close conversation history"
                onClick={() => setThreadDrawerOpen(false)}
              >
                ×
              </button>
            </div>
          </div>
          {threadNotice && <p className="thread-notice" aria-live="polite">{threadNotice}</p>}
          <div className="thread-list">
            {loadingThreads && <p className="thread-empty">Loading conversations…</p>}
            {!loadingThreads && threads.length === 0 && (
              <p className="thread-empty">Your conversations will appear here.</p>
            )}
            {visibleThreads.map(renderThread)}
            {archivedThreads.length > 0 && (
              <details className="thread-archive">
                <summary>
                  <span>Archived</span>
                  <small>{archivedThreads.length}</small>
                </summary>
                <div className="thread-archive-list">
                  {archivedThreads.map(renderThread)}
                </div>
              </details>
            )}
          </div>
        </aside>
        <Card className="chat" padding="md">
          <header className="chat-header">
            <button
              className="thread-drawer-trigger"
              type="button"
              aria-label="Open conversation history"
              aria-controls="coach-thread-panel"
              aria-expanded={threadDrawerOpen}
              onClick={() => setThreadDrawerOpen(true)}
            >
              <span /><span /><span />
            </button>
            <div className="chat-header-copy">
              <Eyebrow>AI coach · {activeThread ? "Conversation" : "New conversation"}</Eyebrow>
              <strong>{activeThread?.title ?? "What can I help with?"}</strong>
              <span>Account-aware guidance for your training, recovery, and plan.</span>
            </div>
            <div className="chat-header-actions">
              {activeThread && <small>{activeThread.messageCount} messages</small>}
              <button className="chat-new-button" type="button" aria-label="Start a new chat" onClick={newChat}>
                <span aria-hidden="true">＋</span>
              </button>
            </div>
          </header>
          <div className="messages">
            {messages.length === 0 && !loadingThreads && (
              <div className="chat-starter">
                <div className="coach-starter-mark" aria-hidden="true">
                  <span /><span /><b>AI</b>
                </div>
                <Eyebrow>Performance command center</Eyebrow>
                <h2>Build today&apos;s game plan.</h2>
                <p>Choose a training lane or ask your coach anything.</p>
                <div className="prompt-templates">
                  {templates.map((template) => (
                    <button type="button" key={template.title} onClick={() => setDraft(template.prompt)}>
                      <i>{template.tag}</i>
                      <strong>{template.title}</strong>
                      <span>{template.prompt}</span>
                      <b aria-hidden="true">↗</b>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message) => (
              <article className={message.role === "user" ? "mine" : "theirs"} key={message.id}>
                <i>{message.role === "user" ? "YOU" : "✦"}</i>
                <div className="message-body">
                  <MessageAttachments attachments={message.attachments ?? []} />
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
                      {message.content && <p>{message.content}</p>}
                      <footer>
                        {message.editedAt && <small>Edited</small>}
                        {message.role === "user" && message.content && !message.id.startsWith("pending-") && (
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
            {pendingAttachments.length > 0 && (
              <div className="composer-attachments" aria-label="Selected attachments">
                {pendingAttachments.map((attachment) => (
                  <div className="composer-attachment" key={attachment.key}>
                    {attachment.previewUrl ? (
                      <Image src={attachment.previewUrl} alt="" width={42} height={42} unoptimized />
                    ) : (
                      <span className="composer-file-icon"><AttachmentIcon kind="file" /></span>
                    )}
                    <span>
                      <strong>{attachment.file.name}</strong>
                      <small>{formatAttachmentSize(attachment.file.size)}</small>
                    </span>
                    <button
                      className="attachment-remove"
                      type="button"
                      onClick={() => removePendingAttachment(attachment.key)}
                      aria-label={`Remove ${attachment.file.name}`}
                    >
                      <AttachmentIcon kind="remove" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <input
              ref={attachmentInputRef}
              className="ui-visually-hidden"
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              multiple
              onChange={(event) => {
                selectAttachments(event.target.files);
                event.target.value = "";
              }}
            />
            <button
              className="attachment-button"
              type="button"
              disabled={sending || pendingAttachments.length >= maxCoachAttachments}
              onClick={() => attachmentInputRef.current?.click()}
              aria-label="Attach images or PDF"
              title="Attach images or PDF (up to 5 MB)"
            >
              <AttachmentIcon />
            </button>
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
            <button
              className="chat-send-button"
              type="submit"
              disabled={sending || (!draft.trim() && !pendingAttachments.length)}
              aria-label={sending ? "Sending message" : "Send message"}
            >
              {sending ? <span className="send-spinner" /> : <span aria-hidden="true">↑</span>}
            </button>
          </form>
          {error && <small className="form-error" role="alert">{error}</small>}
        </Card>
      </section>
    </div>
  );
}

const trainingTerms = [
  ["Training block", "A multi-week phase built around one primary goal."],
  ["Session", "One scheduled workout on a specific day."],
  ["Movement", "One exercise, such as a squat, lunge, or push-up."],
  ["Sets × reps", "3 × 10–12 means 3 rounds of 10 to 12 repetitions."],
  ["Per side", "Complete the target reps separately on your left and right sides."],
  ["Tempo", "How slowly or quickly to perform each part of a repetition."],
  ["RPE", "Your effort from 1 to 10; 10 means maximum effort."],
  ["Deload", "A planned lighter week that helps your body recover and adapt."],
] as const;

function PlanGuide() {
  return (
    <details className="plan-guide">
      <summary>
        <span className="plan-guide-icon" aria-hidden="true">?</span>
        <span className="plan-guide-heading">
          <strong>How to read your plan</strong>
          <small>A quick guide to sets, reps, tempo, RPE, deloads, and more.</small>
        </span>
        <span className="plan-guide-action">
          View guide
          <b aria-hidden="true">+</b>
        </span>
      </summary>
      <dl className="plan-guide-grid">
        {trainingTerms.map(([term, definition]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{definition}</dd>
          </div>
        ))}
      </dl>
    </details>
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
  const [selectedWeekNumber, setSelectedWeekNumber] = useState(1);
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

  const selectedWeek = weeklyWorkouts.find(
    (week) => week.weekNumber === selectedWeekNumber,
  ) ?? weeklyWorkouts[0];
  const selectedWeekSessions = selectedWeek?.days.flatMap((day) =>
    day.workouts.map((workout) => ({ ...workout, date: day.date })),
  ) ?? [];
  const totalExercises = selectedWeekSessions.reduce(
    (sum, workout) => sum + workout.exercises.length,
    0,
  );

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
    <div className="wrap plan-page">
      {dashboard.activePlan ? (
        <section className="plan-overview" aria-labelledby="plan-title">
          <div className="plan-overview-glow" aria-hidden="true" />
          <div className="plan-overview-copy">
            <div className="plan-kicker">
              <span>Active program</span>
              <b>Version {dashboard.activePlan.version}</b>
            </div>
            <h1 id="plan-title">{dashboard.activePlan.title}</h1>
            <p>{dashboard.activePlan.summary}</p>
          </div>
          <div className="plan-overview-action">
            <span className="plan-version-mark">V{dashboard.activePlan.version}</span>
            <Button className="plan-generate" busy={generating} onClick={() => void generate()}>
              {generating ? "Designing…" : "Build a new version"}
            </Button>
          </div>
          <dl className="plan-metrics">
            <div>
              <dt>Training block</dt>
              <dd>{dashboard.activePlan.durationWeeks} weeks</dd>
            </div>
            <div>
              <dt>Weekly rhythm</dt>
              <dd>{dashboard.activePlan.daysPerWeek} sessions</dd>
            </div>
            <div>
              <dt>Selected week</dt>
              <dd>{totalExercises} movements</dd>
            </div>
          </dl>
        </section>
      ) : (
        <PageHeader
          eyebrow="Training plan"
          title={<>Build your first <em>training block.</em></>}
          description="Generate four weeks of structured sessions around your goal, equipment, and available time."
          actions={
            <Button busy={generating} onClick={() => void generate()}>
              {generating ? "Designing your plan…" : "Generate my plan"}
            </Button>
          }
        />
      )}
      {error && <p className="form-error plan-error" role="alert">{error}</p>}
      {dashboard.activePlan && <PlanGuide />}
      {weeklyWorkouts.length > 0 && selectedWeek && (
        <section className="plan-weeks" aria-label="Workout schedule">
          <nav className="plan-week-tabs" aria-label="Choose training week">
            {weeklyWorkouts.map((week) => {
              const sessionCount = week.days.reduce(
                (sum, day) => sum + day.workouts.length,
                0,
              );
              return (
                <button
                  key={week.weekNumber}
                  type="button"
                  className={week.weekNumber === selectedWeek.weekNumber ? "active" : ""}
                  aria-pressed={week.weekNumber === selectedWeek.weekNumber}
                  onClick={() => setSelectedWeekNumber(week.weekNumber)}
                >
                  <span>0{week.weekNumber}</span>
                  <strong>Week {week.weekNumber}</strong>
                  <small>{sessionCount} sessions</small>
                </button>
              );
            })}
          </nav>

          <section className="plan-week" aria-labelledby={`week-${selectedWeek.weekNumber}`}>
            <header className="plan-week-summary">
              <div>
                <Eyebrow>Week {selectedWeek.weekNumber} focus</Eyebrow>
                <h2 id={`week-${selectedWeek.weekNumber}`}>
                  {formatPlanDateRange(selectedWeek.days)}
                </h2>
              </div>
              <p>
                {dashboard.activePlan?.weeklyProgression[selectedWeek.weekNumber - 1]
                  ?? "Build quality repetitions and keep each movement controlled."}
              </p>
            </header>

            <div className="plan-session-grid">
              {selectedWeekSessions.map((workout, workoutIndex) => {
                const date = new Date(`${workout.date}T12:00:00`);
                return (
                  <Card as="article" key={workout.id} padding="md" className="plan-session-card">
                    <header className="plan-session-head">
                      <time dateTime={workout.date}>
                        <span>{new Intl.DateTimeFormat("en", { weekday: "short" }).format(date)}</span>
                        <strong>{new Intl.DateTimeFormat("en", { day: "2-digit" }).format(date)}</strong>
                        <small>{new Intl.DateTimeFormat("en", { month: "short" }).format(date)}</small>
                      </time>
                      <div>
                        <span className="session-number">Session {String(workoutIndex + 1).padStart(2, "0")}</span>
                        <h3>{workout.name}</h3>
                        <p>{workout.focus}</p>
                      </div>
                      <StatusBadge tone={workout.status === "in_progress" ? "warning" : "neutral"}>
                        {workout.status === "in_progress" ? "In progress" : "Planned"}
                      </StatusBadge>
                    </header>

                    <div className="plan-session-meta" aria-label="Session details">
                      <span><b>{workout.estimatedMinutes}</b> min</span>
                      <span><b>{workout.exercises.length}</b> movements</span>
                      <span><b>{workout.exercises.reduce((sum, exercise) => sum + exercise.sets, 0)}</b> sets</span>
                    </div>

                    <ol className="plan-exercise-list">
                      {workout.exercises.map((exercise, exerciseIndex) => (
                        <li key={exercise.exerciseId}>
                          <span className="exercise-index">{String(exerciseIndex + 1).padStart(2, "0")}</span>
                          <span className="exercise-name">
                            <strong>{exercise.name}</strong>
                            {exercise.video && (
                              <ExerciseVideoButton exerciseName={exercise.name} video={exercise.video} />
                            )}
                          </span>
                          <b>
                            {exercise.sets} × {exercise.repRange}
                            {exercise.loadAdjustmentPercent
                              ? ` · ${exercise.loadAdjustmentPercent > 0 ? "+" : ""}${exercise.loadAdjustmentPercent}%`
                              : ""}
                          </b>
                        </li>
                      ))}
                    </ol>

                    <footer className="plan-session-footer">
                      <small>Rest and tempo guidance appears during your workout.</small>
                      <Button
                        className="session-start"
                        disabled={Boolean(startingId)}
                        onClick={() => void start(workout.id)}
                      >
                        {startingId === workout.id
                          ? "Starting…"
                          : workout.status === "in_progress"
                            ? "Resume workout →"
                            : "Start workout →"}
                      </Button>
                    </footer>
                  </Card>
                );
              })}
            </div>
          </section>
        </section>
      )}
      {weeklyWorkouts.length === 0 && (
        <Card className="empty-state" padding="lg">
          <h2>No plan generated yet.</h2>
          <p>Generate a four-week plan after reviewing your profile information.</p>
        </Card>
      )}
    </div>
  );
}

function formatPlanDateRange(days: { date: string }[]) {
  const firstDate = days[0]?.date;
  const lastDate = days.at(-1)?.date;
  if (!firstDate || !lastDate) return "Schedule pending";
  const formatter = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" });
  return `${formatter.format(new Date(`${firstDate}T12:00:00`))} — ${formatter.format(new Date(`${lastDate}T12:00:00`))}`;
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
      <MovementTracker key={`${session.id}-${session.status}`} session={session} />
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
        <div className="exercise-actions">
          {exercise.video && (
            <ExerciseVideoButton exerciseName={exercise.name} video={exercise.video} />
          )}
          <Button
            variant="ghost"
            size="sm"
            className="substitute"
            disabled={disabled || exercise.sets.length > 0}
            onClick={() => void onSubstitute(exercise.exerciseId)}
          >
            Find substitute
          </Button>
        </div>
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
      <PageHeader eyebrow="Performance history" title={<>Proof of work. <em>Built rep by rep.</em></>} description="Track consistency, effort, and recorded training volume over time." />
      <section className="history">
        <Card className="stats" padding="md">
          <Eyebrow>Lifetime progress</Eyebrow>
          <div><b>{dashboard.progress.completedSessions}</b><small>completed sessions</small></div>
          <div><b>{dashboard.progress.completedSets}</b><small>completed sets</small></div>
          <div><b>{dashboard.progress.totalVolumeKg.toLocaleString()}</b><small>kilograms of recorded volume</small></div>
          <div><b>{dashboard.progress.averageEffort ?? "—"}</b><small>average session RPE</small></div>
        </Card>
        <Card className="session-list" padding="md">
          {dashboard.recentSessions.map((session) => (
            <article key={session.id}>
              <span>
                <b>{session.name}</b>
                <small>{new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(session.startedAt))}</small>
              </span>
              <StatusBadge
                className="session-status"
                tone={session.status === "completed" ? "success" : session.status === "abandoned" ? "danger" : "warning"}
              >
                {session.status}
              </StatusBadge>
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
