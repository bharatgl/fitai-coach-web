import type { FastifyServerOptions } from "fastify";
import { getConfig } from "../config.js";
import { generateRequestId, redactPaths } from "./logging.js";

/**
 * Levels, quietest to loudest. `LOG_LEVEL` sets the floor: a line below it is
 * never written, so `debug` and `trace` cost nothing in production and appear in
 * the log file only when the level is lowered to admit them.
 */
export const logLevels = ["fatal", "error", "warn", "info", "debug", "trace"] as const;

export type LogLevel = (typeof logLevels)[number];

/**
 * Cloud Logging reads a `severity` string, not pino's numeric level. Emitting it
 * at the source means the Ops Agent has to lift one field rather than translate
 * numbers, and the same line stays readable when read locally with `docker logs`.
 *
 * https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#LogSeverity
 */
const severityByLevel: Record<LogLevel, string> = {
  trace: "DEBUG",
  debug: "DEBUG",
  info: "INFO",
  warn: "WARNING",
  error: "ERROR",
  fatal: "CRITICAL",
};

export function severityFor(level: string): string {
  return severityByLevel[level as LogLevel] ?? "DEFAULT";
}

/**
 * The shape every log line takes, in both containers:
 *
 *   { "severity": "INFO", "level": "info", "time": "...", "message": "...", ... }
 *
 * `severity`, `time`, and `message` are the fields Cloud Logging promotes out of
 * the JSON payload; everything else stays as structured `jsonPayload` fields, so
 * a query can filter on `jsonPayload.ai.feature` rather than grepping a blob.
 */
export function loggerOptions(): FastifyServerOptions["logger"] {
  const config = getConfig();
  if (config.NODE_ENV === "test") return false;

  return {
    level: config.LOG_LEVEL,
    messageKey: "message",
    // ISO-8601 rather than epoch milliseconds, so the agent can use the log's own
    // timestamp instead of the time it happened to be ingested.
    timestamp: () => `,"time":"${new Date().toISOString()}"`,
    formatters: {
      level: (label: string) => ({ severity: severityFor(label), level: label }),
    },
    redact: { paths: redactPaths, remove: true },
  };
}

export function serverOptions(): FastifyServerOptions {
  return {
    logger: loggerOptions(),
    // Adopts the caller's x-request-id when present, so one identifier spans the
    // browser, the frontend proxy, this service, and each model call.
    genReqId: generateRequestId,
    trustProxy: true,
    bodyLimit: 64 * 1024,
  };
}
