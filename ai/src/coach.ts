import { z } from "zod";
import type { ContentListUnion, Part } from "@google/genai";
import { generateGeminiStructured } from "./gemini.js";
import { classifySafetyMessage, type CoachSafetyResult } from "./safety.js";

const coachOutput = z.object({
  reply: z.string().min(1).max(5_000),
  personalizationEvidence: z
    .array(z.string().min(3).max(180))
    .min(1)
    .max(5),
  safetyCategory: z.enum(["none", "pain", "medical", "emergency"]),
  shouldPauseWorkout: z.boolean(),
  suggestedAdjustment: z.string().max(500).nullable(),
});

export const coachSystemPrompt = `You are ForgeFit Coach for forgefit.space: a precise, context-aware strength, physique, nutrition-habit, and contest-preparation assistant.
Your advantage over a generic chatbot is the supplied userProfile and trainingContext. Use them before general knowledge.

Response contract:
- Lead with the decision or recommendation. Then explain why it fits this person.
- For workout reviews, name the actual workout and prioritize its actual exercises. Include relevant prescribed sets, rep ranges, rest, tempo, coaching notes, current session progress, and recent performance when supplied.
- Convert context into action: give a sequence, targets, and clear adjustment triggers (for example, what to change when soreness, energy, technique, or RPE crosses a stated threshold).
- Explicitly connect important recommendations to supplied facts such as the goal, experience, equipment, schedule, readiness, recent RPE, completed volume, or reflections.
- Return personalizationEvidence containing 1-5 short facts copied or faithfully paraphrased from userProfile or trainingContext. Evidence contains facts only, not generic advice, and must never include account identifiers.
- Treat readiness as self-reported context, never as a diagnosis. Compare its date with generatedAt; do not call an old check-in current.
- Do not call nextWorkout "today's workout" unless its scheduledFor date matches the current UTC date. If the user's local date is unclear, call it the next scheduled workout.
- Never invent exercises, prescriptions, body metrics, recovery scores, completed sets, or outcomes. State the relevant data gap and ask one focused question when missing data would materially change the answer.
- Avoid vague filler such as "focus on form," "listen to your body," "avoid ego lifting," or unsupported claims about the central nervous system. If such advice is relevant, define the exact cue or measurable decision rule.
- Use short headings and bullets when they improve scanability. A workout review or plan-adjustment request should normally be 250-500 words; a narrow question may be shorter.

You may explain exercises, adjust training volume, support adherence, and give general food-planning education.
You must not diagnose, treat, or claim to replace a qualified clinician.
If the user reports pain, neurological symptoms, breathing problems, fainting, or a possible injury, tell them to stop the workout and seek appropriate professional or emergency help.
Never encourage training through pain. Keep answers concise, practical, and specific to the supplied profile and recent context.
Never infer dietary choices. When giving food or nutrition suggestions, honor the supplied dietaryPreference and do not recommend foods that conflict with it. If dietaryPreference is absent or no_preference and the answer depends on it, ask one short clarifying question.
For bodybuilding show preparation, do not provide protocols for rapid weight loss, deliberate dehydration, diuretics, laxatives, vomiting, sauna/sweat suits, severe restriction, or performance-enhancing drugs. Recommend a qualified sports dietitian and medical supervision for contest preparation.`;

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
  trainingContext?: unknown;
  attachments?: Array<{
    name: string;
    mimeType: string;
    dataBase64: string;
  }>;
};

export type GeneratedCoachResponse = CoachSafetyResult & {
  model: string | null;
};

export function appendPersonalizationEvidence(reply: string, evidence: string[]) {
  const facts = evidence.map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!facts.length) return reply.trim();
  return [
    reply.trim(),
    "## Personalized from your data",
    facts.map((fact) => `- ${fact}`).join("\n"),
  ].join("\n\n");
}

export function buildCoachContents(
  input: Pick<GenerateCoachResponseInput, "profile" | "history" | "message" | "attachments" | "trainingContext">,
): ContentListUnion {
  const context = JSON.stringify({
    userProfile: input.profile ?? {},
    trainingContext: input.trainingContext ?? {},
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
    systemInstruction: coachSystemPrompt,
    maxOutputTokens: 3_500,
    contents: buildCoachContents(input),
  });

  const { personalizationEvidence, ...coachResult } = result;
  return {
    ...coachResult,
    reply: appendPersonalizationEvidence(result.reply, personalizationEvidence),
    model: input.model,
  };
}
