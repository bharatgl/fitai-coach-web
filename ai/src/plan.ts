import type { UserProfile } from "@fitai/contracts";
import { z } from "zod";
import { generateStructuredAI, type AIProviderConfig } from "./provider.js";

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
  weekNumber: z.number().int().min(1).max(12),
  days: z.array(planDaySchema).min(1).max(7),
});

export const generatedPlanSchema = z.object({
  title: z.string().min(2).max(100),
  summary: z.string().min(10).max(600),
  rationale: z.array(z.string().min(2).max(240)).min(2).max(6),
  weeklyProgression: z.array(z.string().min(2).max(240)).min(4).max(12),
  weeks: z.array(planWeekSchema).min(4).max(12),
});

export type GeneratedPlanDraft = z.infer<typeof generatedPlanSchema>;

export type PlanCatalogExercise = {
  id: string;
  name: string;
  movement: string;
  muscleGroups?: string[];
  requiredEquipment: string[];
  guidance: string;
};

export type GeneratePlanInput = {
  provider: AIProviderConfig;
  profile: UserProfile;
  exercises: PlanCatalogExercise[];
};

const sessionTemplates = [
  { name: "Push and quads", movements: ["push", "squat", "push", "lunge", "core", "carry", "pull", "hinge"] },
  { name: "Pull and posterior", movements: ["pull", "hinge", "pull", "carry", "core", "squat", "push", "lunge"] },
  { name: "Legs", movements: ["squat", "hinge", "lunge", "carry", "core", "pull", "push", "squat"] },
  { name: "Chest and shoulders", movements: ["push", "push", "pull", "core", "lunge", "carry", "squat", "hinge"] },
  { name: "Back and arms", movements: ["pull", "pull", "hinge", "core", "carry", "push", "lunge", "squat"] },
  { name: "Lower body", movements: ["squat", "lunge", "hinge", "carry", "core", "pull", "push", "lunge"] },
  { name: "Full body", movements: ["squat", "push", "pull", "hinge", "lunge", "core", "carry", "push"] },
] as const;

const advancedBodybuildingTemplates = [
  { name: "Push — chest, shoulders, triceps", muscleGroups: ["chest", "chest", "chest", "shoulders", "shoulders", "triceps", "triceps", "triceps"] },
  { name: "Pull — back, rear delts, biceps", muscleGroups: ["back", "back", "back", "back", "rear_delts", "biceps", "biceps", "biceps"] },
  { name: "Legs — quads, hamstrings, glutes", muscleGroups: ["quads", "quads", "quads", "hamstrings", "hamstrings", "glutes_primary", "calves", "calves"] },
  { name: "Push — shoulders and chest", muscleGroups: ["shoulders", "shoulders", "chest", "chest", "chest", "triceps", "triceps", "triceps"] },
  { name: "Pull — back and arms", muscleGroups: ["back", "back", "back", "rear_delts", "biceps", "biceps", "biceps", "biceps"] },
  { name: "Legs — posterior and quads", muscleGroups: ["hamstrings", "hamstrings", "glutes_primary", "quads", "quads", "quads", "calves", "calves"] },
] as const;

function spreadDayOffsets(trainingDays: number) {
  if (trainingDays === 1) return [0];
  return Array.from(
    { length: trainingDays },
    (_, index) => Math.round(index * (6 / (trainingDays - 1))),
  );
}

/**
 * Builds a profile-aware plan locally when the model is unavailable or returns
 * malformed structured output. The same domain validator still runs before
 * this draft can be persisted.
 */
export function buildDeterministicPlan(
  profile: UserProfile,
  exercises: PlanCatalogExercise[],
): GeneratedPlanDraft {
  const targets = planVolumeTargetsFor(profile);
  const exerciseCount = Math.min(targets.minExercisesPerSession, exercises.length);
  if (exerciseCount < targets.minExercisesPerSession) {
    throw new Error("Not enough exercises to build a compatible training plan");
  }

  const dayOffsets = spreadDayOffsets(profile.trainingDaysPerWeek);
  const level = `${profile.experienceLevel[0]?.toUpperCase()}${profile.experienceLevel.slice(1)}`;
  const phase = `${profile.trainingPhase[0]?.toUpperCase()}${profile.trainingPhase.slice(1)}`;
  const repRanges = ["8-12 reps", "10-12 reps", "6-10 reps", "10-15 reps"];

  const weeks = Array.from({ length: profile.programDurationWeeks }, (_, weekIndex) => {
    const blockWeek = weekIndex % 4;
    const workingSetTarget = Math.min(
      targets.maxWorkingSetsPerSession,
      targets.minWorkingSetsPerSession + (blockWeek === 1 ? exerciseCount : blockWeek === 2 ? exerciseCount * 2 : 0),
    );

    return {
      weekNumber: weekIndex + 1,
      days: dayOffsets.map((dayOffset, dayIndex) => {
        const bodybuildingTemplate = profile.experienceLevel === "advanced"
          ? advancedBodybuildingTemplates[dayIndex % advancedBodybuildingTemplates.length]
          : null;
        const template = sessionTemplates[dayIndex % sessionTemplates.length]!;
        const rotation = (dayIndex * exerciseCount) % exercises.length;
        const rotated = [...exercises.slice(rotation), ...exercises.slice(0, rotation)];
        const selected: PlanCatalogExercise[] = [];
        if (bodybuildingTemplate) {
          for (const muscleGroup of bodybuildingTemplate.muscleGroups) {
            if (selected.length >= exerciseCount) break;
            const match = rotated.find(
              (exercise) => exercise.muscleGroups?.includes(muscleGroup)
                && !selected.some((item) => item.id === exercise.id),
            );
            if (match) selected.push(match);
          }
        } else {
          for (const movement of template.movements) {
            if (selected.length >= exerciseCount) break;
            const match = rotated.find(
              (exercise) => exercise.movement === movement && !selected.some((item) => item.id === exercise.id),
            );
            if (match) selected.push(match);
          }
        }
        for (const exercise of rotated) {
          if (selected.length >= exerciseCount) break;
          if (!selected.some((item) => item.id === exercise.id)) selected.push(exercise);
        }

        const baseSets = Math.floor(workingSetTarget / selected.length);
        const additionalSets = workingSetTarget % selected.length;
        return {
          dayOffset,
          name: bodybuildingTemplate?.name ?? template.name,
          focus: bodybuildingTemplate
            ? [...new Set(bodybuildingTemplate.muscleGroups)].join(", ")
            : [...new Set(selected.map((exercise) => exercise.movement))].join(", "),
          estimatedMinutes: profile.preferredSessionMinutes,
          exercises: selected.map((exercise, exerciseIndex) => ({
            exerciseId: exercise.id,
            sets: baseSets + (exerciseIndex < additionalSets ? 1 : 0),
            repRange: exercise.movement === "carry"
              ? `${30 + ((weekIndex + dayIndex) % 3) * 10}-${45 + ((weekIndex + dayIndex) % 3) * 10} seconds`
              : repRanges[(blockWeek + dayIndex + exerciseIndex) % repRanges.length]!,
            restSeconds: ["squat", "hinge", "push", "pull"].includes(exercise.movement) ? 120 : 60,
            tempo: blockWeek === 3 ? "3-1-1" : null,
            coachingNotes: exercise.guidance.slice(0, 300),
          })),
        };
      }),
    };
  });

  const progressionLabels = [
    "Establish repeatable loads with two to three repetitions in reserve.",
    "Add working volume while keeping technique and recovery stable.",
    "Use the strongest recoverable loading of this block without training to failure.",
    "Consolidate technique and manage fatigue before the next block.",
  ];

  return generatedPlanSchema.parse({
    title: `${level} ${phase} Bodybuilding Plan`,
    summary: `${profile.programDurationWeeks} weeks of profile-matched, periodized training across ${profile.trainingDaysPerWeek} weekly sessions.`,
    rationale: [
      `Uses ${profile.trainingDaysPerWeek} sessions of up to ${profile.preferredSessionMinutes} minutes.`,
      `Matches the ${profile.experienceLevel} training level and ${profile.trainingPhase} phase.`,
      "Keeps progression measurable while scheduling regular fatigue management.",
    ],
    weeklyProgression: Array.from(
      { length: profile.programDurationWeeks },
      (_, weekIndex) => `Week ${weekIndex + 1}: ${progressionLabels[weekIndex % progressionLabels.length]}`,
    ),
    weeks,
  });
}

export type PlanVolumeTargets = {
  minExercisesPerSession: number;
  maxExercisesPerSession: number;
  minWorkingSetsPerSession: number;
  maxWorkingSetsPerSession: number;
  targetSessionMinutes: { min: number; max: number };
};

export function planVolumeTargetsFor(
  profile: Pick<UserProfile, "experienceLevel" | "preferredSessionMinutes" | "trainingPhase">,
): PlanVolumeTargets {
  const minutes = profile.preferredSessionMinutes;
  const targetSessionMinutes = {
    min: Math.max(10, Math.floor(minutes * 0.8)),
    max: minutes,
  };

  if (profile.experienceLevel === "advanced") {
    const minExercisesPerSession = minutes >= 90
      ? 8
      : minutes >= 75
        ? 7
        : minutes >= 60
          ? 6
          : minutes >= 40
            ? 5
            : 4;
    const maxExercisesPerSession = Math.min(10, minExercisesPerSession + 2);
    return {
      minExercisesPerSession,
      maxExercisesPerSession,
      minWorkingSetsPerSession: profile.trainingPhase === "cut"
        ? Math.max(12, minExercisesPerSession * 2)
        : minExercisesPerSession * 3,
      maxWorkingSetsPerSession: profile.trainingPhase === "cut"
        ? Math.min(24, maxExercisesPerSession * 4)
        : Math.min(30, maxExercisesPerSession * 4),
      targetSessionMinutes,
    };
  }

  if (profile.experienceLevel === "intermediate") {
    const minExercisesPerSession = minutes >= 45 ? 4 : 3;
    const maxExercisesPerSession = Math.min(6, minExercisesPerSession + 2);
    return {
      minExercisesPerSession,
      maxExercisesPerSession,
      minWorkingSetsPerSession: profile.trainingPhase === "cut"
        ? Math.max(8, minExercisesPerSession * 2)
        : minExercisesPerSession * 3,
      maxWorkingSetsPerSession: profile.trainingPhase === "cut"
        ? Math.min(20, maxExercisesPerSession * 4)
        : Math.min(24, maxExercisesPerSession * 4),
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

const planInstructions = `You design practical, evidence-informed, natural training programs whose volume and structure match the user's experience level, training phase, and primary goal.
Use only exercise IDs from the supplied catalog. Never invent an exercise.
Return exactly requestedProgramWeeks weeks numbered consecutively from 1. In every week, return exactly the requested number of training days, using unique dayOffset values from 0 through 6 in ascending order.
Return exactly one weeklyProgression entry per requested week. Organize longer programs into clear accumulation, progression, intensification, and fatigue-management phases. Use every fourth week and the final week to manage fatigue when appropriate.
Do not copy the same week repeatedly. Every consecutive week must change at least one visible prescription while preserving a coherent progression. Keep primary lifts stable long enough to measure progress; vary accessories, sets, rep ranges, tempo, or loading emphasis deliberately rather than randomly.
Follow the supplied sessionVolumeTargets for every workout. Use most of the user's available session time rather than filling a long session with a short circuit.
For advanced bodybuilding goals, use a coherent hypertrophy split such as push/pull/legs, upper/lower, or body-part emphasis. Sequence stable compound work before accessories, distribute volume across the week, and include enough distinct movements to train the stated focus completely.
For an advanced profile with full gym equipment, select loaded compounds, machines, cables, and targeted isolation work. Do not prescribe wall push-ups, bodyweight squats, bird dogs, dead bugs, basic glute bridges, or other regression-style warm-ups as primary working exercises.
For a bulk phase, prioritize stable compound and accessory exercises that support progressive overload, use mostly moderate hypertrophy rep ranges, allow longer rest for demanding lifts, and build recoverable volume across each accumulation phase.
For a cut phase, retain key compound patterns and meaningful loading to preserve strength and muscle, reduce accessory volume before load, manage fatigue, and use low-impact conditioning only when the supplied catalog and schedule permit. Do not turn every session into a high-repetition circuit.
For recomposition, balance progressive strength work with moderate recoverable hypertrophy volume. For general training, use a balanced phase without pretending it is a bulk or cut.
For intermediate goals, use balanced compound and accessory work. For beginners, prioritize a smaller set of repeatable foundational movements.
Use clear bodybuilding prescriptions such as 5-8, 8-12, 10-15, or 12-20 reps where appropriate. Keep most work around 1-3 repetitions in reserve. Avoid maximal effort, forced repetitions, one-repetition-max testing, routine training to failure, and training through pain.
Keep each workout within the user's preferred duration. Balance squat, hinge, push, pull, lunge, core, and carry patterns across the week when the catalog permits.
Movement notes are constraints, not diagnoses. If the notes describe an issue that needs clinical assessment, keep the plan conservative and say so in the rationale.
Use age, height, weight, and body considerations only when they meaningfully affect setup, exercise selection, volume, recovery, or coaching cues. Do not diagnose from measurements or calculate a weight-loss target.
Do not make assumptions from gender or prescribe stereotyped "men's" or "women's" workouts. Gender context may only influence the plan when the user's body considerations describe a relevant need or preference.
Progression must preserve technique and user control. Week 4 should consolidate or deload rather than sharply increase volume.
The plan title must start with the exact supplied experienceLevel and identify the supplied trainingPhase. Never label an advanced profile intermediate or beginner, and never label a cut as a bulk or vice versa.
Keep coachingNotes concise so the complete long-term program fits in the structured response.
Never prescribe drugs, extreme dehydration, crash dieting, or other unsafe contest-prep practices.`;

export async function generateAdaptivePlan(
  input: GeneratePlanInput,
): Promise<GeneratedPlanDraft> {
  return generateStructuredAI({
    provider: input.provider,
    schema: generatedPlanSchema,
    systemInstruction: planInstructions,
    maxOutputTokens: 32_000,
    contents: JSON.stringify({
      requestedTrainingDays: input.profile.trainingDaysPerWeek,
      requestedProgramWeeks: input.profile.programDurationWeeks,
      preferredSessionMinutes: input.profile.preferredSessionMinutes,
      sessionVolumeTargets: planVolumeTargetsFor(input.profile),
      experienceLevel: input.profile.experienceLevel,
      trainingPhase: input.profile.trainingPhase,
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
