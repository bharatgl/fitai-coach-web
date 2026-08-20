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
};

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
  recentSessions: Record<string, unknown>[];
  recentMessages: CoachMessage[];
};
