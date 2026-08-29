"use client";

import type {
  CoachAttachment,
  CoachMessage,
  CoachResponse,
  CoachThread,
  CoachThreadDetail,
  CoachThreadListResponse,
  CreateCoachThreadResponse,
  ConfirmPlanAdjustmentResponse,
  DashboardResponse,
  GeneratePlanRequest,
  GeneratePlanResponse,
  PlanHistoryEntry,
  PendingPlanAdjustmentResponse,
  PlanAdjustmentProposal,
  PlannedWorkout,
  ProviderSettingsResponse,
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
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CSSProperties,
  FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { ApiRequestError, apiRequest } from "@/lib/api";
import { mostRecentActiveCoachThread } from "@/lib/coach-threads";
import type { LiveMovementSignal } from "@/lib/live-voice";
import type { LiveCoachActivity } from "@/components/LiveVoiceCoach";
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

function LiveVoiceCoachLoadingShell() {
  return (
    <section
      className="coach-voice-home coach-voice-home-live live-voice-panel live-voice-inline is-connecting is-visual-only live-voice-loading-shell"
      aria-label="Opening live coaching"
    >
      <div className="coach-voice-home-copy">
        <span className="coach-voice-home-status"><i aria-hidden="true" /> OPENING LIVE COACH</span>
        <h1>Your coach is ready to <em>talk.</em></h1>
        <p>Have a natural, real-time conversation about today’s workout, recovery, form, or plan.</p>
        <ul className="coach-voice-home-context" aria-label="Live coach capabilities">
          <li><i aria-hidden="true">✓</i><span><b>Remembers you</b>Your profile, goals, and coaching history.</span></li>
          <li><i aria-hidden="true">✓</i><span><b>Workout aware</b>Your active session stays in context.</span></li>
          <li><i aria-hidden="true">✓</i><span><b>Visual feedback</b>Optional on-device movement tracking.</span></li>
        </ul>
        <button className="coach-voice-home-action" type="button" disabled>
          <span className="coach-voice-home-action-icon" aria-hidden="true">
            <span className="live-voice-wave"><i /><i /><i /></span>
          </span>
          <span>
            <strong>Opening your live coach…</strong>
            <small>Your conversation stays right where it is</small>
          </span>
          <b aria-hidden="true">•••</b>
        </button>
        <small className="coach-voice-home-privacy">Connecting securely to your private live session.</small>
      </div>
      <div className="coach-voice-home-visual" aria-hidden="true">
        <span className="coach-voice-home-orbit"><i /><i /></span>
        <Image
          className="coach-voice-home-avatar"
          src="/coach/forge-coach-avatar.webp"
          alt=""
          width={682}
          height={1024}
          priority
          sizes="(max-width: 900px) 55vw, 34vw"
        />
        <span className="coach-voice-home-listening"><i /> Connecting</span>
      </div>
    </section>
  );
}

const LiveVoiceCoach = dynamic(
  () => import("@/components/LiveVoiceCoach").then((module) => module.LiveVoiceCoach),
  { ssr: false, loading: () => <LiveVoiceCoachLoadingShell /> },
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
  return <FitAIWorkspace user={user} />;
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
    ["history", "history", "Progress"],
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
        {view === "history" && (
          <History
            dashboard={dashboard}
            hasActiveWorkout={Boolean(activeSession)}
            onCoach={() => setView("coach")}
            onTrain={() => setView(activeSession ? "workout" : "today")}
          />
        )}
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
            onBack={() => setView("plan")}
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
          trainingPhase: form.get("trainingPhase"),
          programDurationWeeks: Number(form.get("programDurationWeeks")),
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
  const initialLevel = profile?.experienceLevel ?? "beginner";
  const recommendedDuration = (level: UserProfile["experienceLevel"]): 4 | 8 | 12 => {
    if (level === "advanced") return 12;
    if (level === "intermediate") return 8;
    return 4;
  };
  const [experienceLevel, setExperienceLevel] = useState(initialLevel);
  const [programDurationWeeks, setProgramDurationWeeks] = useState<4 | 8 | 12>(
    profile?.programDurationWeeks ?? recommendedDuration(initialLevel),
  );
  return (
    <>
      <div className="form-row">
        <Field label="Experience level">
          <select
            name="experienceLevel"
            value={experienceLevel}
            onChange={(event) => {
              const nextLevel = event.target.value as UserProfile["experienceLevel"];
              setExperienceLevel(nextLevel);
              setProgramDurationWeeks(recommendedDuration(nextLevel));
            }}
          >
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
      <div className="form-row">
        <Field
          label="Training phase"
          hint="This changes exercise selection, volume, progression, and recovery—not just the plan title."
        >
          <select name="trainingPhase" defaultValue={profile?.trainingPhase ?? "general"}>
            <option value="bulk">Lean bulk / build muscle</option>
            <option value="cut">Cut / fat loss</option>
            <option value="recomposition">Body recomposition</option>
            <option value="general">General performance</option>
          </select>
        </Field>
        <Field
          label="Program length"
          hint="Advanced athletes typically need multiple mesocycles instead of one short block."
        >
          <select
            name="programDurationWeeks"
            value={programDurationWeeks}
            onChange={(event) => setProgramDurationWeeks(Number(event.target.value) as 4 | 8 | 12)}
          >
            <option value={4}>4 weeks · foundation</option>
            <option value={8}>8 weeks · progressive</option>
            <option value={12}>12 weeks · periodized</option>
          </select>
        </Field>
      </div>
      <Field label="Available equipment" hint="Separate multiple items with commas. Use “commercial gym” when you have full gym access.">
        <input
          name="equipment"
          defaultValue={profile?.equipment.join(", ") ?? ""}
          placeholder="Commercial gym, or dumbbells, bench, cable"
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
          trainingPhase: form.get("trainingPhase"),
          programDurationWeeks: Number(form.get("programDurationWeeks")),
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
      <ProviderConfiguration />
    </div>
  );
}

function ProviderConfiguration() {
  const [settings, setSettings] = useState<ProviderSettingsResponse | null>(null);
  const [aiKey, setAIKey] = useState("");
  const [aiProvider, setAIProvider] = useState<ProviderSettingsResponse["ai"]["provider"]>("gemini");
  const [aiModel, setAIModel] = useState("");
  const [aiBaseUrl, setAIBaseUrl] = useState("");
  const [elevenLabsKey, setElevenLabsKey] = useState("");
  const [elevenLabsModel, setElevenLabsModel] = useState("");
  const [agentId, setAgentId] = useState("");
  const [voiceId, setVoiceId] = useState("");
  const [saving, setSaving] = useState<"ai" | "elevenlabs" | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function applySettings(next: ProviderSettingsResponse) {
    setSettings(next);
    setAIProvider(next.ai.provider);
    setAIModel(next.ai.model);
    setAIBaseUrl(next.ai.baseUrl ?? "");
    setElevenLabsModel(next.elevenlabs.model);
    setAgentId(next.elevenlabs.agentId ?? "");
    setVoiceId(next.elevenlabs.voiceId ?? "");
  }

  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<ProviderSettingsResponse>("/v1/provider-settings", {
      signal: controller.signal,
    }).then(applySettings).catch((cause) => {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : "Unable to load provider settings");
      }
    });
    return () => controller.abort();
  }, []);

  async function saveProvider(provider: "ai" | "elevenlabs") {
    setSaving(provider);
    setError("");
    setMessage("");
    try {
      const body = provider === "ai"
        ? {
            ai: {
              provider: aiProvider,
              ...(aiKey.trim() ? { apiKey: aiKey.trim() } : {}),
              model: aiModel.trim(),
              baseUrl: aiBaseUrl.trim() || null,
            },
          }
        : {
            elevenlabs: {
              ...(elevenLabsKey.trim() ? { apiKey: elevenLabsKey.trim() } : {}),
              model: elevenLabsModel.trim(),
              agentId: agentId.trim(),
              voiceId: voiceId.trim(),
            },
          };
      const next = await apiRequest<ProviderSettingsResponse>("/v1/provider-settings", {
        method: "PUT",
        body: JSON.stringify(body),
      });
      applySettings(next);
      setAIKey("");
      setElevenLabsKey("");
      setMessage(`${provider === "ai" ? "AI model" : "ElevenLabs"} configuration saved securely.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save provider settings");
    } finally {
      setSaving(null);
    }
  }

  async function resetToPlatformProvider(provider: "ai" | "elevenlabs") {
    setSaving(provider);
    setError("");
    setMessage("");
    try {
      const next = await apiRequest<ProviderSettingsResponse>(`/v1/provider-settings/${provider}`, {
        method: "DELETE",
      });
      applySettings(next);
      setMessage(`Using ForgeFit's ${provider === "ai" ? "default AI model" : "ElevenLabs configuration"}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to reset provider settings");
    } finally {
      setSaving(null);
    }
  }

  const storageEnabled = settings?.secureStorageAvailable !== false;
  const aiProviderChanged = Boolean(settings && aiProvider !== settings.ai.provider);
  const aiConfigurationIncomplete = !aiKey.trim()
    && (settings?.ai.source !== "user" || aiProviderChanged);
  const compatibleBaseUrlMissing = aiProvider === "openai_compatible" && !aiBaseUrl.trim();
  return (
    <section className="provider-configuration" aria-labelledby="provider-configuration-title">
      <div className="provider-configuration-heading">
        <div>
          <Eyebrow>AI configuration</Eyebrow>
          <h2 id="provider-configuration-title">Bring your own provider keys</h2>
        </div>
        <p>Saved keys are encrypted on the server and are never returned to this browser.</p>
      </div>
      {!settings && !error && <p className="provider-configuration-status">Loading provider configuration…</p>}
      {settings && !settings.secureStorageAvailable && (
        <p className="form-error" role="alert">
          Secure key storage is not enabled on this deployment. Set USER_PROVIDER_CREDENTIALS_KEY on the backend first.
        </p>
      )}
      <div className="provider-configuration-grid">
        <form onSubmit={(event) => { event.preventDefault(); void saveProvider("ai"); }}>
          <header>
            <div><strong>AI model</strong><small>Chat, files, plans, and camera analysis</small></div>
            <span>{settings?.ai.source === "user" ? `Custom ${settings.ai.keyHint}` : "ForgeFit default"}</span>
          </header>
          <Field label="Provider">
            <select value={aiProvider} onChange={(event) => setAIProvider(event.target.value as ProviderSettingsResponse["ai"]["provider"])} disabled={!storageEnabled}>
              <option value="gemini">Google Gemini</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic Claude</option>
              <option value="openai_compatible">OpenAI-compatible / local</option>
            </select>
          </Field>
          <Field label="API key" hint={aiProviderChanged ? "A new key is required when changing providers." : "Leave blank to keep the currently configured key."}>
            <input
              type="password"
              autoComplete="new-password"
              value={aiKey}
              onChange={(event) => setAIKey(event.target.value)}
              placeholder={settings?.ai.keyHint ?? "Provider API key"}
              disabled={!storageEnabled}
            />
          </Field>
          <Field label="Model">
            <input value={aiModel} onChange={(event) => setAIModel(event.target.value)} disabled={!storageEnabled} />
          </Field>
          <Field label="Base URL" hint={aiProvider === "openai_compatible" ? "Required for a local or compatible server." : "Optional provider override."}>
            <input type="url" value={aiBaseUrl} onChange={(event) => setAIBaseUrl(event.target.value)} placeholder={aiProvider === "openai_compatible" ? "http://localhost:11434/v1" : "Use provider default"} disabled={!storageEnabled} />
          </Field>
          <div className="provider-configuration-actions">
            <Button type="submit" busy={saving === "ai"} disabled={!storageEnabled || !settings || aiConfigurationIncomplete || compatibleBaseUrlMissing}>Save AI provider</Button>
            {settings?.ai.source === "user" && (
              <button type="button" onClick={() => void resetToPlatformProvider("ai")}>Use ForgeFit provider</button>
            )}
          </div>
        </form>
        <form onSubmit={(event) => { event.preventDefault(); void saveProvider("elevenlabs"); }}>
          <header>
            <div><strong>ElevenLabs</strong><small>Natural live coach voice</small></div>
            <span>{settings?.elevenlabs.source === "user" ? `Custom ${settings.elevenlabs.keyHint}` : "ForgeFit default"}</span>
          </header>
          <Field label="ElevenLabs API key" hint="Leave blank to keep the currently configured key.">
            <input
              type="password"
              autoComplete="new-password"
              value={elevenLabsKey}
              onChange={(event) => setElevenLabsKey(event.target.value)}
              placeholder={settings?.elevenlabs.keyHint ?? "sk_…"}
              disabled={!storageEnabled}
            />
          </Field>
          <div className="provider-configuration-pair">
            <Field label="Agent ID" hint="Optional; ForgeFit can provision one.">
              <input value={agentId} onChange={(event) => setAgentId(event.target.value)} disabled={!storageEnabled} />
            </Field>
            <Field label="Voice ID" hint="Optional custom voice.">
              <input value={voiceId} onChange={(event) => setVoiceId(event.target.value)} disabled={!storageEnabled} />
            </Field>
          </div>
          <Field label="Agent LLM model">
            <input value={elevenLabsModel} onChange={(event) => setElevenLabsModel(event.target.value)} disabled={!storageEnabled} />
          </Field>
          <div className="provider-configuration-actions">
            <Button type="submit" busy={saving === "elevenlabs"} disabled={!storageEnabled || !settings || (!elevenLabsKey.trim() && settings.elevenlabs.source !== "user")}>Save ElevenLabs</Button>
            {settings?.elevenlabs.source === "user" && (
              <button type="button" onClick={() => void resetToPlatformProvider("elevenlabs")}>Use ForgeFit key</button>
            )}
          </div>
        </form>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {message && <p className="provider-configuration-status" role="status">{message}</p>}
    </section>
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
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const sessionsThisWeek = dashboard.completedSessionDates.filter((value) => {
    const completedAt = new Date(value);
    return Number.isFinite(completedAt.getTime()) && completedAt >= startOfWeek;
  }).length;
  const workoutExercises = activeSession
    ? activeSession.exercises.map((exercise) => ({
        name: exercise.name,
        sets: exercise.prescribedSets,
        reps: exercise.repRange,
      }))
    : nextWorkout?.exercises.map((exercise) => ({
        name: exercise.name,
        sets: exercise.sets,
        reps: exercise.repRange,
      })) ?? [];
  const totalSets = activeSession?.totalSets
    ?? nextWorkout?.exercises.reduce((sum, exercise) => sum + exercise.sets, 0)
    ?? 0;
  const nextWorkoutDate = nextWorkout ? new Date(nextWorkout.scheduledFor) : null;
  const isWorkoutToday = nextWorkoutDate
    ? localDateKey(nextWorkoutDate) === localDateKey(today)
    : false;
  const scheduledLabel = nextWorkoutDate
    ? new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" })
        .format(nextWorkoutDate)
    : null;

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
    <div className="wrap today-page">
      <header className="today-heading">
        <div>
          <Eyebrow>{new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric" }).format(today)}</Eyebrow>
          <h1>{activeSession ? "Pick up where you left off." : isWorkoutToday ? "Today’s session." : "Your next session."}</h1>
          <p>{activeSession ? "Your progress is saved and ready." : "A clear plan for your next focused hour."}</p>
        </div>
        <div className="today-week-chip" aria-label={`${sessionsThisWeek} workouts completed this week`}>
          <span>THIS WEEK</span>
          <strong>{sessionsThisWeek}</strong>
          <small>{sessionsThisWeek === 1 ? "workout" : "workouts"} done</small>
        </div>
      </header>

      <div className="today-primary-grid">
      {activeSession || nextWorkout ? (
        <Card className="today-session-card" tone="dark" padding="lg">
          <div className="today-session-topline">
            <span className={`today-session-status${activeSession ? " is-live" : ""}`}>
              <i /> {activeSession ? "In progress" : "Up next"}
            </span>
            <span>{activeSession ? "Progress saved" : scheduledLabel}</span>
          </div>
          <div className="today-session-copy">
            <Eyebrow>{activeSession ? "Continue session" : isWorkoutToday ? "Today’s workout" : "Next workout"}</Eyebrow>
            <h2>{activeSession?.name ?? nextWorkout?.name}</h2>
            <p>{activeSession ? `${activeSession.totalSets} sets completed so far` : nextWorkout?.focus}</p>
          </div>
          <div className="today-session-metrics" aria-label="Workout overview">
            <span>
              <b>{activeSession ? Math.max(1, Math.round(activeSession.durationSeconds / 60)) : nextWorkout?.estimatedMinutes}</b>
              <small>min</small>
            </span>
            <span>
              <b>{workoutExercises.length}</b>
              <small>moves</small>
            </span>
            <span>
              <b>{totalSets}</b>
              <small>{activeSession ? "sets done" : "work sets"}</small>
            </span>
          </div>
          <div className="today-exercise-preview">
            <div className="today-section-label">
              <span>{activeSession ? "Session movements" : "First up"}</span>
              <small>{workoutExercises.length} total</small>
            </div>
            <ol>
              {workoutExercises.slice(0, 3).map((exercise, index) => (
                <li key={`${exercise.name}-${index}`}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <strong>{exercise.name}</strong>
                  <small>{exercise.sets} × {exercise.reps}</small>
                </li>
              ))}
            </ol>
          </div>
          <div className="today-session-action">
            <Button
              size="lg"
              busy={starting}
              onClick={activeSession ? onResume : () => void start()}
            >
              {activeSession ? "Resume workout" : starting ? "Starting…" : "Start workout"}
            </Button>
            <small>{activeSession ? "Continue exactly where you stopped" : "Your progress saves automatically"}</small>
            {error && <small className="form-error" role="alert">{error}</small>}
          </div>
        </Card>
      ) : (
        <Card className="empty-state today-session-card" padding="lg">
          <Eyebrow>No active workout</Eyebrow>
          <h2>Your profile is ready.</h2>
          <p>Generate your first adaptive plan to see the next workout here.</p>
        </Card>
      )}
        <aside className="today-side-stack">
          <ReadinessCheckIn latest={dashboard.latestReadiness} onSaved={onReadinessSaved} />
          <Card className="today-progress-card" padding="md">
            <div className="today-section-label">
              <span>All-time progress</span>
              <small>Keep showing up</small>
            </div>
            <dl>
              <div><dt>Sessions</dt><dd>{dashboard.progress.completedSessions}</dd></div>
              <div><dt>Sets</dt><dd>{dashboard.progress.completedSets}</dd></div>
              <div><dt>Volume</dt><dd>{Math.round(dashboard.progress.totalVolumeKg).toLocaleString()} <small>kg</small></dd></div>
            </dl>
          </Card>
        </aside>
      </div>
      <ActivityCalendar completedSessionDates={dashboard.completedSessionDates} />
    </div>
  );
}

function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function ActivityCalendar({ completedSessionDates }: { completedSessionDates: string[] }) {
  const now = new Date();
  const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const [visibleMonth, setVisibleMonth] = useState(currentMonth);
  const sessionsByDay = useMemo(() => {
    const counts = new Map<string, number>();
    for (const value of completedSessionDates) {
      const completedAt = new Date(value);
      if (Number.isNaN(completedAt.getTime())) continue;
      const key = localDateKey(completedAt);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    return counts;
  }, [completedSessionDates]);
  const activityTimestamps = completedSessionDates
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite);
  const earliestActivity = activityTimestamps.length > 0
    ? new Date(Math.min(...activityTimestamps))
    : currentMonth;
  const earliestMonthTime = new Date(
    earliestActivity.getFullYear(),
    earliestActivity.getMonth(),
    1,
  ).getTime();
  const firstWeekday = (visibleMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(
    visibleMonth.getFullYear(),
    visibleMonth.getMonth() + 1,
    0,
  ).getDate();
  const days = Array.from({ length: firstWeekday + daysInMonth }, (_, index) => {
    if (index < firstWeekday) return null;
    return new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), index - firstWeekday + 1);
  });
  while (days.length % 7 !== 0) days.push(null);

  const visibleActivity = days.reduce(
    (summary, date) => {
      if (!date) return summary;
      const count = sessionsByDay.get(localDateKey(date)) ?? 0;
      if (count > 0) summary.activeDays += 1;
      summary.sessions += count;
      return summary;
    },
    { activeDays: 0, sessions: 0 },
  );
  const canGoPrevious = visibleMonth.getTime() > earliestMonthTime;
  const canGoNext = visibleMonth.getTime() < currentMonth.getTime();
  const monthLabel = new Intl.DateTimeFormat("en", { month: "long", year: "numeric" }).format(visibleMonth);
  const fullDateFormatter = new Intl.DateTimeFormat("en", { dateStyle: "full" });
  const todayKey = localDateKey(now);

  function changeMonth(offset: number) {
    setVisibleMonth((month) => new Date(month.getFullYear(), month.getMonth() + offset, 1));
  }

  return (
    <section className="activity-calendar" aria-labelledby="activity-calendar-title">
      <header className="activity-calendar-header">
        <div>
          <Eyebrow>Training consistency</Eyebrow>
          <h2 id="activity-calendar-title">Activity calendar</h2>
          <p>Completed workouts light up each active day.</p>
        </div>
        <div className="activity-calendar-summary" aria-label={`${visibleActivity.activeDays} active days and ${visibleActivity.sessions} sessions this month`}>
          <span><b>{visibleActivity.activeDays}</b> active days</span>
          <span><b>{visibleActivity.sessions}</b> sessions</span>
        </div>
      </header>
      <div className="activity-calendar-toolbar">
        <strong aria-live="polite">{monthLabel}</strong>
        <div>
          <button
            aria-label="Show previous month"
            disabled={!canGoPrevious}
            onClick={() => changeMonth(-1)}
            type="button"
          >
            ←
          </button>
          <button
            aria-label="Show next month"
            disabled={!canGoNext}
            onClick={() => changeMonth(1)}
            type="button"
          >
            →
          </button>
        </div>
      </div>
      <div className="activity-calendar-grid" role="group" aria-label={monthLabel}>
        {(["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const).map((day) => (
          <span className="activity-calendar-weekday" key={day}>{day}</span>
        ))}
        {days.map((date, index) => {
          if (!date) return <span aria-hidden="true" className="activity-calendar-day is-empty" key={`empty-${index}`} />;
          const key = localDateKey(date);
          const count = sessionsByDay.get(key) ?? 0;
          const sessionLabel = count === 1 ? "1 session" : `${count} sessions`;
          return (
            <time
              aria-label={`${fullDateFormatter.format(date)}; ${sessionLabel}`}
              className={`activity-calendar-day${count > 0 ? " is-active" : ""}${key === todayKey ? " is-today" : ""}`}
              dateTime={key}
              key={key}
            >
              <span>{date.getDate()}</span>
              {count > 0 && <b>{count}<small>{count === 1 ? " session" : " sessions"}</small></b>}
            </time>
          );
        })}
      </div>
      {completedSessionDates.length === 0 && (
        <p className="activity-calendar-empty">Finish your first workout to start your activity streak.</p>
      )}
    </section>
  );
}

function Coach({
  activeSessionId,
}: {
  activeSessionId: string | null;
}) {
  const [activeThread, setActiveThread] = useState<CoachThread | null>(null);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
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
  const [liveCoachActivity, setLiveCoachActivity] = useState<LiveCoachActivity | null>(null);
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
  }, [
    activeThread?.id,
    liveCoachActivity?.coachCaption,
    liveCoachActivity?.userCaption,
    liveVoiceOpen,
    loadingThreads,
    messages.length,
  ]);

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
        const existing = mostRecentActiveCoachThread(response.threads, "general");
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
        threadId: activeThread?.id,
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
      <section className={`coach-workspace coach-voice-first-workspace${liveVoiceOpen ? " has-live-coach" : ""}`}>
        {activeThread && liveVoiceOpen ? (
          <LiveVoiceCoach
            threadId={activeThread.id}
            activeSessionId={activeSessionId}
            autoStart
            visualOnly
            onActivityChange={setLiveCoachActivity}
            onClose={() => {
              setLiveVoiceOpen(false);
              setLiveCoachActivity(null);
            }}
            onThreadUpdate={(detail) => {
              setActiveThread(detail.thread);
              setMessages(detail.messages);
            }}
          />
        ) : (
        <section className="coach-voice-home" aria-labelledby="coach-voice-home-title">
          <div className="coach-voice-home-copy">
            <span className="coach-voice-home-status"><i aria-hidden="true" /> YOUR COACH IS ONLINE</span>
            <h1 id="coach-voice-home-title">Your coach is ready to <em>talk.</em></h1>
            <p>Have a natural, real-time conversation about today’s workout, recovery, form, or plan.</p>
            <ul className="coach-voice-home-context" aria-label="Live coach capabilities">
              <li><i aria-hidden="true">✓</i><span><b>Remembers you</b>Your profile, goals, and coaching history.</span></li>
              <li><i aria-hidden="true">✓</i><span><b>Workout aware</b>Your active session stays in context.</span></li>
              <li><i aria-hidden="true">✓</i><span><b>Visual feedback</b>Optional on-device movement tracking.</span></li>
            </ul>
            <button
              className="coach-voice-home-action"
              type="button"
              onClick={() => setLiveVoiceOpen(true)}
              disabled={!activeThread}
              aria-expanded={liveVoiceOpen}
            >
              <span className="coach-voice-home-action-icon" aria-hidden="true">
                <span className="live-voice-wave"><i /><i /><i /></span>
              </span>
              <span>
                <strong>{loadingThreads ? "Getting your coach ready…" : "Start voice coaching"}</strong>
                <small>Tap to begin a private live session</small>
              </span>
              <b aria-hidden="true">→</b>
            </button>
            <small className="coach-voice-home-privacy">Microphone and camera stay off until you start.</small>
          </div>
          <div className="coach-voice-home-visual" aria-hidden="true">
            <span className="coach-voice-home-orbit"><i /><i /></span>
            <Image
              className="coach-voice-home-avatar"
              src="/coach/forge-coach-avatar.webp"
              alt=""
              width={682}
              height={1024}
              priority
              sizes="(max-width: 900px) 55vw, 34vw"
            />
            <span className="coach-voice-home-listening"><i /> Ready when you are</span>
          </div>
        </section>
        )}
        <Card className={`chat coach-chat-side${liveVoiceOpen ? " is-live-chat" : ""}`} id="coach-text-chat" padding="md">
          <header className="chat-header">
            <div className="chat-header-copy">
              <small>{liveVoiceOpen ? "LIVE CHAT" : "TEXT CHAT"}</small>
              <strong>{liveVoiceOpen ? "Live conversation" : "Conversation"}</strong>
              <span>{liveCoachActivity?.label ?? "Synced with your live coach."}</span>
            </div>
            <div className="chat-header-actions">
              {liveVoiceOpen ? (
                <button
                  className="live-chat-end"
                  type="button"
                  onClick={() => {
                    setLiveVoiceOpen(false);
                    setLiveCoachActivity(null);
                  }}
                >
                  End live coaching
                </button>
              ) : activeThread && <small>{activeThread.messageCount} messages</small>}
            </div>
          </header>
          <div className="messages" ref={messagesRef}>
            {loadingThreads && (
              <>
                <CoachSkeleton />
                <span className="ui-visually-hidden" role="status">Loading your coach…</span>
              </>
            )}
            {messages.length === 0 && !loadingThreads && !liveVoiceOpen && (
              <div className="chat-starter">
                <div className="coach-starter-mark" aria-hidden="true">
                  <span /><span /><b>FF</b>
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
            {liveCoachActivity?.userCaption && (
              <article className="mine live-transcript-message" aria-live="polite">
                <i>YOU</i>
                <div className="message-body"><p>{liveCoachActivity.userCaption}</p><small>Live transcript</small></div>
              </article>
            )}
            {liveCoachActivity?.coachCaption && (
              <article className="theirs live-transcript-message" aria-live="polite">
                <i>✦</i>
                <div className="message-body"><p>{liveCoachActivity.coachCaption}</p><small>Coach speaking live</small></div>
              </article>
            )}
            {liveVoiceOpen && !liveCoachActivity?.userCaption && !liveCoachActivity?.coachCaption && (
              <div className="live-chat-listening" role="status">
                <i aria-hidden="true" />
                <span>{liveCoachActivity?.error || liveCoachActivity?.label || "Starting live coaching…"}</span>
              </div>
            )}
          </div>
          {messages.length === 0 && !loadingThreads && !liveVoiceOpen && (
            <div className="coach-suggestions" aria-label="Suggested coach prompts">
              {templates.map((template) => (
                <button type="button" key={template.title} onClick={() => selectTemplate(template.prompt)}>
                  {template.title}
                </button>
              ))}
            </div>
          )}
          {messages.length > 0 && showSuggestions && !liveVoiceOpen && (
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
              <label className="ui-visually-hidden" htmlFor="coach-message">Message your coach</label>
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
          {liveVoiceOpen && (
            <div className="live-chat-footer" role="status">
              <span className="live-voice-wave" aria-hidden="true"><i /><i /><i /></span>
              <span>
                {liveCoachActivity?.isPaused
                  ? "Conversation paused. Resume whenever you want to continue."
                  : "Speak naturally. Your live conversation is saved here automatically."}
              </span>
            </div>
          )}
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
  const phase = entry.plan.trainingPhase
    ? entry.plan.trainingPhase === "bulk"
      ? "Lean bulk"
      : entry.plan.trainingPhase === "cut"
        ? "Cut"
        : `${entry.plan.trainingPhase.charAt(0).toUpperCase()}${entry.plan.trainingPhase.slice(1)}`
    : "Unspecified phase";
  return (
    <article className="plan-version-card">
      <header>
        <span>{label}</span>
        <b>V{entry.plan.version}</b>
      </header>
      <h3>{entry.plan.title}</h3>
      <p>{level} · {phase} · {entry.plan.durationWeeks} weeks · {entry.plan.daysPerWeek} days/week</p>
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
  restoringId,
  hasActiveWorkout,
  onRestore,
}: {
  history: PlanHistoryEntry[];
  activePlanId: string;
  restoringId: string;
  hasActiveWorkout: boolean;
  onRestore: (planId: string) => Promise<void>;
}) {
  const current = history.find((entry) => entry.plan.id === activePlanId) ?? history[0];
  const archived = history.filter((entry) => entry.plan.id !== current?.plan.id);
  if (!current) return null;

  return (
    <details className="plan-history">
      <summary className="plan-history-summary">
        <span className="plan-history-summary-icon" aria-hidden="true">↺</span>
        <span className="plan-history-summary-copy">
          <strong>Previous plans</strong>
          <small>{archived.length === 0 ? "No previous versions yet" : `${archived.length} saved ${archived.length === 1 ? "version" : "versions"}`}</small>
        </span>
        <span className="plan-history-summary-action">
          Manage
          <b aria-hidden="true">+</b>
        </span>
      </summary>

      <div className="plan-history-body">
        <header className="plan-history-header">
          <div>
            <Eyebrow>Only if you need it</Eyebrow>
            <h2 id="plan-history-title">Version history</h2>
            <p>Your current plan is already active. Open a previous version only when you want to inspect or restore it.</p>
          </div>
        </header>

        {archived.length > 0 ? (
          <div className="plan-history-list">
            {archived.map((entry) => (
              <details className="plan-history-item" key={entry.plan.id}>
                <summary>
                  <span className="plan-history-version">
                    <b>V{entry.plan.version}</b>
                  </span>
                  <span className="plan-history-copy">
                    <strong>{entry.plan.title}</strong>
                    <small>
                      Saved {new Intl.DateTimeFormat("en", { day: "numeric", month: "short", year: "numeric" }).format(new Date(entry.plan.createdAt))}
                    </small>
                  </span>
                  <span className="plan-history-row-action">View details <b aria-hidden="true">+</b></span>
                </summary>
                <div className="plan-history-comparison" aria-label="Compare previous plan details with your current plan">
                  <PlanVersionCard entry={entry} label="Previous plan" />
                  <div className="plan-history-decision">
                    <strong>Want to use this plan again?</strong>
                    <p>Restoring creates a new copy. Your current history stays unchanged.</p>
                    <Button
                      size="sm"
                      variant="secondary"
                      busy={restoringId === entry.plan.id}
                      disabled={Boolean(restoringId) || hasActiveWorkout}
                      onClick={() => void onRestore(entry.plan.id)}
                    >
                      {restoringId === entry.plan.id ? "Restoring…" : "Restore as new"}
                    </Button>
                  </div>
                </div>
              </details>
            ))}
          </div>
        ) : (
          <p className="plan-history-first">When you update your plan, the previous version will be saved here.</p>
        )}
        {hasActiveWorkout && (
          <small className="plan-history-note">Finish or abandon the active workout before changing plans.</small>
        )}
      </div>
    </details>
  );
}

function PlanCoachPanel({
  planId,
  planTitle,
  weekNumber,
  workoutId,
  activeSessionId,
  refresh,
}: {
  planId: string;
  planTitle: string;
  weekNumber: number;
  workoutId?: string;
  activeSessionId?: string;
  refresh: () => Promise<void>;
}) {
  const [thread, setThread] = useState<CoachThread | null>(null);
  const [messages, setMessages] = useState<CoachMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [proposal, setProposal] = useState<PlanAdjustmentProposal | null>(null);
  const [proposalAction, setProposalAction] = useState<"confirm" | "reject" | "">("");
  const visibleMessages = messages.slice(-6);

  useEffect(() => {
    let active = true;
    async function loadPlanCoach() {
      try {
        const [response, pending] = await Promise.all([
          apiRequest<CoachThreadListResponse>("/v1/coach/threads"),
          apiRequest<PendingPlanAdjustmentResponse>(`/v1/plan-adjustments/pending?planId=${encodeURIComponent(planId)}`),
        ]);
        if (active) setProposal(pending.proposal);
        const existing = mostRecentActiveCoachThread(response.threads, "plan");
        if (existing) {
          const detail = await apiRequest<CoachThreadDetail>(`/v1/coach/threads/${existing.id}`);
          if (!active) return;
          setThread(detail.thread);
          setMessages(detail.messages);
        } else {
          const created = await apiRequest<CreateCoachThreadResponse>("/v1/coach/threads", {
            method: "POST",
            body: JSON.stringify({ title: "Plan workspace", scope: "plan" }),
          });
          if (!active) return;
          setThread(created.thread);
        }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : "Unable to load your coach");
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadPlanCoach();
    return () => { active = false; };
  }, [planId]);

  async function sendPlanMessage(event: FormEvent) {
    event.preventDefault();
    const message = draft.trim();
    if (!message || sending) return;
    setSending(true);
    setError("");
    try {
      const response = await apiRequest<CoachResponse>("/v1/coach/messages", {
        method: "POST",
        body: JSON.stringify({
          message,
          threadId: thread?.id,
          sessionId: activeSessionId,
          planId,
          weekNumber,
          workoutId,
        }),
      });
      setThread(response.thread);
      setMessages((current) => [...current, response.userMessage, response.message]);
      if (response.planAdjustmentProposal) setProposal(response.planAdjustmentProposal);
      setDraft("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Your coach could not respond");
    } finally {
      setSending(false);
    }
  }

  async function resolveProposal(action: "confirm" | "reject") {
    if (!proposal || proposal.status !== "pending" || proposalAction) return;
    setProposalAction(action);
    setError("");
    setNotice("");
    try {
      if (action === "confirm") {
        const response = await apiRequest<ConfirmPlanAdjustmentResponse>(
          `/v1/plan-adjustments/${proposal.id}/confirm`,
          { method: "POST" },
        );
        setProposal(response.proposal);
        setNotice("Saved plan updated. The weekly schedule now reflects these dates.");
        await refresh();
      } else {
        const response = await apiRequest<{ proposal: PlanAdjustmentProposal }>(
          `/v1/plan-adjustments/${proposal.id}/reject`,
          { method: "POST" },
        );
        setProposal(response.proposal);
        setNotice("No changes were made to your saved plan.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to update this plan change");
    } finally {
      setProposalAction("");
    }
  }

  return (
    <aside className="plan-coach-panel" id="plan-coach-panel" aria-labelledby="plan-coach-title">
      <header>
        <span className="plan-coach-mark" aria-hidden="true">✦</span>
        <div>
          <Eyebrow>Plan-aware AI coach</Eyebrow>
          <h2 id="plan-coach-title">Plan this with me</h2>
        </div>
        <span className="plan-coach-context"><i /> Week {weekNumber} linked</span>
      </header>
      <p className="plan-coach-intro">
        I can see <strong>{planTitle}</strong>, this week&apos;s workouts, your profile, readiness, and training history.
      </p>
      <div className="plan-coach-prompts" aria-label="Plan coaching prompts">
        {["Review this week", "Fit this around my schedule", "Adjust volume or exercises"].map((prompt) => (
          <button key={prompt} type="button" onClick={() => setDraft(prompt)}>{prompt}</button>
        ))}
      </div>
      <div className="plan-coach-conversation" aria-live="polite">
        {loading ? (
          <p>Connecting to your coach…</p>
        ) : visibleMessages.length === 0 ? (
          <div className="plan-coach-empty">
            <strong>What needs to change?</strong>
            <p>Share your schedule, recovery, equipment, exercise preferences, or concerns.</p>
          </div>
        ) : (
          visibleMessages.map((message) => (
            <article className={message.role === "user" ? "is-user" : "is-coach"} key={message.id}>
              <small>{message.role === "user" ? "You" : "Coach"}</small>
              {message.role === "assistant"
                ? <CoachMessageContent content={message.content} />
                : <p>{message.content}</p>}
            </article>
          ))
        )}
      </div>
      {proposal?.status === "pending" && (
        <section className="plan-adjustment-proposal" aria-label="Proposed plan change">
          <header>
            <span>Review before saving</span>
            <strong>{proposal.summary}</strong>
          </header>
          <p>{proposal.rationale}</p>
          <ul>
            {proposal.changes.slice(0, 6).map((change) => (
              <li key={change.workoutId}>
                <strong>{change.workoutName}</strong>
                <span>
                  <time dateTime={change.before}>{new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${change.before}T12:00:00`))}</time>
                  <b aria-hidden="true">→</b>
                  <time dateTime={change.after}>{new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric" }).format(new Date(`${change.after}T12:00:00`))}</time>
                </span>
              </li>
            ))}
          </ul>
          {proposal.changes.length > 6 && <small>Plus {proposal.changes.length - 6} later workouts shifted by the same amount.</small>}
          <div>
            <Button busy={proposalAction === "confirm"} onClick={() => void resolveProposal("confirm")}>
              Apply to saved plan
            </Button>
            <Button variant="ghost" busy={proposalAction === "reject"} onClick={() => void resolveProposal("reject")}>
              Keep current plan
            </Button>
          </div>
        </section>
      )}
      {notice && <small className="plan-adjustment-notice" role="status">{notice}</small>}
      <form className="plan-coach-composer" onSubmit={(event) => void sendPlanMessage(event)}>
        <label className="ui-visually-hidden" htmlFor="plan-coach-message">Message your plan-aware coach</label>
        <textarea
          id="plan-coach-message"
          rows={2}
          maxLength={2_000}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Example: I only have 45 minutes on Wednesday…"
        />
        <Button type="submit" busy={sending} disabled={loading || !draft.trim()}>
          Send
        </Button>
      </form>
      {error && <small className="form-error" role="alert">{error}</small>}
      <small className="plan-coach-sync-note">Separate planning chat · your Coach still sees the current plan.</small>
    </aside>
  );
}

function minimumMovementsForProfile(profile: UserProfile | null) {
  if (!profile) return 2;
  const minutes = profile.preferredSessionMinutes;
  if (profile.experienceLevel === "advanced") {
    return minutes >= 90 ? 8 : minutes >= 75 ? 7 : minutes >= 60 ? 6 : minutes >= 40 ? 5 : 4;
  }
  if (profile.experienceLevel === "intermediate") return minutes >= 45 ? 4 : 3;
  return minutes >= 30 ? 3 : 2;
}

const advancedRegressionExerciseIds = new Set([
  "wall-push-up",
  "bodyweight-squat",
  "reverse-lunge",
  "glute-bridge",
  "push-up",
  "bird-dog",
  "dead-bug",
  "forearm-plank",
  "calf-raise",
  "bench-incline-push-up",
  "assisted-pull-up",
]);

function hasAdvancedRegression(workout: PlannedWorkout, profile: UserProfile | null) {
  return profile?.experienceLevel === "advanced"
    && workout.exercises.some((exercise) => advancedRegressionExerciseIds.has(exercise.exerciseId));
}

const planFocusMatchers = [
  { label: "Chest", pattern: /chest|pec/ },
  { label: "Back", pattern: /back|lat/ },
  { label: "Shoulders", pattern: /shoulder|delt/ },
  { label: "Arms", pattern: /bicep|tricep|arm/ },
  { label: "Quads", pattern: /quad/ },
  { label: "Hamstrings", pattern: /hamstring|posterior/ },
  { label: "Glutes", pattern: /glute/ },
  { label: "Calves", pattern: /calf|calves/ },
  { label: "Core", pattern: /core|abdominal|abs/ },
] as const;

function summarizePlanFocus(workouts: PlannedWorkout[]) {
  const totals = new Map<string, number>();
  for (const workout of workouts) {
    const workoutSets = workout.exercises.reduce((sum, exercise) => sum + exercise.sets, 0);
    const focusAreas = planFocusMatchers.filter(({ pattern }) => pattern.test(workout.focus.toLowerCase()));
    const matchedAreas = focusAreas.length > 0 ? focusAreas : [{ label: "Full body" }];
    const setsPerArea = workoutSets / matchedAreas.length;
    for (const area of matchedAreas) {
      totals.set(area.label, (totals.get(area.label) ?? 0) + setsPerArea);
    }
  }
  const total = [...totals.values()].reduce((sum, value) => sum + value, 0) || 1;
  return [...totals.entries()]
    .sort(([, left], [, right]) => right - left)
    .slice(0, 4)
    .map(([label, sets]) => ({ label, percent: Math.round((sets / total) * 100) }));
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
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selectedWeekNumber, setSelectedWeekNumber] = useState(0);
  const rescheduleAttemptRef = useRef("");
  const savedPlanWorkouts = dashboard.planWorkouts ?? dashboard.upcomingWorkouts;

  useEffect(() => {
    const plan = dashboard.activePlan;
    const today = localDateKey(new Date());
    if (!plan || plan.startDate <= today || activeSession) return;

    const attemptKey = `${plan.id}:${plan.startDate}:${today}`;
    if (rescheduleAttemptRef.current === attemptKey) return;
    rescheduleAttemptRef.current = attemptKey;
    const input: GeneratePlanRequest = { startDate: today };
    void apiRequest<GeneratePlanResponse>(`/v1/plans/${plan.id}/reschedule`, {
      method: "POST",
      body: JSON.stringify(input),
    })
      .then(async () => {
        await refresh();
        setNotice(`Plan dates updated to start today, ${new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date())}.`);
      })
      .catch((cause) => {
        setError(cause instanceof Error ? cause.message : "Unable to update the saved plan dates");
      });
  }, [activeSession, dashboard.activePlan, refresh]);

  const weeklyWorkouts = useMemo(() => {
    const weeks = new Map<number, Map<string, PlannedWorkout[]>>();
    for (const workout of savedPlanWorkouts) {
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
  }, [savedPlanWorkouts]);

  const defaultWeekNumber = savedPlanWorkouts.find(
    (workout) => workout.id === activeSession?.plannedWorkoutId,
  )?.weekNumber
    ?? savedPlanWorkouts.find((workout) => workout.status === "in_progress")?.weekNumber
    ?? savedPlanWorkouts.find((workout) => (
      workout.status === "planned" && workout.scheduledFor.slice(0, 10) >= localDateKey(new Date())
    ))?.weekNumber
    ?? savedPlanWorkouts.find((workout) => workout.status === "planned")?.weekNumber
    ?? weeklyWorkouts[0]?.weekNumber;
  const selectedWeek = weeklyWorkouts.find(
    (week) => week.weekNumber === selectedWeekNumber,
  ) ?? weeklyWorkouts.find((week) => week.weekNumber === defaultWeekNumber) ?? weeklyWorkouts[0];
  const selectedWeekSessions = selectedWeek?.days.flatMap((day) =>
    day.workouts.map((workout) => ({ ...workout, date: day.date })),
  ) ?? [];
  const totalExercises = selectedWeekSessions.reduce(
    (sum, workout) => sum + workout.exercises.length,
    0,
  );
  const weeklyMinutes = selectedWeekSessions.reduce(
    (sum, workout) => sum + workout.estimatedMinutes,
    0,
  );
  const weeklySets = selectedWeekSessions.reduce(
    (sum, workout) => sum + workout.exercises.reduce((sets, exercise) => sets + exercise.sets, 0),
    0,
  );
  const completedWorkouts = selectedWeekSessions.filter((workout) => workout.status === "completed").length;
  const completionPercent = selectedWeekSessions.length > 0
    ? Math.round((completedWorkouts / selectedWeekSessions.length) * 100)
    : 0;
  const largestSessionLoad = Math.max(
    1,
    ...selectedWeekSessions.map((workout) => workout.exercises.reduce((sets, exercise) => sets + exercise.sets, 0)),
  );
  const focusSummary = summarizePlanFocus(selectedWeekSessions);
  const todayKey = localDateKey(new Date());
  const primarySession = selectedWeekSessions.find((workout) => workout.id === activeSession?.plannedWorkoutId)
    ?? selectedWeekSessions.find((workout) => workout.status === "in_progress")
    ?? selectedWeekSessions.find((workout) => workout.status === "planned" && workout.date >= todayKey)
    ?? selectedWeekSessions.find((workout) => workout.status === "planned")
    ?? selectedWeekSessions[0];
  const profileLevel = dashboard.profile?.experienceLevel ?? "beginner";
  const profileLevelLabel = `${profileLevel.charAt(0).toUpperCase()}${profileLevel.slice(1)}`;
  const profilePhase = dashboard.profile?.trainingPhase ?? "general";
  const profilePhaseLabel = profilePhase === "bulk"
    ? "Lean bulk"
    : profilePhase === "cut"
      ? "Cut"
      : `${profilePhase.charAt(0).toUpperCase()}${profilePhase.slice(1)}`;
  const minimumMovements = minimumMovementsForProfile(dashboard.profile);
  const underPrescribedWorkouts = savedPlanWorkouts.filter(
    (workout) => workout.exercises.length < minimumMovements,
  );
  const regressionWorkouts = savedPlanWorkouts.filter(
    (workout) => hasAdvancedRegression(workout, dashboard.profile),
  );
  const planProfileMismatch = Boolean(
    dashboard.activePlan && dashboard.profile && (
      dashboard.activePlan.experienceLevel !== profileLevel
      || dashboard.activePlan.trainingPhase !== dashboard.profile.trainingPhase
      || dashboard.activePlan.durationWeeks !== dashboard.profile.programDurationWeeks
    ),
  );
  const planNeedsRefresh = planProfileMismatch
    || underPrescribedWorkouts.length > 0
    || regressionWorkouts.length > 0;
  const primarySessionNeedsRefresh = Boolean(
    primarySession && (
      primarySession.exercises.length < minimumMovements
      || hasAdvancedRegression(primarySession, dashboard.profile)
    ),
  );

  async function generate() {
    setGenerating(true);
    setError("");
    setNotice("");
    try {
      const input: GeneratePlanRequest = { startDate: localDateKey(new Date()) };
      const response = await apiRequest<GeneratePlanResponse>("/v1/plans/generate", {
        method: "POST",
        body: JSON.stringify(input),
      });
      setSelectedWeekNumber(0);
      await refresh();
      setNotice(`${response.plan.title} is ready as version ${response.plan.version}.`);
    } catch (cause) {
      if (cause instanceof ApiRequestError && cause.status === 429) {
        const wait = cause.retryAfterSeconds == null
          ? "a few minutes"
          : cause.retryAfterSeconds < 60
            ? `${cause.retryAfterSeconds} seconds`
            : `${Math.ceil(cause.retryAfterSeconds / 60)} minutes`;
        setError(`Plan generation is temporarily limited after repeated rebuilds. Try again in ${wait}.`);
      } else {
        setError(cause instanceof Error ? cause.message : "Unable to generate your plan");
      }
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
      const input: GeneratePlanRequest = { startDate: localDateKey(new Date()) };
      await apiRequest<GeneratePlanResponse>(`/v1/plans/${planId}/restore`, {
        method: "POST",
        body: JSON.stringify(input),
      });
      setSelectedWeekNumber(0);
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
              <b>{profilePhaseLabel}</b>
            </div>
            <h1 id="plan-title">{dashboard.activePlan.title}</h1>
            <p>{dashboard.activePlan.summary}</p>
            {planNeedsRefresh && (
              <p className="plan-profile-warning" role="status">
                {regressionWorkouts.length > 0
                  ? "This outdated plan uses beginner regression exercises as primary work for an advanced profile. Rebuild it with loaded compounds, machines, cables, and isolation work."
                  : underPrescribedWorkouts.length > 0
                  ? `This is an outdated low-volume plan. Your ${profileLevelLabel.toLowerCase()} ${dashboard.profile?.preferredSessionMinutes}-minute profile requires at least ${minimumMovements} movements per session.`
                  : `This saved plan does not match your current ${profileLevelLabel.toLowerCase()} ${profilePhaseLabel.toLowerCase()} setup.`}
              </p>
            )}
          </div>
          <div className="plan-overview-action">
            {(!planNeedsRefresh || weeklyWorkouts.length === 0) && (
              <Button className="plan-generate" busy={generating} onClick={() => void generate()}>
                {generating ? "Updating…" : planNeedsRefresh ? "Rebuild plan" : "Update plan"}
              </Button>
            )}
          </div>
          <div className="plan-overview-meta" aria-label="Program summary">
            <span><b>{dashboard.activePlan.durationWeeks}</b><small>Week block</small></span>
            <span><b>{dashboard.activePlan.daysPerWeek}</b><small>Sessions per week</small></span>
            {dashboard.profile && (
              <span><b>{dashboard.profile.preferredSessionMinutes}</b><small>Minute target</small></span>
            )}
            <span><b>{totalExercises}</b><small>Movements this week</small></span>
          </div>
        </section>
      ) : (
        <PageHeader
          eyebrow="Training plan"
          title={<>Build your first <em>training block.</em></>}
          description="Generate a phase-specific program around your goal, experience, equipment, and available time."
          actions={
            <Button busy={generating} onClick={() => void generate()}>
              {generating ? "Designing your plan…" : "Generate my plan"}
            </Button>
          }
        />
      )}
      {dashboard.activePlan && weeklyWorkouts.length > 0 && selectedWeek && (
        <button
          className="plan-coach-mobile-launch"
          type="button"
          aria-controls="plan-coach-panel"
          onClick={() => {
            const composer = document.querySelector<HTMLTextAreaElement>("#plan-coach-message");
            composer?.scrollIntoView({ behavior: "smooth", block: "center" });
            composer?.focus({ preventScroll: true });
          }}
        >
          <span className="plan-coach-mark" aria-hidden="true">✦</span>
          <span>
            <strong>Adjust this plan with Coach</strong>
            <small>Ask about schedule, recovery, volume, or exercises</small>
          </span>
          <b aria-hidden="true">→</b>
        </button>
      )}
      {notice && <p className="plan-generation-success" role="status">{notice}</p>}
      {error && !planNeedsRefresh && <p className="form-error plan-error" role="alert">{error}</p>}
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
          <div className="plan-week-picker">
            <label>
              <span>View training week</span>
              <select
                aria-label="Choose training week"
                value={selectedWeek.weekNumber}
                onChange={(event) => setSelectedWeekNumber(Number(event.target.value))}
              >
                {weeklyWorkouts.map((week) => {
                  const sessionCount = week.days.reduce(
                    (sum, day) => sum + day.workouts.length,
                    0,
                  );
                  return (
                    <option key={week.weekNumber} value={week.weekNumber}>
                      Week {week.weekNumber} · {sessionCount} {sessionCount === 1 ? "workout" : "workouts"}
                    </option>
                  );
                })}
              </select>
            </label>
            <span>{weeklyWorkouts.length}-week program</span>
          </div>

          <section className="plan-week" aria-labelledby={`week-${selectedWeek.weekNumber}`}>
            <header className="plan-week-summary">
              <div>
                <Eyebrow>Week {selectedWeek.weekNumber}</Eyebrow>
                <h2 id={`week-${selectedWeek.weekNumber}`}>{formatPlanDateRange(selectedWeek.days)}</h2>
              </div>
              <p>{dashboard.activePlan?.weeklyProgression[selectedWeek.weekNumber - 1]
                ?? "Build quality repetitions and keep each movement controlled."}</p>
            </header>

            <section className="plan-insights-grid" aria-label="Week at a glance">
              <article className="plan-load-card">
                <header>
                  <div>
                    <span>Training load</span>
                    <strong>{weeklySets} <small>Work sets</small></strong>
                  </div>
                  <span className="plan-load-duration">{weeklyMinutes} min</span>
                </header>
                <div
                  className="plan-load-chart"
                  role="img"
                  aria-label={`${weeklySets} work sets across ${selectedWeekSessions.length} workouts this week`}
                >
                  {selectedWeekSessions.map((workout) => {
                    const date = new Date(`${workout.date}T12:00:00`);
                    const sessionSets = workout.exercises.reduce((sets, exercise) => sets + exercise.sets, 0);
                    const isPrimary = primarySession?.id === workout.id;
                    return (
                      <div className={`plan-load-day ${isPrimary ? "is-primary" : ""}`} key={workout.id}>
                        <span className="plan-load-value">{sessionSets}</span>
                        <span className="plan-load-track">
                          <i
                            className={`is-${workout.status}`}
                            style={{ "--plan-load": `${Math.max(20, Math.round((sessionSets / largestSessionLoad) * 100))}%` } as CSSProperties}
                          />
                        </span>
                        <strong>{new Intl.DateTimeFormat("en", { weekday: "short" }).format(date).slice(0, 1)}</strong>
                      </div>
                    );
                  })}
                </div>
                <footer><i /> Balanced across {selectedWeekSessions.length} training days</footer>
              </article>

              <article className="plan-focus-card">
                <header>
                  <span>Muscle balance</span>
                  <strong>{focusSummary[0]?.label ?? "Full body"} <small>primary</small></strong>
                </header>
                <div className="plan-focus-bars">
                  {focusSummary.map((focus, index) => (
                    <div key={focus.label}>
                      <span><b>{focus.label}</b><small>{focus.percent}%</small></span>
                      <i><b className={`tone-${index + 1}`} style={{ width: `${focus.percent}%` }} /></i>
                    </div>
                  ))}
                </div>
              </article>

              <article className="plan-progress-card">
                <header><span>Week progress</span><b>{completedWorkouts}/{selectedWeekSessions.length}</b></header>
                <div
                  className="plan-progress-ring"
                  role="img"
                  aria-label={`${completionPercent}% of this week's workouts completed`}
                  style={{ "--plan-progress": `${completionPercent * 3.6}deg` } as CSSProperties}
                >
                  <span><strong>{completionPercent}%</strong><small>complete</small></span>
                </div>
                <footer>{completedWorkouts === 0 ? "Your week starts here" : `${selectedWeekSessions.length - completedWorkouts} sessions remaining`}</footer>
              </article>
            </section>

            <div className="plan-dashboard-layout">
              <section className="plan-schedule-dashboard" aria-labelledby="weekly-schedule-title">
                <header>
                  <div>
                    <h3 id="weekly-schedule-title">Weekly schedule</h3>
                    <p>{selectedWeekSessions.length} sessions · {weeklyMinutes} minutes</p>
                  </div>
                  <span className="plan-schedule-legend"><i /> Up next</span>
                </header>

                {planNeedsRefresh && (
                  <div className="plan-quality-alert" role="status">
                    <div>
                      <strong>{regressionWorkouts.length > 0 ? "This plan does not match your level" : "This plan is under-prescribed"}</strong>
                      <p>
                        {regressionWorkouts.length > 0
                          ? `${regressionWorkouts.length} workouts contain warm-up or regression movements as primary exercises.`
                          : underPrescribedWorkouts.length > 0
                          ? `${underPrescribedWorkouts.length} workouts have fewer than the ${minimumMovements} movements expected for your profile.`
                          : "Its duration or training phase no longer matches your profile."}
                        {activeSession ? " Finish or abandon the active workout before rebuilding." : " Rebuild it before starting another session."}
                      </p>
                      {error && (
                        <p className="plan-quality-error" role="alert">{error}</p>
                      )}
                    </div>
                    <Button
                      busy={generating}
                      disabled={Boolean(activeSession)}
                      onClick={() => void generate()}
                    >
                      {generating ? "Rebuilding…" : activeSession ? "Workout in progress" : "Rebuild plan"}
                    </Button>
                  </div>
                )}

                <details className="plan-schedule-details">
                  <summary>
                    <span><i aria-hidden="true">▦</i> All sessions</span>
                    <small>Dates, duration and status</small>
                    <b aria-hidden="true">⌄</b>
                  </summary>
                  <div className="plan-table-wrap">
                    <table className="plan-schedule-table">
                    <thead>
                      <tr><th>Date</th><th>Workout</th><th>Duration</th><th>Movements</th><th>Status</th></tr>
                    </thead>
                    <tbody>
                      {selectedWeekSessions.map((workout) => {
                        const date = new Date(`${workout.date}T12:00:00`);
                        const isActiveWorkout = activeSession?.plannedWorkoutId === workout.id;
                        const isPastUnlogged = workout.status === "planned" && workout.date < todayKey;
                        const needsRebuild = workout.exercises.length < minimumMovements
                          || hasAdvancedRegression(workout, dashboard.profile);
                        const isNext = !isActiveWorkout && !needsRebuild && workout.status === "planned" && primarySession?.id === workout.id;
                        return (
                          <tr className={isActiveWorkout ? "is-active" : isNext ? "is-next" : ""} key={workout.id}>
                            <td data-label="Date"><time dateTime={workout.date}><strong>{new Intl.DateTimeFormat("en", { weekday: "short" }).format(date)}</strong><span>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date)}</span></time></td>
                            <td data-label="Workout"><strong>{workout.name}</strong><small>{workout.focus}</small></td>
                            <td data-label="Duration">{workout.estimatedMinutes} min</td>
                            <td data-label="Movements"><span className={needsRebuild ? "plan-movement-warning" : ""}>{workout.exercises.length}{needsRebuild ? ` / ${minimumMovements}+` : ""}</span></td>
                            <td data-label="Status"><span className={`plan-table-status ${needsRebuild ? "needs-rebuild" : isActiveWorkout ? "active" : workout.status}`}>
                              {isActiveWorkout
                                ? "In progress"
                                : needsRebuild
                                  ? "Needs rebuild"
                                : isNext
                                  ? "Up next"
                                  : workout.status === "completed"
                                    ? "Complete"
                                    : isPastUnlogged
                                      ? "Not logged"
                                    : workout.status === "skipped"
                                      ? "Skipped"
                                      : "Scheduled"}
                            </span></td>
                          </tr>
                        );
                      })}
                    </tbody>
                    </table>
                  </div>
                </details>

                {primarySession && (
                  <section className="plan-next-workout" aria-labelledby="next-workout-title">
                    <header>
                      <div>
                        <Eyebrow>{activeSession?.plannedWorkoutId === primarySession.id
                          ? "Active workout"
                          : primarySessionNeedsRefresh
                            ? "Incomplete legacy workout"
                          : primarySession.status === "planned"
                            ? "Up next"
                            : "Workout details"}</Eyebrow>
                        <h3 id="next-workout-title">{primarySession.name}</h3>
                        <p>{primarySession.focus} · {primarySession.estimatedMinutes} min</p>
                      </div>
                      {!activeSession && !primarySessionNeedsRefresh && primarySession.status === "planned" && (
                        <Button
                          disabled={Boolean(startingId)}
                          busy={startingId === primarySession.id}
                          onClick={() => void start(primarySession.id)}
                        >
                          {startingId === primarySession.id ? "Starting…" : "Start workout →"}
                        </Button>
                      )}
                    </header>
                    {primarySessionNeedsRefresh ? (
                      <div className="plan-invalid-session">
                        <strong>Legacy workout hidden</strong>
                        <p>Its exercise selection is not suitable for your current level. Rebuild the plan to replace it with profile-matched working exercises.</p>
                      </div>
                    ) : (
                      <>
                        <ol className="plan-next-exercises">
                          {primarySession.exercises.slice(0, 4).map((exercise, exerciseIndex) => (
                            <li key={exercise.exerciseId}>
                              <span>{String(exerciseIndex + 1).padStart(2, "0")}</span>
                              <strong>{exercise.name}</strong>
                              <b>{exercise.sets} × {exercise.repRange}</b>
                              {exercise.video && <ExerciseVideoButton exerciseName={exercise.name} video={exercise.video} />}
                            </li>
                          ))}
                        </ol>
                        {primarySession.exercises.length > 4 && (
                          <details className="plan-exercise-details">
                            <summary>View {primarySession.exercises.length - 4} more exercises <b aria-hidden="true">⌄</b></summary>
                            <ol className="plan-next-exercises">
                              {primarySession.exercises.slice(4).map((exercise, exerciseIndex) => (
                                <li key={exercise.exerciseId}>
                                  <span>{String(exerciseIndex + 5).padStart(2, "0")}</span>
                                  <strong>{exercise.name}</strong>
                                  <b>{exercise.sets} × {exercise.repRange}</b>
                                  {exercise.video && <ExerciseVideoButton exerciseName={exercise.name} video={exercise.video} />}
                                </li>
                              ))}
                            </ol>
                          </details>
                        )}
                      </>
                    )}
                  </section>
                )}
              </section>

              {dashboard.activePlan && (
                <PlanCoachPanel
                  planId={dashboard.activePlan.id}
                  planTitle={dashboard.activePlan.title}
                  weekNumber={selectedWeek.weekNumber}
                  workoutId={primarySession?.id}
                  activeSessionId={activeSession?.id}
                  refresh={refresh}
                />
              )}
            </div>
          </section>
        </section>
      )}
      {dashboard.activePlan && (
        <PlanHistory
          history={dashboard.planHistory ?? []}
          activePlanId={dashboard.activePlan.id}
          restoringId={restoringId}
          hasActiveWorkout={Boolean(activeSession)}
          onRestore={restore}
        />
      )}
      {dashboard.activePlan && <PlanGuide />}
      {weeklyWorkouts.length === 0 && (
        <Card className="empty-state" padding="lg">
          <h2>No plan generated yet.</h2>
          <p>Generate a periodized plan after reviewing your training phase and profile.</p>
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
  onBack,
  onClose,
}: {
  session: WorkoutSession;
  onSession: (session: WorkoutSession) => void;
  onBack: () => void;
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
  const prescribedSets = session.exercises.reduce(
    (total, exercise) => total + exercise.prescribedSets,
    0,
  );
  const progressPercent = prescribedSets > 0
    ? Math.min(100, Math.round((session.totalSets / prescribedSets) * 100))
    : 0;
  const firstIncompleteExercise = session.exercises.findIndex(
    (exercise) => exercise.sets.length < exercise.prescribedSets,
  );
  const currentExerciseIndex = firstIncompleteExercise >= 0
    ? firstIncompleteExercise
    : Math.max(0, session.exercises.length - 1);

  async function openLiveCoach() {
    if (voiceThread) {
      setLiveVoiceOpen(true);
      return;
    }
    setOpeningVoice(true);
    setError("");
    try {
      const response = await apiRequest<CoachThreadListResponse>("/v1/coach/threads");
      const existing = mostRecentActiveCoachThread(response.threads, "general");
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
      <nav className="workout-runner-nav" aria-label="Workout navigation">
        <button className="workout-back-button" onClick={onBack} type="button">
          <span aria-hidden="true">←</span>
          Back to plan
        </button>
        <small>Your workout stays in progress</small>
      </nav>
      <header className="workout-command-header">
        <div className="workout-title-row">
          <div>
            <div className="workout-live-label">
              <span className={session.status === "paused" ? "is-paused" : "is-live"} aria-hidden="true" />
              {session.status === "paused" ? "Workout paused" : "Workout in progress"}
            </div>
            <h1>{session.name}</h1>
            <p>Stay focused. Log each set, then move to the next exercise.</p>
          </div>
          <div className="workout-live-actions">
            <Button
              variant="secondary"
              busy={openingVoice}
              disabled={openingVoice}
              onClick={() => void openLiveCoach()}
            >
              <span aria-hidden="true">✦</span>
              {openingVoice ? "Opening coach…" : "Talk to coach"}
            </Button>
            <Button variant="ghost" busy={workingAction === "status"} disabled={Boolean(workingAction)} onClick={() => void changeStatus()}>
              <span aria-hidden="true">{session.status === "paused" ? "▶" : "Ⅱ"}</span>
              {workingAction === "status" ? "Updating…" : session.status === "paused" ? "Resume" : "Pause"}
            </Button>
          </div>
        </div>
        <div className="workout-progress-panel">
          <div className="workout-progress-copy">
            <span>Session progress</span>
            <strong>{session.totalSets} of {prescribedSets} sets</strong>
          </div>
          <div
            className="workout-progress-track"
            role="progressbar"
            aria-label="Workout progress"
            aria-valuemin={0}
            aria-valuemax={prescribedSets}
            aria-valuenow={Math.min(session.totalSets, prescribedSets)}
          >
            <span style={{ width: `${progressPercent}%` }} />
          </div>
          <dl className="workout-stats">
            <div><dt>Time</dt><dd>{formatDuration(session.durationSeconds)}</dd></div>
            <div><dt>Volume</dt><dd>{session.totalVolumeKg.toLocaleString()} kg</dd></div>
            <div><dt>Exercises</dt><dd>{session.exercises.length}</dd></div>
          </dl>
        </div>
      </header>
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
        <section className="pause-banner" role="status">
          <span aria-hidden="true">Ⅱ</span>
          <div><strong>Workout paused</strong><small>Your progress is safe. Resume when you&apos;re ready to log another set.</small></div>
          <Button size="sm" onClick={() => void changeStatus()}>Resume workout</Button>
        </section>
      )}
      {error && <p className="form-error plan-error" role="alert">{error}</p>}
      <div className="workout-command-grid">
        <section className="workout-log-column">
          <div className="workout-section-heading">
            <div>
              <Eyebrow>Your workout</Eyebrow>
              <h2>Log your working sets</h2>
            </div>
            <span>{Math.min(currentExerciseIndex + 1, session.exercises.length)} of {session.exercises.length}</span>
          </div>
          <section className="workout-exercises" aria-label="Workout exercises">
            {session.exercises.map((exercise, index) => (
              <ExerciseLogger
                key={exercise.exerciseId}
                exercise={exercise}
                index={index}
                isCurrent={index === currentExerciseIndex}
                disabled={Boolean(workingAction) || session.status !== "active"}
                workingAction={workingAction}
                onLog={logSet}
                onSubstitute={substitute}
              />
            ))}
          </section>
        </section>
        <aside className="workout-tools-rail" aria-label="Workout tools">
          <MovementTracker
            key={`${session.id}-${session.status}`}
            session={session}
            onLiveMovement={setMovementSignal}
          />
          <Card className="workout-coach-card" padding="md">
            <span className="workout-coach-icon" aria-hidden="true">✦</span>
            <div>
              <strong>Need a spot?</strong>
              <p>Ask about form, pain, substitutions, or your next set.</p>
            </div>
            <Button variant="ghost" size="sm" busy={openingVoice} onClick={() => void openLiveCoach()}>
              Ask coach →
            </Button>
          </Card>
        </aside>
      </div>
      <Card className="finish-card" padding="lg">
        <div>
          <Eyebrow>When you&apos;re done</Eyebrow>
          <h2>Finish strong.</h2>
          <p>Rate the workout so your future recommendations get smarter.</p>
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
  index,
  isCurrent,
  disabled,
  workingAction,
  onLog,
  onSubstitute,
}: {
  exercise: WorkoutSession["exercises"][number];
  index: number;
  isCurrent: boolean;
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
  const completed = exercise.sets.length >= exercise.prescribedSets;
  const nextSetNumber = Math.min(exercise.sets.length + 1, exercise.prescribedSets);

  return (
    <Card
      as="article"
      className={`exercise-logger${isCurrent ? " is-current" : ""}${completed ? " is-complete" : ""}`}
      padding="md"
    >
      <header>
        <span className="exercise-order" aria-hidden="true">
          {completed ? "✓" : String(index + 1).padStart(2, "0")}
        </span>
        <div className="exercise-heading-copy">
          <div className="exercise-title-line">
            <h3>{exercise.name}</h3>
            {isCurrent && !completed && <span className="exercise-now">Up next</span>}
            {completed && <span className="exercise-done">Complete</span>}
          </div>
          <small><strong>{exercise.prescribedSets} × {exercise.repRange}</strong><span aria-hidden="true">•</span>{exercise.coachingNotes}</small>
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
      <div className="exercise-set-progress" aria-label={`${exercise.sets.length} of ${exercise.prescribedSets} prescribed sets complete`}>
        {Array.from({ length: exercise.prescribedSets }, (_, setIndex) => {
          const loggedSet = exercise.sets[setIndex];
          return (
            <span className={loggedSet ? "is-logged" : setIndex === exercise.sets.length ? "is-next" : ""} key={setIndex}>
              <b>{loggedSet ? "✓" : setIndex + 1}</b>
              <small>{loggedSet ? `${loggedSet.reps} reps · ${loggedSet.loadKg} kg` : `Set ${setIndex + 1}`}</small>
            </span>
          );
        })}
      </div>
      <div className="logged-sets" aria-label="Logged set details">
        {exercise.sets.map((set) => (
          <span key={set.id}>Set {set.setNumber}: RPE {set.effortRpe}</span>
        ))}
      </div>
      <div className="set-entry" role="group" aria-label={`Log set ${nextSetNumber} for ${exercise.name}`}>
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
          size="lg"
          disabled={disabled || exercise.sets.length >= exercise.prescribedSets + 2}
          busy={workingAction === `log-${exercise.exerciseId}`}
          onClick={() => void onLog(exercise.exerciseId, { reps, loadKg, effortRpe })}
        >
          {workingAction === `log-${exercise.exerciseId}` ? "Saving set…" : completed ? "Log extra set" : `Complete set ${nextSetNumber}`}
        </Button>
      </div>
    </Card>
  );
}

function History({
  dashboard,
  hasActiveWorkout,
  onCoach,
  onTrain,
}: {
  dashboard: DashboardResponse;
  hasActiveWorkout: boolean;
  onCoach: () => void;
  onTrain: () => void;
}) {
  const [filter, setFilter] = useState<"completed" | "all">("completed");
  const completed = useMemo(
    () => dashboard.recentSessions.filter((session) => session.status === "completed"),
    [dashboard.recentSessions],
  );
  const meaningfulStopped = useMemo(
    () => dashboard.recentSessions.filter(
      (session) => session.status === "abandoned" && session.totalSets > 0,
    ),
    [dashboard.recentSessions],
  );
  const emptyAttempts = useMemo(
    () => dashboard.recentSessions.filter(
      (session) => session.status === "abandoned" && session.totalSets === 0,
    ),
    [dashboard.recentSessions],
  );
  const visibleSessions = useMemo(
    () => (filter === "completed" ? completed : [...completed, ...meaningfulStopped])
      .sort((left, right) => new Date(right.startedAt).getTime() - new Date(left.startedAt).getTime()),
    [completed, filter, meaningfulStopped],
  );
  const hasCompletedWork = dashboard.progress.completedSessions > 0;
  const today = new Date();
  const startOfWeek = new Date(today);
  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const completedThisWeek = dashboard.completedSessionDates.filter((value) => {
    const completedAt = new Date(value);
    return Number.isFinite(completedAt.getTime()) && completedAt >= startOfWeek;
  }).length;
  const weeklyTarget = dashboard.profile?.trainingDaysPerWeek ?? 1;
  const weeklyPercent = Math.min(100, Math.round((completedThisWeek / Math.max(1, weeklyTarget)) * 100));
  const recentCompleted = [...completed].slice(0, 6).reverse();
  const maxRecentSets = Math.max(1, ...recentCompleted.map((session) => session.totalSets));
  const recentAverageSets = completed.length > 0
    ? Math.round(completed.reduce((sum, session) => sum + session.totalSets, 0) / completed.length)
    : 0;
  const recentAverageDuration = completed.length > 0
    ? Math.round(completed.reduce((sum, session) => sum + session.durationSeconds, 0) / completed.length / 60)
    : 0;
  const personalBests = useMemo(() => {
    const bestByExercise = new Map<string, {
      exerciseId: string;
      name: string;
      loadKg: number;
      reps: number;
      completedAt: string;
    }>();
    for (const session of completed) {
      for (const exercise of session.exercises) {
        for (const set of exercise.sets) {
          const current = bestByExercise.get(exercise.exerciseId);
          if (!current || set.loadKg > current.loadKg || (set.loadKg === current.loadKg && set.reps > current.reps)) {
            bestByExercise.set(exercise.exerciseId, {
              exerciseId: exercise.exerciseId,
              name: exercise.name,
              loadKg: set.loadKg,
              reps: set.reps,
              completedAt: set.completedAt,
            });
          }
        }
      }
    }
    return [...bestByExercise.values()]
      .sort((left, right) => new Date(right.completedAt).getTime() - new Date(left.completedAt).getTime())
      .slice(0, 4);
  }, [completed]);
  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }),
    [],
  );
  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat("en", { month: "short" }),
    [],
  );

  return (
    <div className="wrap history-page">
      <header className="history-header">
        <div>
          <Eyebrow>Performance</Eyebrow>
          <h1>Progress</h1>
          <p>See what is improving and decide what to do next.</p>
        </div>
        {dashboard.progress.lastCompletedAt && (
          <span className="history-last-trained">
            Last trained
            <b>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(dashboard.progress.lastCompletedAt))}</b>
          </span>
        )}
      </header>

      {!hasCompletedWork ? (
        <section className="history-baseline" aria-labelledby="history-baseline-title">
          <div className="history-baseline-copy">
            <Eyebrow>Your first milestone</Eyebrow>
            <h2 id="history-baseline-title">Finish one workout to create your baseline.</h2>
            <p>One completed session unlocks useful coaching: consistency, training-load trends, effort patterns, and your best working sets.</p>
            <Button size="lg" onClick={onTrain}>
              {hasActiveWorkout ? "Resume current workout" : "Go to today’s workout"}
            </Button>
          </div>
          <div className="history-baseline-unlocks" aria-label="Progress features unlocked after a completed workout">
            <span><b>01</b><strong>Consistency</strong><small>Sessions completed against your weekly target</small></span>
            <span><b>02</b><strong>Training load</strong><small>Sets, duration, volume, and effort over time</small></span>
            <span><b>03</b><strong>Lift records</strong><small>Your strongest logged working sets by exercise</small></span>
          </div>
        </section>
      ) : (
        <>
          <section className="history-progress-overview" aria-label="Current training progress">
            <article className="history-week-progress">
              <div>
                <Eyebrow>This week</Eyebrow>
                <strong>{completedThisWeek} <span>of {weeklyTarget} sessions</span></strong>
                <p>{completedThisWeek >= weeklyTarget
                  ? "Weekly target complete. Protect recovery before adding more work."
                  : `${Math.max(0, weeklyTarget - completedThisWeek)} ${weeklyTarget - completedThisWeek === 1 ? "session" : "sessions"} remaining to match your plan.`}</p>
              </div>
              <div className="history-week-ring" style={{ "--history-progress": `${weeklyPercent * 3.6}deg` } as React.CSSProperties}>
                <span>{weeklyPercent}%</span>
              </div>
              <div className="history-week-track" aria-hidden="true"><span style={{ width: `${weeklyPercent}%` }} /></div>
            </article>
            <dl className="history-lifetime-metrics">
              <div><dt>Completed</dt><dd>{dashboard.progress.completedSessions}<small>sessions</small></dd></div>
              <div><dt>Working sets</dt><dd>{dashboard.progress.completedSets}<small>total</small></dd></div>
              <div><dt>Volume</dt><dd>{Math.round(dashboard.progress.totalVolumeKg).toLocaleString()}<small>kg</small></dd></div>
              <div><dt>Avg. effort</dt><dd>{dashboard.progress.averageEffort ?? "—"}<small>RPE</small></dd></div>
            </dl>
          </section>

          <section className="history-analysis-grid">
            <article className="history-load-card">
              <header>
                <div><Eyebrow>Recent workload</Eyebrow><h2>Working sets by session</h2></div>
                <span><b>{recentAverageSets}</b> sets avg · <b>{recentAverageDuration}</b> min avg</span>
              </header>
              {recentCompleted.length > 0 ? (
                <div className="history-load-chart" aria-label="Working sets completed in recent sessions">
                  {recentCompleted.map((session) => (
                    <div key={session.id}>
                      <span style={{ height: `${Math.max(12, (session.totalSets / maxRecentSets) * 100)}%` }}><b>{session.totalSets}</b></span>
                      <small>{new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(session.startedAt))}</small>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="history-analysis-empty">Complete another workout to start the recent-load chart.</p>
              )}
            </article>
            <article className="history-records-card">
              <header><Eyebrow>Best working sets</Eyebrow><h2>Recent exercise records</h2></header>
              {personalBests.length > 0 ? (
                <ol>
                  {personalBests.map((record, index) => (
                    <li key={record.exerciseId}>
                      <span>{String(index + 1).padStart(2, "0")}</span>
                      <strong>{record.name}</strong>
                      <b>{record.loadKg > 0 ? `${record.loadKg} kg × ${record.reps}` : `${record.reps} reps`}</b>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="history-analysis-empty">Logged working sets will become exercise records here.</p>
              )}
            </article>
          </section>

          <section className="history-coach-review">
            <div>
              <Eyebrow>Coach review</Eyebrow>
              <strong>{completedThisWeek >= weeklyTarget ? "You hit this week’s target." : "Your next best move is consistency."}</strong>
              <p>Your coach can see this training history, current plan, readiness, and exact logged sets.</p>
            </div>
            <Button variant="secondary" onClick={onCoach}>Review my progress with coach</Button>
          </section>
        </>
      )}

      {hasCompletedWork && (
      <section className="history-log" aria-labelledby="history-log-title">
        <header className="history-log-header">
          <div>
            <h2 id="history-log-title">Workout details</h2>
            <p>Inspect completed work and any stopped session that contains logged sets.</p>
          </div>
          <div className="history-filters" aria-label="Filter training history">
            {([
              ["completed", "Completed", completed.length],
              ["all", "All activity", completed.length + meaningfulStopped.length],
            ] as const).map(([value, label, count]) => (
              <button
                aria-pressed={filter === value}
                key={value}
                onClick={() => setFilter(value)}
                type="button"
              >
                {label} <span>{count}</span>
              </button>
            ))}
          </div>
        </header>

        <div className="history-session-list">
          {visibleSessions.map((session) => {
            const startedAt = new Date(session.startedAt);
            const loggedExercises = session.exercises.filter((exercise) => exercise.sets.length > 0);
            const statusLabel = session.status === "abandoned"
              ? "Stopped"
              : session.status === "completed"
                ? "Completed"
                : session.status === "paused"
                  ? "Paused"
                  : "In progress";
            return (
              <details className={`history-session is-${session.status}`} key={session.id}>
                <summary>
                  <time dateTime={session.startedAt}>
                    <b>{startedAt.getDate()}</b>
                    <span>{monthFormatter.format(startedAt)}</span>
                  </time>
                  <span className="history-session-name">
                    <strong>{session.name}</strong>
                    <small>{dateFormatter.format(startedAt)}</small>
                  </span>
                  <span className="history-session-metrics">
                    {`${session.totalSets} sets · ${session.totalVolumeKg.toLocaleString()} kg · ${formatDuration(session.durationSeconds)}`}
                  </span>
                  <StatusBadge
                    className="session-status"
                    tone={session.status === "completed" ? "success" : session.status === "abandoned" ? "danger" : "warning"}
                  >
                    {statusLabel}
                  </StatusBadge>
                  <b className="history-session-toggle" aria-hidden="true">+</b>
                </summary>
                <div className="history-session-detail">
                  {loggedExercises.length > 0 ? (
                    <div className="history-exercise-log">
                      {loggedExercises.map((exercise) => (
                        <article key={exercise.exerciseId}>
                          <span>
                            <strong>{exercise.name}</strong>
                            <small>{exercise.sets.length} {exercise.sets.length === 1 ? "set" : "sets"}</small>
                          </span>
                          <div>
                            {exercise.sets.map((set) => (
                              <span key={set.id}>S{set.setNumber} · {set.reps} × {set.loadKg} kg · RPE {set.effortRpe}</span>
                            ))}
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="history-no-work">No sets were recorded in this session.</p>
                  )}
                  {(session.reflection || session.perceivedEffort) && (
                    <aside>
                      <small>Session note</small>
                      <p>{session.reflection || "No written reflection."}</p>
                      {session.perceivedEffort && <b>Session RPE {session.perceivedEffort}</b>}
                    </aside>
                  )}
                </div>
              </details>
            );
          })}
          {visibleSessions.length === 0 && (
            <div className="history-filter-empty">
              <strong>No completed session details are available yet</strong>
              <p>Finish another workout to add it to this comparison.</p>
            </div>
          )}
        </div>
      </section>
      )}

      {emptyAttempts.length > 0 && (
        <details className="history-attempts">
          <summary>
            <span><strong>Incomplete attempts</strong><small>Zero-set starts are kept for audit only and excluded from progress.</small></span>
            <b>{emptyAttempts.length}</b>
            <i aria-hidden="true">+</i>
          </summary>
          <div>
            {emptyAttempts.map((session) => (
              <article key={session.id}>
                <span><strong>{session.name}</strong><small>{dateFormatter.format(new Date(session.startedAt))}</small></span>
                <small>Stopped before first set</small>
              </article>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
