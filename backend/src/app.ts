import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { AiProviderError } from "@fitai/ai";
import Fastify from "fastify";
import { ZodError } from "zod";
import { getConfig } from "./config.js";
import { ensureIndexes, getDatabase } from "./db.js";
import { coachRoutes } from "./routes/coach.js";
import { botRoutes } from "./routes/bots.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { exerciseRoutes } from "./routes/exercises.js";
import { profileRoutes } from "./routes/profile.js";
import { providerSettingsRoutes } from "./routes/provider-settings.js";
import { readinessRoutes } from "./routes/readiness.js";
import { planRoutes } from "./routes/plans.js";
import { workoutRoutes } from "./routes/workouts.js";
import { operationsRoutes } from "./routes/operations.js";
import { registerRequestTelemetry } from "./services/request-telemetry.js";

export async function buildApp() {
  const config = getConfig();
  const app = Fastify({
    logger: config.NODE_ENV !== "test",
    trustProxy: true,
    bodyLimit: 64 * 1024,
  });

  await app.register(helmet);
  await app.register(rateLimit, { max: 120, timeWindow: "1 minute" });
  registerRequestTelemetry(app);

  app.get("/health/live", async () => ({ status: "ok" }));
  app.get("/health/ready", async (_request, reply) => {
    const database = await getDatabase();
    await database.command({ ping: 1 });
    return reply.send({ status: "ready" });
  });

  await app.register(profileRoutes);
  await app.register(botRoutes);
  await app.register(providerSettingsRoutes);
  await app.register(exerciseRoutes);
  await app.register(readinessRoutes);
  await app.register(planRoutes);
  await app.register(workoutRoutes);
  await app.register(dashboardRoutes);
  await app.register(operationsRoutes);
  await app.register(coachRoutes);

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: "Invalid request",
        issues: error.issues.map((issue) => ({
          path: issue.path.join("."),
          message: issue.message,
        })),
      });
    }

    if (error instanceof AiProviderError) {
      return reply.code(error.statusCode).send({ error: error.message });
    }

    const statusCode =
      typeof error === "object" &&
      error !== null &&
      "statusCode" in error &&
      typeof error.statusCode === "number"
        ? error.statusCode
        : 500;
    const message = error instanceof Error ? error.message : "Request failed";
    const retryAfterSeconds = typeof error === "object" && error !== null &&
        "retryAfterSeconds" in error && Number.isFinite(Number(error.retryAfterSeconds))
      ? Math.max(1, Math.ceil(Number(error.retryAfterSeconds)))
      : null;
    if (statusCode === 429 && retryAfterSeconds) {
      reply.header("retry-after", String(retryAfterSeconds));
    }
    return reply.code(statusCode).send({
      error: statusCode >= 500 ? "Internal server error" : message,
    });
  });

  app.addHook("onReady", ensureIndexes);
  return app;
}
