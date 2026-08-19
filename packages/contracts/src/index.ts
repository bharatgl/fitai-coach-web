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

export type DashboardResponse = {
  profile: UserProfile | null;
  activePlan: Record<string, unknown> | null;
  upcomingWorkouts: Record<string, unknown>[];
  recentSessions: Record<string, unknown>[];
  recentMessages: CoachMessage[];
};
