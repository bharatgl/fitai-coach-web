import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateReadinessScore,
  readinessStatus,
  serializeReadiness,
} from "../src/domain/readiness.js";

test("scores self-reported readiness with soreness and stress inverted", () => {
  assert.equal(calculateReadinessScore({
    sleepQuality: 5,
    energy: 5,
    soreness: 1,
    stress: 1,
    motivation: 5,
  }), 100);
  assert.equal(calculateReadinessScore({
    sleepQuality: 3,
    energy: 3,
    soreness: 3,
    stress: 3,
    motivation: 3,
  }), 50);
  assert.equal(calculateReadinessScore({
    sleepQuality: 1,
    energy: 1,
    soreness: 5,
    stress: 5,
    motivation: 1,
  }), 0);
});

test("maps readiness scores to conservative training bands", () => {
  assert.equal(readinessStatus(75), "ready");
  assert.equal(readinessStatus(74), "steady");
  assert.equal(readinessStatus(50), "steady");
  assert.equal(readinessStatus(49), "recover");
});

test("serializes a readiness check-in without its account identifier", () => {
  const serialized = serializeReadiness({
    id: "check-in",
    userId: "private-user-id",
    date: "2026-08-27",
    sleepHours: 7.5,
    sleepQuality: 4,
    energy: 4,
    soreness: 2,
    stress: 2,
    motivation: 5,
    bodyWeightKg: 82.4,
    notes: "Felt recovered",
    score: 81,
    status: "ready",
    createdAt: new Date("2026-08-27T05:00:00.000Z"),
    updatedAt: new Date("2026-08-27T05:00:00.000Z"),
  });

  assert.equal(serialized.score, 81);
  assert.equal("userId" in serialized, false);
  assert.equal(serialized.updatedAt, "2026-08-27T05:00:00.000Z");
});
