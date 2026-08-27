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
  PlanHistoryEntry,
  PlannedWorkout,
  StartWorkoutResponse,
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
import dynamic from "next/dynamic";
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { apiRequest } from "@/lib/api";
import type { LiveMovementSignal } from "@/lib/live-voice";
import {
  collectSpeechTranscript,
  speechRecognitionConstructor,
  speechRecognitionErrorMessage,
  type BrowserSpeechRecognition,
  type SpeechRecognitionConstructor,
} from "@/lib/voice";
import { BrandLockup } from "@/components/BrandLockup";
import { CoachMessageContent } from "@/components/CoachMessageContent";
import coachVoiceStyles from "@/components/CoachVoiceFirst.module.css";
import { ExerciseVideoButton } from "@/components/ExerciseVideo";
import { ReadinessCheckIn } from "@/components/ReadinessCheckIn";
import {
  CoachSkeleton,
  MovementTrackerSkeleton,
  WorkspaceSkeleton,
} from "@/components/LoadingSkeleton";

const MovementTracker = dynamic(
  () => import("@/components/MovementTracker").then((module) => module.MovementTracker),
  { ssr: false, loading: () => <MovementTrackerSkeleton /> },
);

const LiveVoiceCoach = dynamic(
  () => import("@/components/LiveVoiceCoach").then((module) => module.LiveVoiceCoach),
  { ssr: false },
);

const ExerciseLibrary = dynamic(
  () => import("@/components/ExerciseLibrary").then((module) => module.ExerciseLibrary),
  {
    loading: () => (
      <div className="wrap">
        <Card padding="lg">Loading the illustrated exercise library…</Card>
      </div>
    ),
  },
);

type View = "today" | "coach" | "plan" | "library" | "history" | "profile" | "workout";
type CurrentUser = { id: string; name: string; email: string };
type NavIconName = "today" | "coach" | "plan" | "library" | "history";
type PendingCoachAttachment = {
  key: string;
  file: File;
  previewUrl: string | null;
};

const coachAttachmentTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const maxCoachAttachmentBytes = 5 * 1024 * 1024;
const maxCoachAttachments = 3;
type SpeechWindow = typeof window & {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
};

const subscribeToStaticBrowserCapability = () => () => {};

function browserSpeechRecognitionConstructor() {
  if (typeof window === "undefined") return null;
  return speechRecognitionConstructor(window as SpeechWindow);
}

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

function VoiceIcon({ kind = "microphone" }: { kind?: "microphone" | "speaker" }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {kind === "microphone" ? (
        <>
          <rect x="8" y="3" width="8" height="12" rx="4" />
          <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
        </>
      ) : (
        <>
          <path d="M5 9H2v6h3l5 4V5L5 9Z" />
          <path d="M14 9a4 4 0 0 1 0 6M17 6a8 8 0 0 1 0 12" />
        </>
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
    library: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H11v16H6.5A2.5 2.5 0 0 0 4 21.5Z" /><path d="M20 5.5A2.5 2.5 0 0 0 17.5 3H13v16h4.5a2.5 2.5 0 0 1 2.5 2.5Z" /></>,
    history: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  };
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export default function FitAICoach({ user }: { user: CurrentUser }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 10 * 60 * 1_000,
        retry: 1,
        staleTime: 30_000,
      },
    },
  }));

  return (
    <QueryClientProvider client={queryClient}>
      <FitAIWorkspace user={user} />
    </QueryClientProvider>
  );
}

function FitAIWorkspace({ user }: { user: CurrentUser }) {
  const [view, setView] = useState<View>("today");
  const [activeSessionOverride, setActiveSession] = useState<WorkoutSession | null>();
  const queryClient = useQueryClient();
  const dashboardQuery = useQuery({
    queryKey: ["dashboard", user.id],
    queryFn: () => apiRequest<DashboardResponse>("/v1/dashboard"),
  });
  const dashboard = dashboardQuery.data;
  const activeSession = activeSessionOverride === undefined
    ? dashboard?.activeSession ?? null
    : activeSessionOverride;

  async function loadDashboard() {
    const result = await dashboardQuery.refetch();
    if (result.error) throw result.error;
    if (result.data) setActiveSession(result.data.activeSession);
  }

  if (dashboardQuery.isPending) return <WorkspaceSkeleton />;
  if (dashboardQuery.isError && !dashboard) {
    const detail = dashboardQuery.error instanceof Error
      ? dashboardQuery.error.message
      : "Unable to load forgefit.space";
    return (
      <StatusScreen
        title="forgefit.space could not connect"
        detail={detail}
        retry={async () => {
          try {
            await loadDashboard();
          } catch {
            // The query owns and renders the retry error state.
          }
        }}
      />
    );
  }
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
    ["library", "library", "Library"],
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
          <Link className="signout" href="/signout">
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
            onReadinessSaved={(checkIn) => {
              queryClient.setQueryData<DashboardResponse>(["dashboard", user.id], (current) => current
                ? { ...current, latestReadiness: checkIn }
                : current);
            }}
          />
        )}
        {view === "coach" && (
          <Coach
            initialMessages={dashboard.recentMessages}
            activeSessionId={activeSession?.id ?? null}
          />
        )}
        {view === "plan" && (
          <Plan
            dashboard={dashboard}
            activeSession={activeSession}
            refresh={loadDashboard}
            onStart={startWorkout}
            onResume={() => setView("workout")}
          />
        )}
        {view === "history" && <History dashboard={dashboard} />}
        {view === "library" && <ExerciseLibrary embedded />}
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
  const [retrying, setRetrying] = useState(false);

  async function runRetry() {
    if (!retry || retrying) return;
    setRetrying(true);
    try {
      await retry();
    } finally {
      setRetrying(false);
    }
  }

  return (
    <main className="auth-shell">
      <Card className="auth-card" padding="lg">
        <BrandLockup />
        <h1>{title}</h1>
        {detail && <p>{detail}</p>}
        {retry && (
          <Button busy={retrying} onClick={() => void runRetry()}>
            {retrying ? "Reconnecting…" : "Try again"}
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
          dietaryPreference: form.get("dietaryPreference"),
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
      <Field
        label="Food preference"
        hint="Used only to personalize nutrition suggestions. You can change this anytime."
      >
        <select name="dietaryPreference" defaultValue={profile?.dietaryPreference ?? "no_preference"}>
          <option value="no_preference">No preference / not specified</option>
          <option value="vegetarian">Vegetarian</option>
          <option value="non_vegetarian">Non-vegetarian</option>
          <option value="eggetarian">Eggetarian</option>
          <option value="vegan">Vegan</option>
        </select>
      </Field>
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
        <Field
          label="Minutes per session"
          hint="Advanced bodybuilding plans work best with 60–120 minutes when your recovery and schedule allow it."
        >
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
          dietaryPreference: form.get("dietaryPreference"),
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
  onReadinessSaved,
}: {
  dashboard: DashboardResponse;
  activeSession: WorkoutSession | null;
  onStart: (workoutId: string) => Promise<void>;
  onResume: () => void;
  onReadinessSaved: (checkIn: NonNullable<DashboardResponse["latestReadiness"]>) => void;
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
      <ReadinessCheckIn latest={dashboard.latestReadiness} onSaved={onReadinessSaved} />
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

function Coach({
  initialMessages,
  activeSessionId,
}: {
  initialMessages: CoachMessage[];
  activeSessionId: string | null;
}) {
  const [activeThread, setActiveThread] = useState<CoachThread | null>(null);
  const [messages, setMessages] = useState(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [error, setError] = useState("");
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<PendingCoachAttachment[]>([]);
  const [voiceStatus, setVoiceStatus] = useState<
    "idle" | "starting" | "listening" | "processing"
  >("idle");
  const [voiceError, setVoiceError] = useState("");
  const [liveVoiceOpen, setLiveVoiceOpen] = useState(false);
  const attachmentInputRef = useRef<HTMLInputElement>(null);
  const messagesRef = useRef<HTMLDivElement>(null);
  const pendingAttachmentsRef = useRef<PendingCoachAttachment[]>([]);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const voiceBaseDraftRef = useRef("");
  const voiceSupported = useSyncExternalStore(
    subscribeToStaticBrowserCapability,
    () => Boolean(browserSpeechRecognitionConstructor()),
    () => false,
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

  function selectTemplate(prompt: string) {
    setDraft(prompt);
    setShowSuggestions(false);
  }

  useEffect(() => {
    pendingAttachmentsRef.current = pendingAttachments;
  }, [pendingAttachments]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const messageList = messagesRef.current;
      if (messageList) messageList.scrollTop = messageList.scrollHeight;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeThread?.id, loadingThreads, messages.length]);

  useEffect(() => () => {
    pendingAttachmentsRef.current.forEach((attachment) => {
      if (attachment.previewUrl) URL.revokeObjectURL(attachment.previewUrl);
    });
  }, []);

  useEffect(() => {
    const stopForBackground = () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
      setVoiceStatus("idle");
    };
    const stopWhenHidden = () => {
      if (document.visibilityState === "hidden") stopForBackground();
    };
    window.addEventListener("blur", stopForBackground);
    document.addEventListener("visibilitychange", stopWhenHidden);
    return () => {
      window.removeEventListener("blur", stopForBackground);
      document.removeEventListener("visibilitychange", stopWhenHidden);
      stopForBackground();
    };
  }, []);

  function startVoiceInput() {
    if (sending || recognitionRef.current) return;
    const Recognition = browserSpeechRecognitionConstructor();
    if (!Recognition) {
      setVoiceError("Voice input is not supported in this browser. You can keep typing instead.");
      return;
    }

    setVoiceError("");
    voiceBaseDraftRef.current = draft.trim();
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";
    recognition.onstart = () => setVoiceStatus("listening");
    recognition.onresult = (event) => {
      const { combinedTranscript } = collectSpeechTranscript(event);
      setDraft(
        [voiceBaseDraftRef.current, combinedTranscript]
          .filter(Boolean)
          .join(" "),
      );
    };
    recognition.onerror = (event) => {
      setVoiceError(speechRecognitionErrorMessage(event.error));
    };
    recognition.onend = () => {
      if (recognitionRef.current === recognition) recognitionRef.current = null;
      setVoiceStatus("idle");
    };
    recognitionRef.current = recognition;
    setVoiceStatus("starting");
    try {
      recognition.start();
    } catch {
      recognitionRef.current = null;
      setVoiceStatus("idle");
      setVoiceError("Voice input could not start. Try again or type your message.");
    }
  }

  function stopVoiceInput() {
    const recognition = recognitionRef.current;
    if (!recognition) return;
    setVoiceStatus("processing");
    try {
      recognition.stop();
    } catch {
      recognition.abort();
      recognitionRef.current = null;
      setVoiceStatus("idle");
    }
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const response = await apiRequest<CoachThreadListResponse>("/v1/coach/threads");
        if (!active) return;
        const existing = response.threads.find((thread) => !thread.archived);
        if (existing) {
          const detail = await apiRequest<CoachThreadDetail>(`/v1/coach/threads/${existing.id}`);
          if (!active) return;
          setActiveThread(detail.thread);
          setMessages(detail.messages);
          return;
        }
        const created = await apiRequest<CreateCoachThreadResponse>("/v1/coach/threads", {
          method: "POST",
          body: JSON.stringify({ title: "Coach" }),
        });
        if (!active) return;
        setActiveThread(created.thread);
        setMessages([]);
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load your coach");
      } finally {
        if (active) setLoadingThreads(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

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
    stopVoiceInput();
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
          threadId: activeThread?.id,
          sessionId: activeSessionId ?? undefined,
        }),
      });
      setMessages((current) => [
        ...current.filter((item) => item.id !== optimisticId),
        response.userMessage,
        response.message,
      ]);
      setActiveThread(response.thread);
      setDraft("");
      setShowSuggestions(false);
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
      setActiveThread(detail.thread);
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
        <Card className="chat" padding="md">
          <header className="chat-header">
            <div className="chat-header-copy">
              <strong>Your AI coach</strong>
              <span>Voice first, with your profile and conversation in context.</span>
            </div>
            <div className="chat-header-actions">
              {activeThread && <small>{activeThread.messageCount} messages</small>}
              {activeThread && liveVoiceOpen && (
                <LiveVoiceCoach
                  threadId={activeThread.id}
                  activeSessionId={activeSessionId}
                  onClose={() => setLiveVoiceOpen(false)}
                  onThreadUpdate={(detail) => {
                    setActiveThread(detail.thread);
                    setMessages(detail.messages);
                  }}
                />
              )}
            </div>
          </header>
          {activeThread && (
            <section className={`${coachVoiceStyles.voiceEntry} coach-voice-entry`} aria-label="Live voice coach">
              <button
                className={coachVoiceStyles.voiceButton}
                type="button"
                onClick={() => setLiveVoiceOpen(true)}
                aria-haspopup="dialog"
              >
                <span className={`${coachVoiceStyles.voiceIcon} coach-voice-entry-icon`} aria-hidden="true">
                  <span className="live-voice-wave"><i /><i /><i /></span>
                </span>
                <span className={`${coachVoiceStyles.voiceCopy} coach-voice-entry-copy`}>
                  <small>REAL-TIME COACH</small>
                  <strong>Talk to your coach</strong>
                  <span>Natural conversation · remembers your plan</span>
                </span>
                <span className={`${coachVoiceStyles.voiceAction} coach-voice-entry-action`} aria-hidden="true">Start →</span>
              </button>
            </section>
          )}
          <div className="messages" ref={messagesRef}>
            {loadingThreads && (
              <>
                <CoachSkeleton />
                <span className="ui-visually-hidden" role="status">Loading your coach…</span>
              </>
            )}
            {messages.length === 0 && !loadingThreads && (
              <div className="chat-starter">
                <div className="coach-starter-mark" aria-hidden="true">
                  <span /><span /><b>AI</b>
                </div>
                <h2>Prefer to type?</h2>
                <p>Text chat stays synced with your live coach.</p>
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
                      {message.content && (
                        message.role === "assistant"
                          ? <CoachMessageContent content={message.content} />
                          : <p>{message.content}</p>
                      )}
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
          {messages.length === 0 && !loadingThreads && (
            <div className="coach-suggestions" aria-label="Suggested coach prompts">
              {templates.map((template) => (
                <button type="button" key={template.title} onClick={() => selectTemplate(template.prompt)}>
                  {template.title}
                </button>
              ))}
            </div>
          )}
          {messages.length > 0 && showSuggestions && (
            <div className="coach-suggestions active-coach-suggestions" id="composer-suggestions" aria-label="Suggested coach prompts">
              {templates.map((template) => (
                <button type="button" key={template.title} onClick={() => selectTemplate(template.prompt)}>
                  {template.title}
                </button>
              ))}
            </div>
          )}
          <form className={`chat-composer ${coachVoiceStyles.composer}`} onSubmit={send}>
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
            <div className={`composer-main ${coachVoiceStyles.main}`}>
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
                placeholder="Type a message…"
              />
              <button
                className="chat-send-button"
                type="submit"
                disabled={sending || (!draft.trim() && !pendingAttachments.length)}
                aria-label={sending ? "Sending message" : "Send message"}
              >
                {sending ? <span className="send-spinner" /> : <span aria-hidden="true">↑</span>}
              </button>
            </div>
            <div className={`composer-tools ${coachVoiceStyles.tools}`} aria-label="Message tools">
              {messages.length > 0 && (
                <button
                  className={`prompt-toggle-button ${coachVoiceStyles.tool}`}
                  type="button"
                  aria-controls="composer-suggestions"
                  aria-expanded={showSuggestions}
                  onClick={() => setShowSuggestions((visible) => !visible)}
                >
                  <span aria-hidden="true">✦</span>
                  <span>Ideas</span>
                </button>
              )}
              <button
                className={`attachment-button ${coachVoiceStyles.tool}`}
                type="button"
                disabled={sending || pendingAttachments.length >= maxCoachAttachments}
                onClick={() => attachmentInputRef.current?.click()}
                aria-label="Attach images or PDF"
                title="Attach images or PDF (up to 5 MB)"
              >
                <AttachmentIcon />
                <span>Attach</span>
              </button>
              <button
                className={`attachment-button voice-input-button ${coachVoiceStyles.tool} ${coachVoiceStyles.dictate}`}
                type="button"
                disabled={sending || !voiceSupported}
                aria-label={
                  voiceSupported
                    ? voiceStatus !== "idle"
                      ? "Release to stop dictation"
                      : "Hold to dictate"
                    : "Voice input is not supported in this browser"
                }
                aria-pressed={voiceStatus !== "idle"}
                title={voiceSupported ? "Hold to dictate" : "Voice input is not supported in this browser"}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  event.currentTarget.setPointerCapture(event.pointerId);
                  startVoiceInput();
                }}
                onPointerUp={(event) => {
                  event.preventDefault();
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) {
                    event.currentTarget.releasePointerCapture(event.pointerId);
                  }
                  stopVoiceInput();
                }}
                onPointerCancel={() => stopVoiceInput()}
                onKeyDown={(event) => {
                  if ((event.key === " " || event.key === "Enter") && !event.repeat) {
                    event.preventDefault();
                    startVoiceInput();
                  }
                }}
                onKeyUp={(event) => {
                  if (event.key === " " || event.key === "Enter") {
                    event.preventDefault();
                    stopVoiceInput();
                  }
                }}
                onClick={(event) => event.preventDefault()}
              >
                <VoiceIcon />
                <span>Dictate</span>
              </button>
            </div>
          </form>
          <div
            className={`voice-experience-status${voiceStatus === "idle" ? "" : " is-active"}`}
            aria-live="polite"
          >
            {voiceStatus === "starting" ? (
              <small>Waiting for microphone permission…</small>
            ) : voiceStatus === "listening" ? (
              <small><i /> Listening only while you hold the microphone button…</small>
            ) : voiceStatus === "processing" ? (
              <small>Finishing transcription…</small>
            ) : (
              <small className="ui-visually-hidden">
                Voice input uses your browser&apos;s speech service. Text input is always available.
              </small>
            )}
          </div>
          {voiceError && <small className="form-error voice-error" role="alert">{voiceError}</small>}
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
          <strong>Plan terms</strong>
          <small>Sets, reps, tempo, RPE and deloads explained.</small>
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

function PlanVersionCard({
  entry,
  label,
}: {
  entry: PlanHistoryEntry;
  label: string;
}) {
  const level = entry.plan.experienceLevel
    ? `${entry.plan.experienceLevel.charAt(0).toUpperCase()}${entry.plan.experienceLevel.slice(1)}`
    : "Legacy";
  return (
    <article className="plan-version-card">
      <header>
        <span>{label}</span>
        <b>V{entry.plan.version}</b>
      </header>
      <h3>{entry.plan.title}</h3>
      <p>{level} · {entry.plan.daysPerWeek} days/week</p>
      <dl>
        <div><dt>Avg. session</dt><dd>{entry.averageSessionMinutes} min</dd></div>
        <div><dt>Movements</dt><dd>{entry.averageMovementsPerSession}/session</dd></div>
        <div><dt>Working sets</dt><dd>{entry.weeklyWorkingSets}/week</dd></div>
        <div><dt>Completion</dt><dd>{entry.completionRate}%</dd></div>
        <div><dt>Logged volume</dt><dd>{Math.round(entry.totalVolumeKg).toLocaleString()} kg</dd></div>
        <div><dt>Avg. effort</dt><dd>{entry.averageEffort ?? "—"}</dd></div>
      </dl>
    </article>
  );
}

function PlanHistory({
  history,
  activePlanId,
  compareId,
  restoringId,
  optimizing,
  hasActiveWorkout,
  onCompare,
  onRestore,
  onOptimize,
}: {
  history: PlanHistoryEntry[];
  activePlanId: string;
  compareId: string;
  restoringId: string;
  optimizing: boolean;
  hasActiveWorkout: boolean;
  onCompare: (planId: string) => void;
  onRestore: (planId: string) => Promise<void>;
  onOptimize: () => Promise<void>;
}) {
  const current = history.find((entry) => entry.plan.id === activePlanId) ?? history[0];
  const archived = history.filter((entry) => entry.plan.id !== current?.plan.id);
  const comparison = archived.find((entry) => entry.plan.id === compareId) ?? archived[0];
  if (!current) return null;

  return (
    <section className="plan-history" aria-labelledby="plan-history-title">
      <header className="plan-history-header">
        <div>
          <Eyebrow>Plan evolution</Eyebrow>
          <h2 id="plan-history-title">Version history</h2>
          <p>Compare training load and adherence, restore an older structure, or generate a new optimized version.</p>
        </div>
        <Button
          variant="secondary"
          busy={optimizing}
          disabled={hasActiveWorkout}
          onClick={() => void onOptimize()}
        >
          {optimizing ? "Optimizing…" : "Optimize current"}
        </Button>
      </header>

      {comparison ? (
        <div className="plan-history-comparison" aria-label="Plan version comparison">
          <PlanVersionCard entry={current} label="Current" />
          <span className="plan-history-versus" aria-hidden="true">VS</span>
          <PlanVersionCard entry={comparison} label="Compare" />
        </div>
      ) : (
        <p className="plan-history-first">Your next generated plan will appear here for comparison.</p>
      )}

      <div className="plan-history-list">
        {history.map((entry) => {
          const isActive = entry.plan.id === activePlanId;
          return (
            <article className={isActive ? "is-active" : ""} key={entry.plan.id}>
              <div className="plan-history-version">
                <b>V{entry.plan.version}</b>
                <span>{isActive ? "Active" : "Archived"}</span>
              </div>
              <div className="plan-history-copy">
                <strong>{entry.plan.title}</strong>
                <small>
                  {new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(entry.plan.createdAt))}
                  {entry.plan.restoredFromVersion ? ` · restored from V${entry.plan.restoredFromVersion}` : ""}
                </small>
              </div>
              <div className="plan-history-quick-metrics">
                <span><b>{entry.averageMovementsPerSession}</b> movements</span>
                <span><b>{entry.averageSetsPerSession}</b> sets/session</span>
                <span><b>{entry.completionRate}%</b> complete</span>
              </div>
              <div className="plan-history-actions">
                {!isActive && (
                  <Button size="sm" variant="ghost" onClick={() => onCompare(entry.plan.id)}>
                    Compare
                  </Button>
                )}
                {!isActive && (
                  <Button
                    size="sm"
                    variant="secondary"
                    busy={restoringId === entry.plan.id}
                    disabled={Boolean(restoringId) || hasActiveWorkout}
                    onClick={() => void onRestore(entry.plan.id)}
                  >
                    {restoringId === entry.plan.id ? "Restoring…" : "Restore as new"}
                  </Button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <small className="plan-history-guidance">
        Prefer the plan you can complete consistently; more planned volume is not automatically better.
      </small>
      {hasActiveWorkout && (
        <small className="plan-history-note">Finish or abandon the active workout before changing plan versions.</small>
      )}
    </section>
  );
}

function Plan({
  dashboard,
  activeSession,
  refresh,
  onStart,
  onResume,
}: {
  dashboard: DashboardResponse;
  activeSession: WorkoutSession | null;
  refresh: () => Promise<void>;
  onStart: (workoutId: string) => Promise<void>;
  onResume: () => void;
}) {
  const [generating, setGenerating] = useState(false);
  const [startingId, setStartingId] = useState("");
  const [restoringId, setRestoringId] = useState("");
  const [comparePlanId, setComparePlanId] = useState("");
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
  const primarySession = selectedWeekSessions.find((workout) => workout.status === "in_progress")
    ?? selectedWeekSessions[0];
  const laterSessions = selectedWeekSessions.filter((workout) => workout.id !== primarySession?.id);
  const profileLevel = dashboard.profile?.experienceLevel ?? "beginner";
  const profileLevelLabel = `${profileLevel.charAt(0).toUpperCase()}${profileLevel.slice(1)}`;
  const planNeedsRefresh = Boolean(
    dashboard.activePlan && dashboard.activePlan.experienceLevel !== profileLevel,
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
    if (activeSession) {
      setError("");
      onResume();
      return;
    }
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

  async function restore(planId: string) {
    setRestoringId(planId);
    setError("");
    try {
      await apiRequest<GeneratePlanResponse>(`/v1/plans/${planId}/restore`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setSelectedWeekNumber(1);
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to restore this plan version");
    } finally {
      setRestoringId("");
    }
  }

  return (
    <div className="wrap plan-page">
      {dashboard.activePlan ? (
        <section className="plan-overview" aria-labelledby="plan-title">
          <div className="plan-overview-copy">
            <div className="plan-kicker">
              <span>Active program</span>
              <b>Version {dashboard.activePlan.version}</b>
              <b>{profileLevelLabel} profile</b>
            </div>
            <h1 id="plan-title">{dashboard.activePlan.title}</h1>
            <p>{dashboard.activePlan.summary}</p>
            {planNeedsRefresh && (
              <p className="plan-profile-warning" role="status">
                This saved plan predates your current {profileLevelLabel.toLowerCase()} profile.
                Rebuild it to apply the correct split, session length, and volume.
              </p>
            )}
          </div>
          <div className="plan-overview-action">
            <Button className="plan-generate" busy={generating} onClick={() => void generate()}>
              {generating
                ? "Updating…"
                : planNeedsRefresh
                  ? `Build ${profileLevelLabel.toLowerCase()} plan`
                  : "Update plan"}
            </Button>
          </div>
          <div className="plan-overview-meta" aria-label="Program summary">
            <span><b>{dashboard.activePlan.durationWeeks}</b> week block</span>
            <span><b>{dashboard.activePlan.daysPerWeek}</b> sessions per week</span>
            {dashboard.profile && (
              <span><b>{dashboard.profile.preferredSessionMinutes}</b> min target</span>
            )}
            <span><b>{totalExercises}</b> movements this week</span>
          </div>
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
      {activeSession && (
        <Card className="plan-active-session" tone="accent" padding="md">
          <div>
            <Eyebrow>Workout in progress</Eyebrow>
            <strong>{activeSession.name}</strong>
            <small>
              {activeSession.totalSets} sets recorded · resume this workout before starting another session.
            </small>
          </div>
          <Button onClick={() => { setError(""); onResume(); }}>
            Resume workout
          </Button>
        </Card>
      )}
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
                  <span>W{week.weekNumber}</span>
                  <strong>{week.weekNumber === selectedWeek.weekNumber ? "Current view" : `Week ${week.weekNumber}`}</strong>
                  <small>{sessionCount} sessions</small>
                </button>
              );
            })}
          </nav>

          <section className="plan-week" aria-labelledby={`week-${selectedWeek.weekNumber}`}>
            <header className="plan-week-summary">
              <div>
                <Eyebrow>Week {selectedWeek.weekNumber}</Eyebrow>
                <h2 id={`week-${selectedWeek.weekNumber}`}>
                  {formatPlanDateRange(selectedWeek.days)}
                </h2>
              </div>
              <p>
                {dashboard.activePlan?.weeklyProgression[selectedWeek.weekNumber - 1]
                  ?? "Build quality repetitions and keep each movement controlled."}
              </p>
            </header>

            {primarySession && (() => {
              const date = new Date(`${primarySession.date}T12:00:00`);
              return (
                <Card as="article" padding="md" className="plan-primary-session">
                  <header className="plan-session-head">
                    <time dateTime={primarySession.date}>
                      <span>{new Intl.DateTimeFormat("en", { weekday: "short" }).format(date)}</span>
                      <strong>{new Intl.DateTimeFormat("en", { day: "2-digit" }).format(date)}</strong>
                      <small>{new Intl.DateTimeFormat("en", { month: "short" }).format(date)}</small>
                    </time>
                    <div>
                      <span className="session-number">
                        {primarySession.status === "in_progress" ? "Workout in progress" : "Up next"}
                      </span>
                      <h3>{primarySession.name}</h3>
                      <p>{primarySession.focus}</p>
                    </div>
                  </header>

                  <div className="plan-session-meta" aria-label="Session details">
                    <span><b>{primarySession.estimatedMinutes}</b> min</span>
                    <span><b>{primarySession.exercises.length}</b> movements</span>
                    <span><b>{primarySession.exercises.reduce((sum, exercise) => sum + exercise.sets, 0)}</b> sets</span>
                  </div>

                  <ol className="plan-exercise-list">
                    {primarySession.exercises.map((exercise, exerciseIndex) => (
                      <li key={exercise.exerciseId}>
                        <span className="exercise-index">{String(exerciseIndex + 1).padStart(2, "0")}</span>
                        <span className="exercise-name">
                          <strong>{exercise.name}</strong>
                          {exercise.video && <ExerciseVideoButton exerciseName={exercise.name} video={exercise.video} preview />}
                        </span>
                        <b>{exercise.sets} × {exercise.repRange}</b>
                      </li>
                    ))}
                  </ol>

                  <footer className="plan-session-footer">
                    <small>Rest, tempo and logging open inside the workout.</small>
                    <Button
                      className="session-start"
                      disabled={Boolean(startingId)}
                      busy={!activeSession && startingId === primarySession.id}
                      onClick={() => void start(primarySession.id)}
                    >
                      {activeSession
                        ? activeSession.plannedWorkoutId === primarySession.id
                          ? "Resume workout →"
                          : "Resume current workout →"
                        : startingId === primarySession.id
                          ? "Starting…"
                          : primarySession.status === "in_progress"
                            ? "Resume workout →"
                            : "Start workout →"}
                    </Button>
                  </footer>
                </Card>
              );
            })()}

            {laterSessions.length > 0 && (
              <section className="plan-later" aria-labelledby="later-this-week">
                <header>
                  <h3 id="later-this-week">Later this week</h3>
                  <span>{laterSessions.length} more {laterSessions.length === 1 ? "session" : "sessions"}</span>
                </header>
                <div className="plan-later-list">
                  {laterSessions.map((workout) => {
                    const date = new Date(`${workout.date}T12:00:00`);
                    return (
                      <details className="plan-session-row" key={workout.id}>
                        <summary>
                          <time dateTime={workout.date}>
                            <span>{new Intl.DateTimeFormat("en", { weekday: "short" }).format(date)}</span>
                            <strong>{new Intl.DateTimeFormat("en", { day: "2-digit" }).format(date)}</strong>
                          </time>
                          <span className="plan-session-row-copy">
                            <strong>{workout.name}</strong>
                            <small>{workout.focus}</small>
                          </span>
                          <span className="plan-session-row-meta">
                            {workout.estimatedMinutes} min · {workout.exercises.length} movements
                          </span>
                          <b className="plan-session-row-toggle" aria-hidden="true">+</b>
                        </summary>
                        <div className="plan-session-row-detail">
                          <ol className="plan-exercise-list">
                            {workout.exercises.map((exercise, exerciseIndex) => (
                              <li key={exercise.exerciseId}>
                                <span className="exercise-index">{String(exerciseIndex + 1).padStart(2, "0")}</span>
                                <span className="exercise-name">
                                  <strong>{exercise.name}</strong>
                                  {exercise.video && <ExerciseVideoButton exerciseName={exercise.name} video={exercise.video} />}
                                </span>
                                <b>{exercise.sets} × {exercise.repRange}</b>
                              </li>
                            ))}
                          </ol>
                          <Button
                            className="session-start"
                            disabled={Boolean(startingId)}
                            busy={!activeSession && startingId === workout.id}
                            onClick={() => void start(workout.id)}
                          >
                            {activeSession ? "Resume current workout →" : startingId === workout.id ? "Starting…" : "Start this workout →"}
                          </Button>
                        </div>
                      </details>
                    );
                  })}
                </div>
              </section>
            )}
          </section>
        </section>
      )}
      {dashboard.activePlan && (
        <PlanHistory
          history={dashboard.planHistory ?? []}
          activePlanId={dashboard.activePlan.id}
          compareId={comparePlanId}
          restoringId={restoringId}
          optimizing={generating}
          hasActiveWorkout={Boolean(activeSession)}
          onCompare={setComparePlanId}
          onRestore={restore}
          onOptimize={generate}
        />
      )}
      {dashboard.activePlan && <PlanGuide />}
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
  const [workingAction, setWorkingAction] = useState("");
  const [error, setError] = useState("");
  const [reflection, setReflection] = useState(session.reflection);
  const [perceivedEffort, setPerceivedEffort] = useState(7);
  const [liveVoiceOpen, setLiveVoiceOpen] = useState(false);
  const [voiceThread, setVoiceThread] = useState<CoachThread | null>(null);
  const [openingVoice, setOpeningVoice] = useState(false);
  const [movementSignal, setMovementSignal] = useState<LiveMovementSignal | null>(null);

  async function openLiveCoach() {
    if (voiceThread) {
      setLiveVoiceOpen(true);
      return;
    }
    setOpeningVoice(true);
    setError("");
    try {
      const response = await apiRequest<CoachThreadListResponse>("/v1/coach/threads");
      const existing = response.threads.find((thread) => !thread.archived);
      if (existing) {
        setVoiceThread(existing);
      } else {
        const created = await apiRequest<CreateCoachThreadResponse>("/v1/coach/threads", {
          method: "POST",
          body: JSON.stringify({ title: "Coach" }),
        });
        setVoiceThread(created.thread);
      }
      setLiveVoiceOpen(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to open the live coach");
    } finally {
      setOpeningVoice(false);
    }
  }

  async function update(action: string, path: string, init: RequestInit) {
    setWorkingAction(action);
    setError("");
    try {
      const response = await apiRequest<WorkoutSessionResponse>(path, init);
      onSession(response.session);
      return response.session;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Workout update failed");
      return null;
    } finally {
      setWorkingAction("");
    }
  }

  async function changeStatus() {
    await update("status", `/v1/workout-sessions/${session.id}/status`, {
      method: "PATCH",
      body: JSON.stringify({ action: session.status === "paused" ? "resume" : "pause" }),
    });
  }

  async function logSet(
    exerciseId: string,
    input: { reps: number; loadKg: number; effortRpe: number },
  ) {
    await update(`log-${exerciseId}`, `/v1/workout-sessions/${session.id}/sets`, {
      method: "POST",
      body: JSON.stringify({ exerciseId, ...input }),
    });
  }

  async function substitute(exerciseId: string) {
    await update(`substitute-${exerciseId}`, `/v1/workout-sessions/${session.id}/substitutions`, {
      method: "POST",
      body: JSON.stringify({ exerciseId }),
    });
  }

  async function finish() {
    const result = await update("finish", `/v1/workout-sessions/${session.id}/finish`, {
      method: "POST",
      body: JSON.stringify({ reflection, perceivedEffort }),
    });
    if (result) await onClose();
  }

  async function abandon() {
    if (!window.confirm("Abandon this workout? It will be recorded as skipped.")) return;
    const result = await update("abandon", `/v1/workout-sessions/${session.id}/abandon`, {
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
          <div className="workout-live-actions">
            <Button
              variant="secondary"
              busy={openingVoice}
              disabled={openingVoice}
              onClick={() => void openLiveCoach()}
            >
              {openingVoice ? "Opening coach…" : "Live coach"}
            </Button>
            <Button variant="secondary" busy={workingAction === "status"} disabled={Boolean(workingAction)} onClick={() => void changeStatus()}>
              {workingAction === "status" ? "Updating…" : session.status === "paused" ? "Resume workout" : "Pause workout"}
            </Button>
          </div>
        }
      />
      {liveVoiceOpen && voiceThread && (
        <LiveVoiceCoach
          threadId={voiceThread.id}
          activeSessionId={session.id}
          movementSignal={movementSignal}
          onClose={() => setLiveVoiceOpen(false)}
          onThreadUpdate={(detail) => setVoiceThread(detail.thread)}
        />
      )}
      {session.status === "paused" && (
        <section className="pause-banner">Workout paused. Resume it before recording another set.</section>
      )}
      {error && <p className="form-error plan-error" role="alert">{error}</p>}
      <MovementTracker
        key={`${session.id}-${session.status}`}
        session={session}
        onLiveMovement={setMovementSignal}
      />
      <section className="workout-exercises">
        {session.exercises.map((exercise) => (
          <ExerciseLogger
            key={exercise.exerciseId}
            exercise={exercise}
            disabled={Boolean(workingAction) || session.status !== "active"}
            workingAction={workingAction}
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
          <Button variant="danger" busy={workingAction === "abandon"} disabled={Boolean(workingAction)} onClick={() => void abandon()}>
            {workingAction === "abandon" ? "Closing…" : "Abandon workout"}
          </Button>
          <Button busy={workingAction === "finish"} disabled={Boolean(workingAction) || session.totalSets === 0} onClick={() => void finish()}>
            {workingAction === "finish" ? "Saving…" : "Finish workout →"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function ExerciseLogger({
  exercise,
  disabled,
  workingAction,
  onLog,
  onSubstitute,
}: {
  exercise: WorkoutSession["exercises"][number];
  disabled: boolean;
  workingAction: string;
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
            busy={workingAction === `substitute-${exercise.exerciseId}`}
            onClick={() => void onSubstitute(exercise.exerciseId)}
          >
            {workingAction === `substitute-${exercise.exerciseId}` ? "Finding…" : "Find substitute"}
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
          busy={workingAction === `log-${exercise.exerciseId}`}
          onClick={() => void onLog(exercise.exerciseId, { reps, loadKg, effortRpe })}
        >
          {workingAction === `log-${exercise.exerciseId}` ? "Logging…" : "Log set"}
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
