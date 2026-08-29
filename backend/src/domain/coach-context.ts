import type { ReadinessDocument } from "./readiness.js";
import type { Document } from "mongodb";
import {
  serializePlan,
  serializeWorkout,
  type PlannedWorkoutDocument,
  type WorkoutPlanDocument,
} from "./plans.js";
import { serializeProfile } from "./profiles.js";
import {
  serializeWorkoutSession,
  type WorkoutSessionDocument,
} from "./workouts.js";

export type CoachTrainingContextInput = {
  readiness: ReadinessDocument | null;
  activePlan: WorkoutPlanDocument | null;
  nextWorkout: PlannedWorkoutDocument | null;
  activeSession: WorkoutSessionDocument | null;
  recentSessions: WorkoutSessionDocument[];
  selectedWeekNumber?: number | null;
  selectedWeekWorkouts?: PlannedWorkoutDocument[];
  selectedWorkoutId?: string | null;
  canProposePlanChanges?: boolean;
  now?: Date;
};

function conciseReflection(reflection: string) {
  return reflection.replace(/\s+/g, " ").trim().slice(0, 300);
}

export function buildCoachProfileContext(profile: Document | null) {
  if (!profile) return null;
  const serialized = serializeProfile(profile);
  return {
    experienceLevel: serialized.experienceLevel,
    gender: serialized.gender,
    age: serialized.age,
    heightCm: serialized.heightCm,
    weightKg: serialized.weightKg,
    dietaryPreference: serialized.dietaryPreference,
    primaryGoal: serialized.primaryGoal,
    equipment: serialized.equipment,
    trainingDaysPerWeek: serialized.trainingDaysPerWeek,
    preferredSessionMinutes: serialized.preferredSessionMinutes,
    movementNotes: serialized.movementNotes,
    bodyConsiderations: serialized.bodyConsiderations,
  };
}

export function buildCoachTrainingContext({
  readiness,
  activePlan,
  nextWorkout,
  activeSession,
  recentSessions,
  selectedWeekNumber = null,
  selectedWeekWorkouts = [],
  selectedWorkoutId = null,
  canProposePlanChanges = false,
  now = new Date(),
}: CoachTrainingContextInput) {
  const serializedPlan = activePlan ? serializePlan(activePlan) : null;
  const serializedWorkout = nextWorkout ? serializeWorkout(nextWorkout) : null;
  const serializedSession = activeSession
    ? serializeWorkoutSession(activeSession, now)
    : null;
  const dataGaps: string[] = [];
  if (!readiness) dataGaps.push("No readiness check-in has been recorded.");
  if (!serializedPlan) dataGaps.push("No active training plan is available.");
  if (!serializedWorkout) dataGaps.push("No upcoming workout is available.");

  return {
    generatedAt: now.toISOString(),
    planAdjustmentCapability: canProposePlanChanges
      ? "proposal_with_member_confirmation"
      : "conversation_only",
    readiness: readiness ? {
      source: "self_reported" as const,
      date: readiness.date,
      score: readiness.score,
      status: readiness.status,
      sleepHours: readiness.sleepHours,
      sleepQuality: readiness.sleepQuality,
      energy: readiness.energy,
      soreness: readiness.soreness,
      stress: readiness.stress,
      motivation: readiness.motivation,
      bodyWeightKg: readiness.bodyWeightKg,
      notes: readiness.notes,
    } : null,
    activePlan: serializedPlan ? {
      id: serializedPlan.id,
      version: serializedPlan.version,
      revision: serializedPlan.revision,
      startDate: serializedPlan.startDate,
      title: serializedPlan.title,
      summary: serializedPlan.summary,
      experienceLevel: serializedPlan.experienceLevel,
      trainingPhase: serializedPlan.trainingPhase,
      durationWeeks: serializedPlan.durationWeeks,
      daysPerWeek: serializedPlan.daysPerWeek,
      rationale: serializedPlan.rationale,
      weeklyProgression: serializedPlan.weeklyProgression,
    } : null,
    selectedWeek: selectedWeekWorkouts.length > 0 ? {
      weekNumber: selectedWeekNumber,
      selectedWorkoutId,
      workouts: selectedWeekWorkouts.map((workout) => {
        const serialized = serializeWorkout(workout);
        return {
          id: serialized.id,
          name: serialized.name,
          focus: serialized.focus,
          scheduledFor: serialized.scheduledFor,
          estimatedMinutes: serialized.estimatedMinutes,
          status: serialized.status,
          exercises: serialized.exercises.map((exercise) => ({
            name: exercise.name,
            sets: exercise.sets,
            repRange: exercise.repRange,
            restSeconds: exercise.restSeconds,
            tempo: exercise.tempo,
            coachingNotes: exercise.coachingNotes,
          })),
        };
      }),
    } : null,
    nextWorkout: serializedWorkout ? {
      name: serializedWorkout.name,
      focus: serializedWorkout.focus,
      scheduledFor: serializedWorkout.scheduledFor,
      estimatedMinutes: serializedWorkout.estimatedMinutes,
      status: serializedWorkout.status,
      exercises: serializedWorkout.exercises.map((exercise) => ({
        name: exercise.name,
        sets: exercise.sets,
        repRange: exercise.repRange,
        restSeconds: exercise.restSeconds,
        tempo: exercise.tempo,
        coachingNotes: exercise.coachingNotes,
        loadAdjustmentPercent: exercise.loadAdjustmentPercent ?? 0,
      })),
    } : null,
    activeSession: serializedSession ? {
      name: serializedSession.name,
      status: serializedSession.status,
      startedAt: serializedSession.startedAt,
      durationSeconds: serializedSession.durationSeconds,
      totalSets: serializedSession.totalSets,
      totalVolumeKg: serializedSession.totalVolumeKg,
      exercises: serializedSession.exercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        prescribedSets: exercise.prescribedSets,
        repRange: exercise.repRange,
        completedSets: exercise.sets.length,
        latestSet: exercise.sets.at(-1) ?? null,
      })),
    } : null,
    recentCompletedSessions: recentSessions.slice(0, 5).map((session) => {
      const serialized = serializeWorkoutSession(session, now);
      return {
        name: serialized.name,
        completedAt: serialized.completedAt,
        perceivedEffort: serialized.perceivedEffort,
        durationSeconds: serialized.durationSeconds,
        totalSets: serialized.totalSets,
        totalVolumeKg: serialized.totalVolumeKg,
        reflection: conciseReflection(serialized.reflection),
      };
    }),
    dataGaps,
  };
}
