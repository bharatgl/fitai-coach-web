export type ExperienceLevel = "beginner" | "intermediate" | "advanced";

export type UserProfile = {
  userId: string;
  email: string;
  displayName: string;
  experienceLevel: ExperienceLevel;
  primaryGoal: string;
  equipment: string[];
  trainingDaysPerWeek: number;
  preferredSessionMinutes: number;
  movementNotes: string;
  onboardingCompletedAt: string | null;
};

export type CoachMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  safetyCategory: "none" | "pain" | "medical" | "emergency";
  createdAt: string;
};

export type CoachRequest = {
  message: string;
  sessionId?: string;
};

export type CoachResponse = {
  message: CoachMessage;
  shouldPauseWorkout: boolean;
  suggestedAdjustment: string | null;
};

export type PlanExercise = {
  exerciseId: string;
  name: string;
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

export type StartWorkoutResponse = { session: WorkoutSession };
export type WorkoutSessionResponse = { session: WorkoutSession };

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
  activePlan: WorkoutPlan | null;
  upcomingWorkouts: PlannedWorkout[];
  activeSession: WorkoutSession | null;
  recentSessions: WorkoutSession[];
  progress: WorkoutProgress;
  recentMessages: CoachMessage[];
};
