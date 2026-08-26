import type { UserProfile } from "@fitai/contracts";
import type { Document } from "mongodb";

export function serializeProfile(document: Document): UserProfile {
  return {
    userId: String(document.userId),
    email: String(document.email),
    displayName: String(document.displayName),
    experienceLevel: document.experienceLevel as UserProfile["experienceLevel"],
    gender: (document.gender ?? "prefer_not_to_say") as UserProfile["gender"],
    age: document.age == null ? null : Number(document.age),
    heightCm: document.heightCm == null ? null : Number(document.heightCm),
    weightKg: document.weightKg == null ? null : Number(document.weightKg),
    dietaryPreference: (document.dietaryPreference ?? "no_preference") as UserProfile["dietaryPreference"],
    primaryGoal: String(document.primaryGoal),
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
