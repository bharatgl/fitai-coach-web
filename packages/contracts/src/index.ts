export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type Gender = "woman" | "man" | "non_binary" | "prefer_not_to_say";
export type DietaryPreference =
  | "vegetarian"
  | "non_vegetarian"
  | "vegan"
  | "eggetarian"
  | "no_preference";

export type UserProfile = {
  userId: string;
  email: string;
  displayName: string;
  experienceLevel: ExperienceLevel;
  gender: Gender;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  dietaryPreference: DietaryPreference;
  primaryGoal: string;
  equipment: string[];
  trainingDaysPerWeek: number;
  preferredSessionMinutes: number;
  movementNotes: string;
  bodyConsiderations: string;
  onboardingCompletedAt: string | null;
};

export type CoachAttachment = {
  id: string;
  name: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  size: number;
};

export type CoachMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments: CoachAttachment[];
  safetyCategory: "none" | "pain" | "medical" | "emergency";
  createdAt: string;
  editedAt?: string | null;
};

export type CoachThread = {
  id: string;
  title: string;
  pinned: boolean;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  messageCount: number;
};

export type CoachThreadDetail = {
  thread: CoachThread;
  messages: CoachMessage[];
};

export type CoachThreadListResponse = { threads: CoachThread[] };
export type CreateCoachThreadRequest = { title?: string };
export type CreateCoachThreadResponse = { thread: CoachThread };
export type UpdateCoachThreadRequest = {
  title?: string;
  pinned?: boolean;
  archived?: boolean;
};
export type UpdateCoachMessageRequest = { content: string };

export type CoachRequest = {
  message: string;
  attachmentIds?: string[];
  threadId?: string;
  sessionId?: string;
};

export type UploadCoachAttachmentRequest = {
  name: string;
  mimeType: CoachAttachment["mimeType"];
  dataBase64: string;
};

export type UploadCoachAttachmentResponse = {
  attachment: CoachAttachment;
};

export type CoachResponse = {
  thread: CoachThread;
  userMessage: CoachMessage;
  message: CoachMessage;
  shouldPauseWorkout: boolean;
  suggestedAdjustment: string | null;
};

export type ExerciseVideo = {
  provider: "youtube";
  videoId: string;
  title: string;
  channel: string;
};

export type PlanExercise = {
  exerciseId: string;
  name: string;
  video: ExerciseVideo | null;
  sets: number;
  repRange: string;
  restSeconds: number;
  tempo: string | null;
  coachingNotes: string;
  loadAdjustmentPercent?: number;
};

export type PlannedWorkoutStatus =
  | "planned"
  | "in_progress"
  | "completed"
  | "skipped";

export type PlannedWorkout = {
  id: string;
  planId: string;
  weekNumber: number;
  dayOffset: number;
  name: string;
  focus: string;
  scheduledFor: string;
  estimatedMinutes: number;
  exercises: PlanExercise[];
  status: PlannedWorkoutStatus;
};

export type WorkoutSessionStatus =
  | "active"
  | "paused"
  | "completed"
  | "abandoned";

export type WorkoutSetLog = {
  id: string;
  setNumber: number;
  reps: number;
  loadKg: number;
  effortRpe: number;
  completedAt: string;
};

export type WorkoutSessionExercise = {
  exerciseId: string;
  name: string;
  video: ExerciseVideo | null;
  prescribedSets: number;
  repRange: string;
  coachingNotes: string;
  substitutedFor: { exerciseId: string; name: string } | null;
  sets: WorkoutSetLog[];
};

export type WorkoutSession = {
  id: string;
  plannedWorkoutId: string;
  planId: string;
  name: string;
  status: WorkoutSessionStatus;
  exercises: WorkoutSessionExercise[];
  startedAt: string;
  pausedAt: string | null;
  completedAt: string | null;
  pausedDurationSeconds: number;
  durationSeconds: number;
  reflection: string;
  perceivedEffort: number | null;
  totalSets: number;
  totalVolumeKg: number;
};

export type WorkoutProgress = {
  completedSessions: number;
  completedSets: number;
  totalVolumeKg: number;
  averageEffort: number | null;
  lastCompletedAt: string | null;
};

export type ReadinessStatus = "ready" | "steady" | "recover";

export type ReadinessCheckIn = {
  id: string;
  date: string;
  sleepHours: number;
  sleepQuality: number;
  energy: number;
  soreness: number;
  stress: number;
  motivation: number;
  bodyWeightKg: number | null;
  notes: string;
  score: number;
  status: ReadinessStatus;
  createdAt: string;
  updatedAt: string;
};

export type SaveReadinessCheckInRequest = Pick<
  ReadinessCheckIn,
  | "date"
  | "sleepHours"
  | "sleepQuality"
  | "energy"
  | "soreness"
  | "stress"
  | "motivation"
  | "bodyWeightKg"
  | "notes"
>;

export type ReadinessCheckInResponse = {
  checkIn: ReadinessCheckIn | null;
};

export type StartWorkoutResponse = { session: WorkoutSession };
export type WorkoutSessionResponse = { session: WorkoutSession };

export type MovementEventSummary = {
  clientEventId: string;
  exerciseId: string;
  repNumber: number;
  occurredAt: string;
  durationMs: number;
  rangeOfMotionDegrees: number;
  confidence: number;
  source: "mediapipe_pose";
};

export type RecordMovementEventsRequest = {
  events: MovementEventSummary[];
};

export type RecordMovementEventsResponse = {
  accepted: number;
  duplicates: number;
};

export type LogWorkoutSetRequest = {
  exerciseId: string;
  reps: number;
  loadKg: number;
  effortRpe: number;
};

export type ChangeWorkoutStatusRequest = {
  action: "pause" | "resume";
};

export type SubstituteExerciseRequest = {
  exerciseId: string;
};

export type FinishWorkoutRequest = {
  reflection: string;
  perceivedEffort: number;
};

export type WorkoutPlan = {
  id: string;
  version: number;
  status: "active" | "archived";
  title: string;
  summary: string;
  startDate: string;
  durationWeeks: number;
  daysPerWeek: number;
  rationale: string[];
  weeklyProgression: string[];
  createdAt: string;
};

export type GeneratePlanRequest = {
  startDate?: string;
};

export type GeneratePlanResponse = {
  plan: WorkoutPlan;
  workouts: PlannedWorkout[];
};

export type DashboardResponse = {
  profile: UserProfile | null;
  latestReadiness: ReadinessCheckIn | null;
  activePlan: WorkoutPlan | null;
  upcomingWorkouts: PlannedWorkout[];
  activeSession: WorkoutSession | null;
  recentSessions: WorkoutSession[];
  progress: WorkoutProgress;
  recentMessages: CoachMessage[];
};
