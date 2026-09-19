import { createHmac } from "node:crypto";
import type { AiCallContext, AiRunTelemetry } from "@fitai/ai";
import type { FastifyRequest } from "fastify";
import { getConfig } from "../config.js";
import { requestIdOf } from "./logging.js";

/**
 * A stable pseudonym for a member, so runs can be joined together during
 * debugging without putting an account id or an email into the logs. Keyed on a
 * server-only secret, so the mapping cannot be reproduced from the log store
 * alone.
 */
export function userRef(userId: string): string {
  const config = getConfig();
  return createHmac("sha256", config.LOG_SALT ?? config.API_JWT_SECRET)
    .update(userId)
    .digest("hex")
    .slice(0, 16);
}

/**
 * Builds the context handed to the AI package for one request. The sink writes
 * a single `ai.run` line per model call — success or failure — carrying timings,
 * token counts, and cost, but no generated content.
 */
export function aiCallContext(
  request: FastifyRequest,
  user?: { id: string } | null,
): AiCallContext {
  const config = getConfig();
  return {
    requestId: requestIdOf(request),
    userRef: user ? userRef(user.id) : null,
    captureFailureExcerpt: config.AI_LOG_FAILURE_EXCERPT,
    onRun: (run: AiRunTelemetry) => {
      request.log.info({ ai: run }, "ai.run");
    },
  };
}
