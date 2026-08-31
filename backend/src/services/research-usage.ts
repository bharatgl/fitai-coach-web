import { randomUUID } from "node:crypto";
import type { Db } from "mongodb";

type ResearchUsageDocument = {
  _id: string;
  date: string;
  count: number;
  lastRequestId: string;
  updatedAt: Date;
  expiresAt: Date;
};

export class ResearchDailyLimitError extends Error {
  constructor(readonly limit: number) {
    super(`Daily live research limit (${limit}) reached. It resets at 00:00 UTC to protect your Google Cloud credits.`);
    this.name = "ResearchDailyLimitError";
  }
}

export function researchUsageWindow(now = new Date()) {
  const date = now.toISOString().slice(0, 10);
  const expiresAt = new Date(`${date}T00:00:00.000Z`);
  expiresAt.setUTCDate(expiresAt.getUTCDate() + 8);
  return { id: `global:${date}`, date, expiresAt };
}

export async function consumeResearchUsage(database: Db, limit: number, now = new Date()) {
  const window = researchUsageWindow(now);
  const requestId = randomUUID();
  const collection = database.collection<ResearchUsageDocument>("researchUsage");
  const document = await collection.findOneAndUpdate(
    { _id: window.id },
    [{
      $set: {
        date: window.date,
        expiresAt: window.expiresAt,
        updatedAt: now,
        count: {
          $cond: [
            { $lt: [{ $ifNull: ["$count", 0] }, limit] },
            { $add: [{ $ifNull: ["$count", 0] }, 1] },
            { $ifNull: ["$count", 0] },
          ],
        },
        lastRequestId: {
          $cond: [
            { $lt: [{ $ifNull: ["$count", 0] }, limit] },
            requestId,
            { $ifNull: ["$lastRequestId", ""] },
          ],
        },
      },
    }],
    { upsert: true, returnDocument: "after" },
  );

  if (!document || document.lastRequestId !== requestId) {
    throw new ResearchDailyLimitError(limit);
  }
  return { used: document.count, remaining: Math.max(0, limit - document.count) };
}
