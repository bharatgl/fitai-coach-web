import type { DashboardResponse } from "@fitai/contracts";
import type { FastifyInstance } from "fastify";
import { authenticate } from "../auth.js";
import { getDatabase } from "../db.js";
import { syncAuthenticatedUser } from "../users.js";

export async function dashboardRoutes(app: FastifyInstance) {
  app.get("/v1/dashboard", async (request): Promise<DashboardResponse> => {
    const user = await authenticate(request);
    await syncAuthenticatedUser(user);
    const database = await getDatabase();

    const [profile, activePlan, upcomingWorkouts, recentSessions, messages] =
      await Promise.all([
        database
          .collection("profiles")
          .findOne({ userId: user.id }, { projection: { _id: 0 } }),
        database
          .collection("workoutPlans")
          .findOne(
            { userId: user.id, status: "active" },
            { projection: { _id: 0 }, sort: { createdAt: -1 } },
          ),
        database
          .collection("plannedWorkouts")
          .find(
            { userId: user.id, scheduledFor: { $gte: new Date() } },
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
      profile: profile as DashboardResponse["profile"],
      activePlan,
      upcomingWorkouts,
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
