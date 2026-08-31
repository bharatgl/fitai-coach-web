import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getConfig } from "../config.js";
import { getDatabase } from "../db.js";

export type SystemRequestLogDocument = {
  id: string;
  userId: string;
  timestamp: Date;
  method: string;
  route: string;
  statusCode: number;
  durationMs: number;
  requestBytes: number;
  responseBytes: number;
  expiresAt: Date;
};

const requestUsers = new WeakMap<FastifyRequest, string>();
const requestStartedAt = new WeakMap<FastifyRequest, number>();
const responseSizes = new WeakMap<FastifyRequest, number>();

export function identifyTelemetryUser(request: FastifyRequest, userId: string) {
  requestUsers.set(request, userId);
}

function byteLength(value: unknown) {
  if (value == null) return 0;
  if (typeof value === "string") return Buffer.byteLength(value);
  if (Buffer.isBuffer(value)) return value.byteLength;
  if (value instanceof Uint8Array) return value.byteLength;
  try {
    return Buffer.byteLength(JSON.stringify(value));
  } catch {
    return 0;
  }
}

function routeName(request: FastifyRequest) {
  return request.routeOptions?.url || request.url.split("?")[0] || "/unknown";
}

export function registerRequestTelemetry(app: FastifyInstance) {
  app.addHook("onRequest", async (request) => {
    requestStartedAt.set(request, performance.now());
  });

  app.addHook("onSend", async (request, _reply, payload) => {
    responseSizes.set(request, byteLength(payload));
    return payload;
  });

  app.addHook("onResponse", async (request, reply: FastifyReply) => {
    const userId = requestUsers.get(request);
    if (!userId || request.method === "OPTIONS") return;
    const route = routeName(request);
    if (route === "/v1/operations/dashboard") return;

    const config = getConfig();
    const timestamp = new Date();
    const expiresAt = new Date(timestamp);
    expiresAt.setUTCDate(expiresAt.getUTCDate() + config.OPS_TELEMETRY_RETENTION_DAYS);
    const startedAt = requestStartedAt.get(request) ?? performance.now();
    const document: SystemRequestLogDocument = {
      id: String(request.id),
      userId,
      timestamp,
      method: request.method,
      route,
      statusCode: reply.statusCode,
      durationMs: Math.max(0, Number((performance.now() - startedAt).toFixed(1))),
      requestBytes: byteLength(request.body),
      responseBytes: responseSizes.get(request) ?? 0,
      expiresAt,
    };

    try {
      await (await getDatabase())
        .collection<SystemRequestLogDocument>("systemRequestLogs")
        .insertOne(document);
    } catch (error) {
      request.log.warn({ error }, "Could not persist request telemetry");
    }
  });
}
