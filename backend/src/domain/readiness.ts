import type {
  ReadinessCheckIn,
  ReadinessStatus,
  SaveReadinessCheckInRequest,
} from "@fitai/contracts";

export type ReadinessDocument = SaveReadinessCheckInRequest & {
  id: string;
  userId: string;
  score: number;
  status: ReadinessStatus;
  createdAt: Date;
  updatedAt: Date;
};

function ratingScore(rating: number) {
  return (rating - 1) / 4;
}

export function calculateReadinessScore(
  input: Pick<
    SaveReadinessCheckInRequest,
    "sleepQuality" | "energy" | "soreness" | "stress" | "motivation"
  >,
) {
  const weighted =
    ratingScore(input.sleepQuality) * 0.25 +
    ratingScore(input.energy) * 0.25 +
    (1 - ratingScore(input.soreness)) * 0.2 +
    (1 - ratingScore(input.stress)) * 0.15 +
    ratingScore(input.motivation) * 0.15;
  return Math.round(weighted * 100);
}

export function readinessStatus(score: number): ReadinessStatus {
  if (score >= 75) return "ready";
  if (score >= 50) return "steady";
  return "recover";
}

export function serializeReadiness(document: ReadinessDocument): ReadinessCheckIn {
  return {
    id: document.id,
    date: document.date,
    sleepHours: document.sleepHours,
    sleepQuality: document.sleepQuality,
    energy: document.energy,
    soreness: document.soreness,
    stress: document.stress,
    motivation: document.motivation,
    bodyWeightKg: document.bodyWeightKg,
    notes: document.notes,
    score: document.score,
    status: document.status,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}
