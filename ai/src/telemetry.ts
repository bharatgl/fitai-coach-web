import type { AiFailureReason } from "./provider-error.js";
import type { AiUsage } from "./pricing.js";

export type AiFeature = "coach" | "plan" | "vision" | "bot";

/**
 * One record per model invocation, emitted whether the call succeeded or failed.
 *
 * Deliberately carries no member content: token counts, timings, and structural
 * validation paths only. The generated text itself already lives in its own
 * collection, which keeps one deletion path for account removal and keeps this
 * record safe to log.
 */
export type AiRunTelemetry = {
  /** Bumped when the shape changes, so old log lines stay parseable. */
  schema: "ai.run/1";
  runId: string;
  /** Joins this call to the HTTP request, the proxy, and the browser. */
  requestId: string | null;
  /** Pseudonymous, salted user hash. Never a raw id or email. */
  userRef: string | null;
  feature: AiFeature;
  provider: "google";
  model: string;
  startedAt: string;
  durationMs: number;
  outcome: "ok" | "failed";
  errorReason: AiFailureReason | null;
  usage: AiUsage | null;
  costMicroUsd: number | null;
  /** False when the model is absent from the pricing table. */
  pricingKnown: boolean;
  request: {
    temperature: number;
    maxOutputTokens: number;
    timeoutMs: number;
  };
  /**
   * Zod issue paths and codes on a schema violation. Structural only — it names
   * which field broke the contract, never the value that broke it.
   */
  validationIssues: Array<{ path: string; code: string }> | null;
  /**
   * A bounded excerpt of output that failed to parse as JSON. Only populated
   * when the caller opts in, since raw output can echo member context.
   */
  rawFailureExcerpt: string | null;
};

/**
 * Passed down from the HTTP layer so a model call can be tied back to the
 * request that caused it. `onRun` must never throw: telemetry is not allowed to
 * fail a user request.
 */
export type AiCallContext = {
  requestId?: string | null;
  userRef?: string | null;
  onRun?: (run: AiRunTelemetry) => void;
  /** Opt in to capturing unparseable output. Off unless explicitly enabled. */
  captureFailureExcerpt?: boolean;
};

export const failureExcerptLimit = 500;

export function emitRun(context: AiCallContext | undefined, run: AiRunTelemetry) {
  if (!context?.onRun) return;
  try {
    context.onRun(run);
  } catch {
    // A telemetry sink failure must never surface as a request failure.
  }
}
