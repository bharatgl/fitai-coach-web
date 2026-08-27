import { randomUUID } from "node:crypto";
import type {
  ReadinessCheckInResponse,
  SaveReadinessCheckInRequest,
} from "@fitai/contracts";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../auth.js";
import { getDatabase } from "../db.js";
import {
  calculateReadinessScore,
  readinessStatus,
  serializeReadiness,
  type ReadinessDocument,
} from "../domain/readiness.js";
import { syncAuthenticatedUser } from "../users.js";

const calendarDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Date must be a valid calendar date");

const readinessInput = z.object({
  date: calendarDate,
  sleepHours: z.number().min(0).max(16),
  sleepQuality: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5),
  soreness: z.number().int().min(1).max(5),
  stress: z.number().int().min(1).max(5),
  motivation: z.number().int().min(1).max(5),
  bodyWeightKg: z.number().min(30).max(350).nullable(),
  notes: z.string().trim().max(1_000),
}).strict().refine(({ date }) => {
  const now = new Date();
  const serverDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const requestedDay = new Date(`${date}T00:00:00.000Z`).getTime();
  return Math.abs(requestedDay - serverDay) <= 24 * 60 * 60 * 1_000;
}, { path: ["date"], message: "Date must match the current local day" });

const readinessQuery = z.object({ date: calendarDate.optional() });

export async function readinessRoutes(app: FastifyInstance) {
  app.get("/v1/readiness", async (request): Promise<ReadinessCheckInResponse> => {
    const user = await authenticate(request);
    const { date } = readinessQuery.parse(request.query);
    const database = await getDatabase();
    const checkIn = await database.collection<ReadinessDocument>("readinessCheckIns").findOne(
      { userId: user.id, ...(date ? { date } : {}) },
      { projection: { _id: 0 }, sort: { date: -1, updatedAt: -1 } },
    );
    return { checkIn: checkIn ? serializeReadiness(checkIn) : null };
  });

  app.put(
    "/v1/readiness",
    { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
    async (request): Promise<ReadinessCheckInResponse> => {
      const user = await authenticate(request);
      const input = readinessInput.parse(request.body) as SaveReadinessCheckInRequest;
      await syncAuthenticatedUser(user);
      const database = await getDatabase();
      const now = new Date();
      const score = calculateReadinessScore(input);
      const collection = database.collection<ReadinessDocument>("readinessCheckIns");

      await collection.updateOne(
        { userId: user.id, date: input.date },
        {
          $set: { ...input, score, status: readinessStatus(score), updatedAt: now },
          $setOnInsert: { id: randomUUID(), userId: user.id, createdAt: now },
        },
        { upsert: true },
      );
      const checkIn = await collection.findOne(
        { userId: user.id, date: input.date },
        { projection: { _id: 0 } },
      );
      return { checkIn: checkIn ? serializeReadiness(checkIn) : null };
    },
  );
}
