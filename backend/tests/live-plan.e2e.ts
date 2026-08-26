import { SignJWT } from "jose";
import { getConfig } from "../src/config.js";
import { getDatabase, getMongoClient } from "../src/db.js";

const config = getConfig();
const database = await getDatabase();
const userId = `e2e-adaptive-plan-${Date.now()}`;
const apiUrl = process.env.E2E_API_URL ?? "http://localhost:4000";
const now = new Date();

try {
  await database.collection("profiles").insertOne({
    userId,
    email: `${userId}@example.invalid`,
    displayName: "FitAI E2E",
    experienceLevel: "beginner",
    dietaryPreference: "no_preference",
    primaryGoal: "Build general strength safely",
    equipment: ["dumbbells"],
    trainingDaysPerWeek: 2,
    preferredSessionMinutes: 35,
    movementNotes: "",
    onboardingCompletedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const token = await new SignJWT({
    email: `${userId}@example.invalid`,
    name: "FitAI E2E",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer("fitai-frontend")
    .setAudience("fitai-backend")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(config.API_JWT_SECRET));

  const response = await fetch(`${apiUrl}/v1/plans/generate`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: "{}",
  });
  const body = (await response.json()) as {
    error?: string;
    plan?: { id: string; version: number };
    workouts?: unknown[];
  };

  if (response.status !== 201 || !body.plan || body.workouts?.length !== 8) {
    throw new Error(
      `Live plan generation failed (${response.status}): ${body.error ?? "unexpected response"}`,
    );
  }

  const [persistedPlan, persistedWorkouts] = await Promise.all([
    database.collection("workoutPlans").findOne({ userId, id: body.plan.id }),
    database.collection("plannedWorkouts").countDocuments({ userId, planId: body.plan.id }),
  ]);
  if (!persistedPlan || persistedWorkouts !== 8) {
    throw new Error("Generated plan was not persisted completely");
  }

  console.log(
    JSON.stringify({
      status: "passed",
      planVersion: body.plan.version,
      workoutCount: body.workouts.length,
    }),
  );
} finally {
  await Promise.all([
    database.collection("appUsers").deleteMany({ externalId: userId }),
    database.collection("profiles").deleteMany({ userId }),
    database.collection("workoutPlans").deleteMany({ userId }),
    database.collection("plannedWorkouts").deleteMany({ userId }),
    database.collection("planGenerationLocks").deleteMany({ userId }),
  ]);
  const client = await getMongoClient();
  await client.close();
}
