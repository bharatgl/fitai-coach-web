import type { DashboardResponse } from "@fitai/contracts";
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
          .collection("coachMessages")
          .find({ userId: user.id }, { projection: { _id: 0 } })
          .sort({ createdAt: -1 })
          .limit(20)
          .toArray(),
      ]);

    const upcomingWorkouts = activePlan
      ? await database
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
          .limit(28)
          .toArray()
      : [];

    return {
      profile: profile ? serializeProfile(profile) : null,
      latestReadiness: latestReadiness ? serializeReadiness(latestReadiness) : null,
      activePlan: activePlan ? serializePlan(activePlan) : null,
      upcomingWorkouts: upcomingWorkouts.map(serializeWorkout),
      activeSession: activeSession ? serializeWorkoutSession(activeSession) : null,
      recentSessions: recentSessions.map((session) => serializeWorkoutSession(session)),
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
