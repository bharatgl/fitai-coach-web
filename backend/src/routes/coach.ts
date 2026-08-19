import { randomUUID } from "node:crypto";
import { generateCoachResponse } from "@fitai/ai";
import type { CoachResponse } from "@fitai/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { getConfig } from "../config.js";
import { getDatabase } from "../db.js";
import { syncAuthenticatedUser } from "../users.js";

const coachInput = z.object({
  message: z.string().trim().min(1).max(2_000),
  sessionId: z.string().trim().min(1).max(100).optional(),
});

export async function coachRoutes(app: FastifyInstance) {
  app.post(
    "/v1/coach/messages",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (request): Promise<CoachResponse> => {
      const user = await authenticate(request);
      const input = coachInput.parse(request.body);
      await syncAuthenticatedUser(user);
      const database = await getDatabase();
      const now = new Date();

      const userMessage = {
        id: randomUUID(),
        userId: user.id,
        sessionId: input.sessionId ?? null,
        role: "user",
        content: input.message,
        safetyCategory: "none",
        createdAt: now,
      };
      await database.collection("coachMessages").insertOne(userMessage);

      const config = getConfig();
      const [profile, history] = await Promise.all([
        database
          .collection("profiles")
          .findOne({ userId: user.id }, { projection: { _id: 0 } }),
        database
          .collection("coachMessages")
          .find({ userId: user.id }, { projection: { _id: 0 } })
          .sort({ createdAt: -1 })
          .limit(12)
          .toArray(),
      ]);

      const result = await generateCoachResponse({
        apiKey: config.OPENAI_API_KEY,
        model: config.OPENAI_MODEL,
        userId: user.id,
        profile,
        message: input.message,
        history: history.reverse().map((message) => ({
          role: message.role === "assistant" ? "assistant" : "user",
          content: String(message.content),
        })),
      });

      const assistantMessage = {
        id: randomUUID(),
        userId: user.id,
        sessionId: input.sessionId ?? null,
        role: "assistant",
        content: result.reply,
        safetyCategory: result.safetyCategory,
        model: result.model,
        createdAt: new Date(),
      };
      await database.collection("coachMessages").insertOne(assistantMessage);

      return {
        message: {
          id: assistantMessage.id,
          role: "assistant",
          content: assistantMessage.content,
          safetyCategory: assistantMessage.safetyCategory,
          createdAt: assistantMessage.createdAt.toISOString(),
        },
        shouldPauseWorkout: result.shouldPauseWorkout,
        suggestedAdjustment: result.suggestedAdjustment,
      };
    },
  );
}
