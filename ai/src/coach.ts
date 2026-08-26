import { z } from "zod";
import type { ContentListUnion, Part } from "@google/genai";
import { generateGeminiStructured } from "./gemini.js";
import { classifySafetyMessage, type CoachSafetyResult } from "./safety.js";

const coachOutput = z.object({
  reply: z.string().min(1).max(2_000),
  safetyCategory: z.enum(["none", "pain", "medical", "emergency"]),
  shouldPauseWorkout: z.boolean(),
  suggestedAdjustment: z.string().max(500).nullable(),
});

const systemPrompt = `You are ForgeFit Coach for forgefit.space, a conservative fitness guidance assistant.
You may explain exercises, adjust training volume, and support adherence.
You must not diagnose, treat, or claim to replace a qualified clinician.
If the user reports pain, neurological symptoms, breathing problems, fainting, or a possible injury, tell them to stop the workout and seek appropriate professional or emergency help.
Never encourage training through pain. Keep answers concise, practical, and specific to the supplied profile and recent context.
Never infer dietary choices. When giving food or nutrition suggestions, honor the supplied dietaryPreference and do not recommend foods that conflict with it. If dietaryPreference is absent or no_preference and the answer depends on it, ask one short clarifying question.`;

export type CoachHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

export type GenerateCoachResponseInput = {
  apiKey: string;
  model: string;
  profile: unknown;
  history: CoachHistoryItem[];
  message: string;
  attachments?: Array<{
    name: string;
    mimeType: string;
    dataBase64: string;
  }>;
};

export type GeneratedCoachResponse = CoachSafetyResult & {
  model: string | null;
};

export function buildCoachContents(
  input: Pick<GenerateCoachResponseInput, "profile" | "history" | "message" | "attachments">,
): ContentListUnion {
  const context = JSON.stringify({
    userProfile: input.profile ?? {},
    recentConversation: input.history,
    currentMessage: input.message,
    attachedFiles: input.attachments?.map(({ name, mimeType }) => ({ name, mimeType })) ?? [],
  });
  if (!input.attachments?.length) return context;

  const parts: Part[] = [
    { text: context },
    ...input.attachments.flatMap((attachment): Part[] => [
      { text: `Attached file: ${attachment.name}` },
      {
        inlineData: {
          data: attachment.dataBase64,
          mimeType: attachment.mimeType,
        },
      },
    ]),
  ];
  return [{ role: "user", parts }];
}

export async function generateCoachResponse(
  input: GenerateCoachResponseInput,
): Promise<GeneratedCoachResponse> {
  const safetyResult = classifySafetyMessage(input.message);
  if (safetyResult) return { ...safetyResult, model: null };

  const result = await generateGeminiStructured({
    apiKey: input.apiKey,
    model: input.model,
    schema: coachOutput,
    systemInstruction: systemPrompt,
    maxOutputTokens: 2_000,
    contents: buildCoachContents(input),
  });

  return { ...result, model: input.model };
}
