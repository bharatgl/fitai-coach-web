import type { UserProfile } from "@fitai/contracts";
import type { Document } from "mongodb";

function inferredTrainingPhase(goal: string): UserProfile["trainingPhase"] {
  if (/\b(cut|fat.?loss|lose weight|shred)\b/i.test(goal)) return "cut";
  if (/\b(bulk|build muscle|hypertrophy|bodybuild|gain muscle)\b/i.test(goal)) return "bulk";
  if (/\b(recomp|recomposition)\b/i.test(goal)) return "recomposition";
  return "general";
}

function defaultProgramDuration(level: UserProfile["experienceLevel"]): 4 | 8 | 12 {
  if (level === "advanced") return 12;
  if (level === "intermediate") return 8;
  return 4;
}

export function serializeProfile(document: Document): UserProfile {
  const experienceLevel = document.experienceLevel as UserProfile["experienceLevel"];
  const primaryGoal = String(document.primaryGoal);
  const storedDuration = Number(document.programDurationWeeks);
  return {
    userId: String(document.userId),
    email: String(document.email),
    displayName: String(document.displayName),
    experienceLevel,
    gender: (document.gender ?? "prefer_not_to_say") as UserProfile["gender"],
    age: document.age == null ? null : Number(document.age),
    heightCm: document.heightCm == null ? null : Number(document.heightCm),
    weightKg: document.weightKg == null ? null : Number(document.weightKg),
    dietaryPreference: (document.dietaryPreference ?? "no_preference") as UserProfile["dietaryPreference"],
    primaryGoal,
    trainingPhase: (document.trainingPhase ?? inferredTrainingPhase(primaryGoal)) as UserProfile["trainingPhase"],
    programDurationWeeks: ([4, 8, 12].includes(storedDuration)
      ? storedDuration
      : defaultProgramDuration(experienceLevel)) as 4 | 8 | 12,
    equipment: Array.isArray(document.equipment)
      ? document.equipment.map(String)
      : [],
    trainingDaysPerWeek: Number(document.trainingDaysPerWeek),
    preferredSessionMinutes: Number(document.preferredSessionMinutes),
    movementNotes: String(document.movementNotes ?? ""),
    bodyConsiderations: String(document.bodyConsiderations ?? ""),
    onboardingCompletedAt: document.onboardingCompletedAt
      ? new Date(document.onboardingCompletedAt as Date).toISOString()
      : null,
  };
}
