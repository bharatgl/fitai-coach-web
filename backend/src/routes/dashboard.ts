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
import { syncAuthenticatedUser } from "../users.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/v1/dashboard", async (request): Promise<DashboardResponse> => {
    const user = await authenticate(request);
    await syncAuthenticatedUser(user);
    const database = await getDatabase();
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    const [profile, activePlan, upcomingWorkouts, recentSessions, messages] =
      await Promise.all([
        database
          .collection("profiles")
          .findOne({ userId: user.id }, { projection: { _id: 0 } }),
        database
          .collection<WorkoutPlanDocument>("workoutPlans")
          .findOne(
            { userId: user.id, status: "active" },
            { projection: { _id: 0 }, sort: { createdAt: -1 } },
          ),
        database
          .collection<PlannedWorkoutDocument>("plannedWorkouts")
          .find(
            { userId: user.id, scheduledFor: { $gte: today } },
            { projection: { _id: 0 } },
          )
          .sort({ scheduledFor: 1 })
          .limit(14)
          .toArray(),
        database
          .collection("workoutSessions")
          .find({ userId: user.id }, { projection: { _id: 0 } })
          .sort({ startedAt: -1 })
          .limit(12)
          .toArray(),
        database
          .collection("coachMessages")
          .find({ userId: user.id }, { projection: { _id: 0 } })
          .sort({ createdAt: -1 })
          .limit(20)
          .toArray(),
      ]);

    return {
      profile: profile ? serializeProfile(profile) : null,
      activePlan: activePlan ? serializePlan(activePlan) : null,
      upcomingWorkouts: upcomingWorkouts.map(serializeWorkout),
      recentSessions,
      recentMessages: messages.reverse().map((message) => ({
        id: String(message.id),
        role: message.role as "user" | "assistant",
        content: String(message.content),
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
