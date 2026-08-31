export type ExperienceLevel = "beginner" | "intermediate" | "advanced";
export type TrainingPhase = "cut" | "bulk" | "recomposition" | "general";
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
  trainingPhase: TrainingPhase;
  programDurationWeeks: 4 | 8 | 12;
  equipment: string[];
  trainingDaysPerWeek: number;
  preferredSessionMinutes: number;
  movementNotes: string;
  bodyConsiderations: string;
  onboardingCompletedAt: string | null;
};

export type ProviderCredentialStatus = {
  configured: boolean;
  source: "user" | "platform";
  keyHint: string | null;
  model: string;
};

export type AIProviderKind = "gemini" | "openai" | "anthropic" | "openai_compatible";

export type ProviderSettingsResponse = {
  secureStorageAvailable: boolean;
  ai: ProviderCredentialStatus & {
    provider: AIProviderKind;
    baseUrl: string | null;
  };
  elevenlabs: ProviderCredentialStatus & {
    agentId: string | null;
    voiceId: string | null;
  };
};

export type UpdateProviderSettingsRequest = {
  ai?: {
    provider: AIProviderKind;
    apiKey?: string;
    model?: string;
    baseUrl?: string | null;
  };
  elevenlabs?: {
    apiKey?: string;
    agentId?: string;
    voiceId?: string;
    model?: string;
  };
};

export type BotVertical = "fitness" | "interview" | "resume" | "custom";
export type BotStatus = "draft" | "active";
export type BotTurnEagerness = "patient" | "normal" | "eager";

export type BotInstructions = {
  personality: string;
  goal: string;
  boundaries: string;
  firstMessage: string;
};

export type BotVoiceSettings = {
  enabled: boolean;
  voiceId: string | null;
  turnEagerness: BotTurnEagerness;
};

export type BotCapabilities = {
  documentReview: boolean;
  knowledgeBase: boolean;
  webResearch: boolean;
};

export type BotResearchSource = {
  title: string;
  url: string;
};

export type BotResearchEvidence = {
  asOf: string;
  queries: string[];
  sources: BotResearchSource[];
  searchSuggestionsHtml: string | null;
};

export type BotContext = {
  audience: string;
  personalContext: string;
  referenceMaterial: string;
};

export type BotDefinition = {
  id: string;
  slug: string;
  name: string;
  description: string;
  vertical: BotVertical;
  status: BotStatus;
  instructions: BotInstructions;
  context: BotContext;
  voice: BotVoiceSettings;
  capabilities: BotCapabilities;
  starterPrompts: string[];
  providerAgentId: string | null;
  lastSyncedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type BotTemplate = {
  id: "interview_coach" | "resume_reviewer" | "fitness_coach" | "blank";
  name: string;
  description: string;
  vertical: BotVertical;
  icon: string;
  instructions: BotInstructions;
  context: BotContext;
  voice: BotVoiceSettings;
  capabilities: BotCapabilities;
  starterPrompts: string[];
};

export type BotTemplateListResponse = { templates: BotTemplate[] };
export type BotListResponse = { bots: BotDefinition[] };
export type BotResponse = { bot: BotDefinition };
export type CreateBotRequest = {
  templateId: BotTemplate["id"];
  name?: string;
};
export type UpdateBotRequest = Partial<Pick<BotDefinition,
  "name" | "description" | "instructions" | "context" | "voice" | "capabilities" | "starterPrompts"
>>;
export type BotVoiceSessionResponse = {
  botId: string;
  botName: string;
  signedUrl: string;
  firstMessage: string;
  promptOverride: string;
};
export type BotLiveTokenResponse = {
  token: string;
  model: string;
  voiceName: string;
  expiresAt: string;
  sessionOpening: string;
  initialHistory: Array<{ role: "user" | "model"; text: string }>;
};
export type BotChatMessage = {
  id: string;
  botId: string;
  role: "user" | "assistant";
  content: string;
  attachments: CoachAttachment[];
  research: BotResearchEvidence | null;
  createdAt: string;
};
export type BotChatHistoryResponse = { messages: BotChatMessage[] };
export type BotChatRequest = { message: string; attachmentIds?: string[] };
export type BotChatResponse = {
  userMessage: BotChatMessage;
  message: BotChatMessage;
};
export type SaveLiveBotTurnRequest = {
  clientTurnId?: string;
  userTranscript: string;
  assistantTranscript: string;
  provider?: "gemini" | "elevenlabs";
};
export type BotGeneratedPdfResponse = {
  attachment: CoachAttachment;
  message: BotChatMessage;
};
export type BotResearchResponse = {
  answer: string;
  evidence: BotResearchEvidence;
  message: BotChatMessage;
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
  scope: "general" | "plan";
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
export type CreateCoachThreadRequest = {
  title?: string;
  scope?: "general" | "plan";
};
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
  planId?: string;
  weekNumber?: number;
  workoutId?: string;
};

export type UploadCoachAttachmentRequest = {
  name: string;
  mimeType: CoachAttachment["mimeType"];
  dataBase64: string;
  threadId?: string;
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
  planAdjustmentProposal: PlanAdjustmentProposal | null;
};

export type PlanAdjustmentProposalStatus = "pending" | "applied" | "rejected" | "expired";

export type PlanAdjustmentChange = {
  workoutId: string;
  workoutName: string;
  before: string;
  after: string;
};

export type PlanAdjustmentProposal = {
  id: string;
  planId: string;
  basePlanRevision: number;
  action: "move_workouts" | "reschedule_plan";
  status: PlanAdjustmentProposalStatus;
  summary: string;
  rationale: string;
  changes: PlanAdjustmentChange[];
  createdAt: string;
  expiresAt: string;
  appliedAt: string | null;
};

export type PendingPlanAdjustmentResponse = {
  proposal: PlanAdjustmentProposal | null;
};

export type ConfirmPlanAdjustmentResponse = {
  proposal: PlanAdjustmentProposal;
  plan: WorkoutPlan;
  workouts: PlannedWorkout[];
};

export type LiveCoachTokenResponse = {
  token: string;
  model: string;
  voiceName: string;
  expiresAt: string;
  sessionOpening: string;
  initialHistory: Array<{
    role: "user" | "model";
    text: string;
  }>;
};

export type LiveCoachAvatarTokenResponse = {
  sessionToken: string;
};

export type ElevenLabsCoachSessionResponse = {
  signedUrl: string;
  agentId: string;
  userName: string;
  dynamicVariables: {
    user_name: string;
    session_opening: string;
    member_context: string;
    conversation_history: string;
    current_local_datetime: string;
    user_timezone: string;
  };
};

export type LiveCoachSnapshotResponse = {
  capturedAt: string;
  profile: Record<string, unknown> | null;
  trainingContext: Record<string, unknown>;
  movementContext: Record<string, unknown> | null;
};

export type LiveCameraAnalysisFocus = "physique" | "posture" | "form" | "general";

export type LiveCameraAnalysisResponse = {
  status: "analyzed" | "needs_better_view" | "unavailable";
  capturedAt: string;
  summary: string;
  observations: string[];
  limitations: string[];
  nextStep: string;
};

export type LiveAttachmentReviewResponse = {
  attachments: CoachAttachment[];
  review: string;
};

export type GeneratedCoachPdfResponse = {
  attachment: CoachAttachment;
  thread: CoachThreadDetail;
};

export type SaveLiveCoachTurnRequest = {
  clientTurnId?: string;
  threadId: string;
  sessionId?: string;
  userTranscript: string;
  assistantTranscript: string;
  provider?: "gemini" | "elevenlabs";
};

export type ExerciseVideo = {
  provider: "youtube";
  videoId: string;
  title: string;
  channel: string;
};

export type ExerciseLibraryItem = {
  id: string;
  sourceId: string;
  name: string;
  bodyPart: string;
  equipment: string;
  target: string;
  muscleGroup: string;
  secondaryMuscles: string[];
  instructions: string[];
};

export type ExerciseLibrarySource = {
  name: string;
  repository: string;
  commit: string;
  license: string;
  importedFields: string;
};

export type ExerciseLibraryResponse = {
  items: ExerciseLibraryItem[];
  total: number;
  offset: number;
  limit: number;
  filters: {
    bodyParts: string[];
    equipment: string[];
    targets: string[];
  };
  source: ExerciseLibrarySource;
};

export type ExerciseDemo = {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  equipment: string;
  bodyPart: string;
  primaryMuscles: string[];
  secondaryMuscles: string[];
  instructions: string[];
  tips: string[];
  frames: string[];
  animation: string;
};

export type ExerciseDemoSource = {
  name: string;
  repository: string;
  homepage: string;
  commit: string;
  license: string;
  attribution: string;
  changes: string;
};

export type ExerciseDemoResponse = {
  items: ExerciseDemo[];
  total: number;
  offset: number;
  limit: number;
  filters: {
    bodyParts: string[];
    equipment: string[];
  };
  source: ExerciseDemoSource;
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
  revision: number;
  status: "active" | "archived";
  experienceLevel: ExperienceLevel | null;
  trainingPhase: TrainingPhase | null;
  restoredFromVersion: number | null;
  title: string;
  summary: string;
  startDate: string;
  durationWeeks: number;
  daysPerWeek: number;
  rationale: string[];
  weeklyProgression: string[];
  createdAt: string;
};

export type PlanHistoryEntry = {
  plan: WorkoutPlan;
  workoutCount: number;
  averageSessionMinutes: number;
  averageMovementsPerSession: number;
  averageSetsPerSession: number;
  weeklyWorkingSets: number;
  completedSessions: number;
  completionRate: number;
  totalVolumeKg: number;
  averageEffort: number | null;
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
  planHistory: PlanHistoryEntry[];
  planWorkouts: PlannedWorkout[];
  upcomingWorkouts: PlannedWorkout[];
  activeSession: WorkoutSession | null;
  recentSessions: WorkoutSession[];
  completedSessionDates: string[];
  progress: WorkoutProgress;
  recentMessages: CoachMessage[];
};

export type OperationsTimeRange = "24h" | "7d" | "30d";

export type OperationsSeriesPoint = {
  timestamp: string;
  label: string;
  requests: number;
  tokens: number;
  errors: number;
};

export type OperationsAlert = {
  id: string;
  severity: "critical" | "warning" | "info";
  title: string;
  message: string;
  value: string;
};

export type OperationsService = {
  id: "api" | "database" | "ai" | "voice";
  name: string;
  status: "operational" | "degraded" | "unconfigured";
  detail: string;
  latencyMs: number | null;
};

export type OperationsLogEntry = {
  id: string;
  timestamp: string;
  level: "info" | "warning" | "error";
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  message: string;
};

export type OperationsPerformanceRow = {
  route: string;
  requests: number;
  errorRate: number;
  averageLatencyMs: number;
  p95LatencyMs: number;
};

export type OperationsModelUsage = {
  model: string;
  provider: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type OperationsDashboardResponse = {
  generatedAt: string;
  range: OperationsTimeRange;
  rangeLabel: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    previousPeriodTokens: number;
    tokenChangePercent: number | null;
    estimatedCredits: number;
    monthlyTokens: number;
    monthlyTokenLimit: number;
    monthlyCredits: number;
    monthlyCreditLimit: number;
    conversations: number;
    liveSessions: number;
    researchRequestsToday: number;
    researchDailyLimit: number;
    models: OperationsModelUsage[];
  };
  traffic: {
    requests: number;
    successfulRequests: number;
    failedRequests: number;
    errorRate: number;
    averageLatencyMs: number;
    p50LatencyMs: number;
    p95LatencyMs: number;
    requestBytes: number;
    responseBytes: number;
  };
  runtime: {
    status: "healthy" | "degraded";
    uptimeSeconds: number;
    nodeVersion: string;
    environment: string;
    release: string;
    memoryUsedMb: number;
    memoryLimitMb: number;
  };
  alerts: OperationsAlert[];
  services: OperationsService[];
  series: OperationsSeriesPoint[];
  performance: OperationsPerformanceRow[];
  logs: OperationsLogEntry[];
  updates: Array<{
    id: string;
    title: string;
    detail: string;
    status: "active" | "configured" | "attention";
  }>;
  notes: {
    tokenEstimate: string;
    creditDefinition: string;
    retention: string;
  };
};
