import type { DashboardResponse, PlanHistoryEntry } from "@fitai/contracts";
import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth.js";
import { getDatabase } from "../db.js";
import {
  serializePlan,
  serializeWorkout,
  type PlannedWorkoutDocument,
  type WorkoutPlanDocument,
} from "../domain/plans.js";
import { serializeProfile } from "../domain/profiles.js";
import { serializeReadiness, type ReadinessDocument } from "../domain/readiness.js";
import {
  calculateWorkoutProgress,
  serializeWorkoutSession,
  type WorkoutSessionDocument,
} from "../domain/workouts.js";
import { syncAuthenticatedUser } from "../users.js";

function roundedAverage(values: number[]) {
  if (values.length === 0) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(1));
}

function summarizePlanHistory(
  plan: WorkoutPlanDocument,
  workouts: PlannedWorkoutDocument[],
  completedSessions: WorkoutSessionDocument[],
): PlanHistoryEntry {
  const sets = workouts.map((workout) =>
    workout.exercises.reduce((sum, exercise) => sum + exercise.sets, 0),
  );
  const efforts = completedSessions
    .map((session) => session.perceivedEffort)
    .filter((effort): effort is number => effort !== null);
  return {
    plan: serializePlan(plan),
    workoutCount: workouts.length,
    averageSessionMinutes: roundedAverage(workouts.map((workout) => workout.estimatedMinutes)),
    averageMovementsPerSession: roundedAverage(workouts.map((workout) => workout.exercises.length)),
    averageSetsPerSession: roundedAverage(sets),
    weeklyWorkingSets: Number(
      (sets.reduce((sum, value) => sum + value, 0) / Math.max(1, plan.durationWeeks)).toFixed(1),
    ),
    completedSessions: completedSessions.length,
    completionRate: workouts.length === 0
      ? 0
      : Math.round((completedSessions.length / workouts.length) * 100),
    totalVolumeKg: Number(
      completedSessions.reduce((sum, session) => sum + session.totalVolumeKg, 0).toFixed(1),
    ),
    averageEffort: efforts.length > 0 ? roundedAverage(efforts) : null,
  };
}

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/v1/dashboard", async (request): Promise<DashboardResponse> => {
    const user = await authenticate(request);
    await syncAuthenticatedUser(user);
    const database = await getDatabase();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [
      profile,
      latestReadiness,
      activePlan,
      activeSession,
      recentSessions,
      progressSessions,
      historyPlans,
      messages,
    ] =
      await Promise.all([
        database
          .collection("profiles")
          .findOne({ userId: user.id }, { projection: { _id: 0 } }),
        database
          .collection<ReadinessDocument>("readinessCheckIns")
          .findOne(
            { userId: user.id },
            { projection: { _id: 0 }, sort: { date: -1, updatedAt: -1 } },
          ),
        database
          .collection<WorkoutPlanDocument>("workoutPlans")
          .findOne(
            { userId: user.id, status: "active" },
            { projection: { _id: 0 }, sort: { createdAt: -1 } },
          ),
        database.collection<WorkoutSessionDocument>("workoutSessions").findOne(
          { userId: user.id, status: { $in: ["active", "paused"] } },
          { projection: { _id: 0 }, sort: { updatedAt: -1 } },
        ),
        database
          .collection<WorkoutSessionDocument>("workoutSessions")
          .find({ userId: user.id }, { projection: { _id: 0 } })
          .sort({ startedAt: -1 })
          .limit(12)
          .toArray(),
        database
          .collection<WorkoutSessionDocument>("workoutSessions")
          .find({ userId: user.id, status: "completed" }, { projection: { _id: 0 } })
          .sort({ completedAt: -1 })
          .limit(500)
          .toArray(),
        database
          .collection<WorkoutPlanDocument>("workoutPlans")
          .find({ userId: user.id }, { projection: { _id: 0 } })
          .sort({ version: -1 })
          .limit(20)
          .toArray(),
        database
          .collection("coachMessages")
          .find({ userId: user.id }, { projection: { _id: 0 } })
          .sort({ createdAt: -1 })
          .limit(20)
          .toArray(),
      ]);

    const historyWorkouts = historyPlans.length > 0
      ? await database
          .collection<PlannedWorkoutDocument>("plannedWorkouts")
          .find(
            { userId: user.id, planId: { $in: historyPlans.map((plan) => plan.id) } },
            { projection: { _id: 0 } },
          )
          .sort({ weekNumber: 1, dayOffset: 1 })
          .toArray()
      : [];
    const historyWorkoutsByPlan = new Map<string, PlannedWorkoutDocument[]>();
    for (const workout of historyWorkouts) {
      historyWorkoutsByPlan.set(workout.planId, [
        ...(historyWorkoutsByPlan.get(workout.planId) ?? []),
        workout,
      ]);
    }
    const completedSessionsByPlan = new Map<string, WorkoutSessionDocument[]>();
    for (const session of progressSessions) {
      completedSessionsByPlan.set(session.planId, [
        ...(completedSessionsByPlan.get(session.planId) ?? []),
        session,
      ]);
    }

    const [planWorkouts, upcomingWorkouts] = activePlan
      ? await Promise.all([
          database
            .collection<PlannedWorkoutDocument>("plannedWorkouts")
            .find(
              { userId: user.id, planId: activePlan.id },
              { projection: { _id: 0 } },
            )
            .sort({ weekNumber: 1, dayOffset: 1 })
            .limit(84)
            .toArray(),
          database
            .collection<PlannedWorkoutDocument>("plannedWorkouts")
            .find(
              {
                userId: user.id,
                planId: activePlan.id,
                status: { $in: ["planned", "in_progress"] },
                scheduledFor: { $gte: today },
              },
              { projection: { _id: 0 } },
            )
            .sort({ weekNumber: 1, dayOffset: 1 })
            .limit(84)
            .toArray(),
        ])
      : [[], []];

    return {
      profile: profile ? serializeProfile(profile) : null,
      latestReadiness: latestReadiness ? serializeReadiness(latestReadiness) : null,
      activePlan: activePlan ? serializePlan(activePlan) : null,
      planHistory: historyPlans.map((plan) => summarizePlanHistory(
        plan,
        historyWorkoutsByPlan.get(plan.id) ?? [],
        completedSessionsByPlan.get(plan.id) ?? [],
      )),
      planWorkouts: planWorkouts.map(serializeWorkout),
      upcomingWorkouts: upcomingWorkouts.map(serializeWorkout),
      activeSession: activeSession ? serializeWorkoutSession(activeSession) : null,
      recentSessions: recentSessions.map((session) => serializeWorkoutSession(session)),
      completedSessionDates: progressSessions
        .map((session) => session.completedAt)
        .filter((date): date is Date => date !== null)
        .map((date) => date.toISOString()),
      progress: calculateWorkoutProgress(progressSessions),
      recentMessages: messages.reverse().map((message) => ({
        id: String(message.id),
        role: message.role as "user" | "assistant",
        content: String(message.content),
        attachments: Array.isArray(message.attachments)
          ? message.attachments.map((attachment) => ({
            id: String(attachment.id),
            name: String(attachment.name),
            mimeType: attachment.mimeType as
              | "image/jpeg"
              | "image/png"
              | "image/webp"
              | "application/pdf",
            size: Number(attachment.size),
          }))
          : [],
        safetyCategory: message.safetyCategory as
          | "none"
          | "pain"
          | "medical"
          | "emergency",
        createdAt: new Date(message.createdAt as Date).toISOString(),
      })),
    };
  });
}
