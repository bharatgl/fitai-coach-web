import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";

/**
 * Fields that must never reach a log line.
 *
 * The rule for this project is that logs describe *shape* — counts, lengths,
 * durations, categories — and never member content. Coach messages, readiness
 * notes, movement notes, and camera frames are health data and are excluded by
 * construction rather than by remembering not to log them.
 */
export const redactPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["xi-api-key"]',
  'req.headers["x-simli-api-key"]',
  "apiKey",
  "*.apiKey",
  "GEMINI_API_KEY",
  "*.GEMINI_API_KEY",
  "dataBase64",
  "*.dataBase64",
  "imageBase64",
  "*.imageBase64",
  "token",
  "*.token",
  "sessionToken",
  "*.sessionToken",
  "signedUrl",
  "*.signedUrl",
  "email",
  "*.email",
];

/**
 * A caller-supplied request id is echoed back so one identifier spans browser,
 * proxy, and backend. It is validated rather than trusted: an unconstrained
 * header would let a caller inject newlines or unbounded text into our logs.
 */
const acceptableRequestId = /^[A-Za-z0-9_-]{8,64}$/;

export function normalizeRequestId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return acceptableRequestId.test(value) ? value : null;
}

export function generateRequestId(request: { headers: Record<string, unknown> }): string {
  return normalizeRequestId(request.headers["x-request-id"]) ?? randomUUID();
}

export function requestIdOf(request: FastifyRequest): string {
  return typeof request.id === "string" ? request.id : String(request.id);
}
