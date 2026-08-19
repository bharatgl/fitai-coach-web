import { createHash } from "node:crypto";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";
import { classifySafetyMessage, type CoachSafetyResult } from "./safety.js";

const coachOutput = z.object({
  reply: z.string().min(1).max(2_000),
  safetyCategory: z.enum(["none", "pain", "medical", "emergency"]),
  shouldPauseWorkout: z.boolean(),
  suggestedAdjustment: z.string().max(500).nullable(),
});

const systemPrompt = `You are FitAI Coach, a conservative fitness guidance assistant.
You may explain exercises, adjust training volume, and support adherence.
You must not diagnose, treat, or claim to replace a qualified clinician.
If the user reports pain, neurological symptoms, breathing problems, fainting, or a possible injury, tell them to stop the workout and seek appropriate professional or emergency help.
Never encourage training through pain. Keep answers concise, practical, and specific to the supplied profile and recent context.`;

export type CoachHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

export type GenerateCoachResponseInput = {
  apiKey: string;
  model: string;
  userId: string;
  profile: unknown;
  history: CoachHistoryItem[];
  message: string;
};

export type GeneratedCoachResponse = CoachSafetyResult & {
  model: string | null;
};

export async function generateCoachResponse(
  input: GenerateCoachResponseInput,
): Promise<GeneratedCoachResponse> {
  const safetyResult = classifySafetyMessage(input.message);
  if (safetyResult) return { ...safetyResult, model: null };

  const client = new OpenAI({ apiKey: input.apiKey });
  const response = await client.responses.parse({
    model: input.model,
    store: false,
    safety_identifier: createHash("sha256").update(input.userId).digest("hex"),
    instructions: systemPrompt,
    input: [
      {
        role: "developer",
        content: `User profile: ${JSON.stringify(input.profile ?? {})}`,
      },
      ...input.history.map((item) => ({
        role: item.role,
        content: item.content,
      })),
    ],
    text: { format: zodTextFormat(coachOutput, "fitai_coach_response") },
  });

  if (!response.output_parsed) {
    throw new Error("The coach model did not return a valid structured response");
  }

  return { ...response.output_parsed, model: input.model };
}
