import type { UserProfile } from "@fitai/contracts";
import type { Document } from "mongodb";

export function serializeProfile(document: Document): UserProfile {
  return {
    userId: String(document.userId),
    email: String(document.email),
    displayName: String(document.displayName),
    experienceLevel: document.experienceLevel as UserProfile["experienceLevel"],
    primaryGoal: String(document.primaryGoal),
    equipment: Array.isArray(document.equipment)
      ? document.equipment.map(String)
      : [],
    trainingDaysPerWeek: Number(document.trainingDaysPerWeek),
    preferredSessionMinutes: Number(document.preferredSessionMinutes),
    movementNotes: String(document.movementNotes ?? ""),
    onboardingCompletedAt: document.onboardingCompletedAt
      ? new Date(document.onboardingCompletedAt as Date).toISOString()
      : null,
  };
}
