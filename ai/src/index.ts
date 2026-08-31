export {
  buildCoachContents,
  coachBehaviorContract,
  ensurePlanChangeConfirmation,
  generateCoachResponse,
  type CoachHistoryItem,
  type CoachMovementContext,
  type GeneratedCoachResponse,
  type GenerateCoachResponseInput,
  type PlanAdjustmentProposalDraft,
} from "./coach.js";
export {
  classifySafetyMessage,
  type CoachSafetyResult,
} from "./safety.js";
export {
  buildDeterministicPlan,
  generateAdaptivePlan,
  generatedPlanSchema,
  planVolumeTargetsFor,
  type GeneratedPlanDraft,
  type GeneratePlanInput,
  type PlanCatalogExercise,
  type PlanVolumeTargets,
} from "./plan.js";
export {
  AiProviderError,
} from "./provider-error.js";
export {
  createLiveCoachToken,
  defaultLiveCoachModel,
  type CreateLiveCoachTokenInput,
} from "./live.js";
export {
  generateGroundedResearch,
  groundedResearchFromResponse,
  researchClientOptions,
  toGeminiJsonSchema,
  translateGeminiError,
  type GenerateGroundedResearchInput,
  type GeminiResearchAuth,
  type GroundedResearchResult,
} from "./gemini.js";
export {
  generateStructuredAI,
  type AIContent,
  type AIContentPart,
  type AIFilePart,
  type AIProviderConfig,
  type AIProviderKind,
} from "./provider.js";
export {
  analyzeCameraFrame,
  buildCameraAnalysisContents,
  liveCameraAnalysisSystemPrompt,
  type AnalyzeCameraFrameInput,
  type LiveCameraAnalysis,
} from "./vision.js";
