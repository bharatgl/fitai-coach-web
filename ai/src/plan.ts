import type { UserProfile } from "@fitai/contracts";
import { z } from "zod";
import { generateGeminiStructured } from "./gemini.js";

const planExerciseSchema = z.object({
  exerciseId: z.string().min(1).max(80),
  sets: z.number().int().min(1).max(6),
  repRange: z.string().min(1).max(40),
  restSeconds: z.number().int().min(30).max(300),
  tempo: z.string().min(1).max(30).nullable(),
  coachingNotes: z.string().min(1).max(300),
});

const planDaySchema = z.object({
  dayOffset: z.number().int().min(0).max(6),
  name: z.string().min(2).max(80),
  focus: z.string().min(2).max(120),
  estimatedMinutes: z.number().int().min(10).max(180),
  exercises: z.array(planExerciseSchema).min(2).max(10),
});

const planWeekSchema = z.object({
  weekNumber: z.number().int().min(1).max(4),
  days: z.array(planDaySchema).min(1).max(7),
});

export const generatedPlanSchema = z.object({
  title: z.string().min(2).max(100),
  summary: z.string().min(10).max(600),
  rationale: z.array(z.string().min(2).max(240)).min(2).max(6),
  weeklyProgression: z.array(z.string().min(2).max(240)).length(4),
  weeks: z.array(planWeekSchema).length(4),
});

export type GeneratedPlanDraft = z.infer<typeof generatedPlanSchema>;

export type PlanCatalogExercise = {
  id: string;
  name: string;
  movement: string;
  requiredEquipment: string[];
  guidance: string;
};

export type GeneratePlanInput = {
  apiKey: string;
  model: string;
  profile: UserProfile;
  exercises: PlanCatalogExercise[];
};

export type PlanVolumeTargets = {
  minExercisesPerSession: number;
  maxExercisesPerSession: number;
  minWorkingSetsPerSession: number;
  maxWorkingSetsPerSession: number;
  targetSessionMinutes: { min: number; max: number };
};

export function planVolumeTargetsFor(
  profile: Pick<UserProfile, "experienceLevel" | "preferredSessionMinutes">,
): PlanVolumeTargets {
  const minutes = profile.preferredSessionMinutes;
  const targetSessionMinutes = {
    min: Math.max(10, Math.floor(minutes * 0.8)),
    max: minutes,
  };

  if (profile.experienceLevel === "advanced") {
    const minExercisesPerSession = minutes >= 60 ? 5 : minutes >= 40 ? 4 : 3;
    const maxExercisesPerSession = Math.min(8, minExercisesPerSession + 2);
    return {
      minExercisesPerSession,
      maxExercisesPerSession,
      minWorkingSetsPerSession: minExercisesPerSession * 3,
      maxWorkingSetsPerSession: Math.min(30, maxExercisesPerSession * 4),
      targetSessionMinutes,
    };
  }

  if (profile.experienceLevel === "intermediate") {
    const minExercisesPerSession = minutes >= 45 ? 4 : 3;
    const maxExercisesPerSession = Math.min(6, minExercisesPerSession + 2);
    return {
      minExercisesPerSession,
      maxExercisesPerSession,
      minWorkingSetsPerSession: minExercisesPerSession * 3,
      maxWorkingSetsPerSession: Math.min(24, maxExercisesPerSession * 4),
      targetSessionMinutes,
    };
  }

  const minExercisesPerSession = minutes >= 30 ? 3 : 2;
  const maxExercisesPerSession = Math.min(5, minExercisesPerSession + 2);
  return {
    minExercisesPerSession,
    maxExercisesPerSession,
    minWorkingSetsPerSession: Math.max(6, minExercisesPerSession * 2),
    maxWorkingSetsPerSession: Math.min(18, maxExercisesPerSession * 3),
    targetSessionMinutes,
  };
}

const planInstructions = `You design practical, evidence-informed four-week training plans whose volume and structure match the user's experience level and primary goal.
Use only exercise IDs from the supplied catalog. Never invent an exercise.
Return exactly four weeks numbered 1 through 4. In every week, return exactly the requested number of training days, using unique dayOffset values from 0 through 6 in ascending order.
Do not copy the same week four times. Every consecutive week must change at least one exercise or visible prescription while preserving a coherent progression. Keep useful foundational movements when appropriate, but vary accessories, sets, rep ranges, or tempo.
Follow the supplied sessionVolumeTargets for every workout. Use most of the user's available session time rather than filling a long session with a short circuit.
For advanced bodybuilding goals, use a coherent hypertrophy split such as push/pull/legs, upper/lower, or body-part emphasis. Sequence stable compound work before accessories, distribute volume across the week, and include enough distinct movements to train the stated focus completely.
For intermediate goals, use balanced compound and accessory work. For beginners, prioritize a smaller set of repeatable foundational movements.
Use clear bodybuilding prescriptions such as 5-8, 8-12, 10-15, or 12-20 reps where appropriate. Keep most work around 1-3 repetitions in reserve. Avoid maximal effort, forced repetitions, one-repetition-max testing, routine training to failure, and training through pain.
Keep each workout within the user's preferred duration. Balance squat, hinge, push, pull, lunge, core, and carry patterns across the week when the catalog permits.
Movement notes are constraints, not diagnoses. If the notes describe an issue that needs clinical assessment, keep the plan conservative and say so in the rationale.
Use age, height, weight, and body considerations only when they meaningfully affect setup, exercise selection, volume, recovery, or coaching cues. Do not diagnose from measurements or calculate a weight-loss target.
Do not make assumptions from gender or prescribe stereotyped "men's" or "women's" workouts. Gender context may only influence the plan when the user's body considerations describe a relevant need or preference.
Progression must preserve technique and user control. Week 4 should consolidate or deload rather than sharply increase volume.
The plan title must start with the exact supplied experienceLevel. Never label an advanced profile intermediate or beginner.
Never prescribe drugs, extreme dehydration, crash dieting, or other unsafe contest-prep practices.`;

export async function generateAdaptivePlan(
  input: GeneratePlanInput,
): Promise<GeneratedPlanDraft> {
  return generateGeminiStructured({
    apiKey: input.apiKey,
    model: input.model,
    schema: generatedPlanSchema,
    systemInstruction: planInstructions,
    maxOutputTokens: 16_000,
    contents: JSON.stringify({
      requestedTrainingDays: input.profile.trainingDaysPerWeek,
      preferredSessionMinutes: input.profile.preferredSessionMinutes,
      sessionVolumeTargets: planVolumeTargetsFor(input.profile),
      experienceLevel: input.profile.experienceLevel,
      gender: input.profile.gender,
      age: input.profile.age,
      heightCm: input.profile.heightCm,
      weightKg: input.profile.weightKg,
      primaryGoal: input.profile.primaryGoal,
      availableEquipment: input.profile.equipment,
      movementNotes: input.profile.movementNotes,
      bodyConsiderations: input.profile.bodyConsiderations,
      exerciseCatalog: input.exercises,
    }),
  });
}
