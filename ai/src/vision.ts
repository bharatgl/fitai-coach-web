import { z } from "zod";
import {
  generateStructuredAI,
  type AIContent,
  type AIProviderConfig,
} from "./provider.js";

const liveCameraAnalysisSchema = z.object({
  status: z.enum(["analyzed", "needs_better_view"]),
  summary: z.string().min(1).max(1_000),
  observations: z.array(z.string().min(1).max(300)).max(5),
  limitations: z.array(z.string().min(1).max(300)).max(4),
  nextStep: z.string().min(1).max(300),
});

export type LiveCameraAnalysis = z.infer<typeof liveCameraAnalysisSchema>;

export const liveCameraAnalysisSystemPrompt = [
  "You analyze one current camera frame for a fitness coach.",
  "Report only training-relevant details that are plainly visible. Be concise and voice-friendly.",
  "Never identify the person or infer age, race, ethnicity, religion, health conditions, diagnoses, attractiveness, or other sensitive traits.",
  "Never estimate an exact body-fat percentage or claim that one still frame proves muscular imbalance, injury, or posture pathology.",
  "For physique requests, discuss only visible muscular development, balance, symmetry, and posing, while stating limitations from clothing, lighting, angle, and framing.",
  "For form requests, a still frame can assess only the visible setup or position, not a complete repetition.",
  "If the relevant body area is not fully visible, especially when the frame is only a face or partial torso, return needs_better_view and give one specific repositioning instruction.",
  "Do not invent observations. Use limitations when certainty is not possible.",
].join("\n");

export type AnalyzeCameraFrameInput = {
  provider: AIProviderConfig;
  focus: "physique" | "posture" | "form" | "general";
  memberContext: unknown;
  imageBase64: string;
  mimeType: "image/jpeg";
  dimensions: { width: number; height: number };
};

export function buildCameraAnalysisContents(
  input: Omit<AnalyzeCameraFrameInput, "provider">,
): AIContent {
  return [{
    role: "user",
    parts: [
      {
        text: JSON.stringify({
          request: "Analyze this current camera view for the live fitness coach.",
          focus: input.focus,
          frameDimensions: input.dimensions,
          memberContext: input.memberContext,
        }),
      },
      {
        file: {
          name: "live-camera-frame.jpg",
          mimeType: input.mimeType,
          dataBase64: input.imageBase64,
        },
      },
    ],
  }];
}

export async function analyzeCameraFrame(
  input: AnalyzeCameraFrameInput,
): Promise<LiveCameraAnalysis> {
  return generateStructuredAI({
    provider: input.provider,
    schema: liveCameraAnalysisSchema,
    systemInstruction: liveCameraAnalysisSystemPrompt,
    contents: buildCameraAnalysisContents(input),
    maxOutputTokens: 900,
  });
}
