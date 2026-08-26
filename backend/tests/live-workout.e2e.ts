import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { getConfig } from "../src/config.js";
import { getDatabase, getMongoClient } from "../src/db.js";
import type { PlannedWorkoutDocument } from "../src/domain/plans.js";

const config = getConfig();
const database = await getDatabase();
const userId = `e2e-workout-${Date.now()}`;
const apiUrl = process.env.E2E_API_URL ?? "http://localhost:4000";
const now = new Date();
const plannedWorkoutId = randomUUID();
const futureWorkoutId = randomUUID();
const planId = randomUUID();

function plannedWorkout(
  id: string,
  scheduledFor: Date,
  exerciseId: string,
  exerciseName: string,
): PlannedWorkoutDocument {
  return {
    id,
    planId,
    userId,
    weekNumber: id === plannedWorkoutId ? 1 : 2,
    dayOffset: 0,
    name: id === plannedWorkoutId ? "E2E Strength A" : "E2E Strength B",
    focus: "Safe full-body strength",
    scheduledFor,
    estimatedMinutes: 30,
    status: "planned",
    createdAt: now,
    exercises: [
      {
        exerciseId,
        name: exerciseName,
        video: null,
        sets: 1,
        repRange: "8-10 reps",
        restSeconds: 60,
        tempo: null,
        coachingNotes: "Move with control.",
      },
    ],
  };
}

async function api<T>(path: string, token: string, method = "GET", body?: unknown) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const result = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(`${method} ${path} failed (${response.status}): ${result.error}`);
  }
  return result;
}

try {
  await database.collection("profiles").insertOne({
    userId,
    email: `${userId}@example.invalid`,
    displayName: "FitAI Workout E2E",
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
  await database.collection<PlannedWorkoutDocument>("plannedWorkouts").insertMany([
    plannedWorkout(
      plannedWorkoutId,
      new Date(now.getTime() + 60_000),
      "bodyweight-squat",
      "Bodyweight Squat",
    ),
    plannedWorkout(
      futureWorkoutId,
      new Date(now.getTime() + 7 * 24 * 60 * 60_000),
      "goblet-squat",
      "Goblet Squat",
    ),
  ]);

  const token = await new SignJWT({
    email: `${userId}@example.invalid`,
    name: "FitAI Workout E2E",
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer("fitai-frontend")
    .setAudience("fitai-backend")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(config.API_JWT_SECRET));

  const started = await api<{ session: { id: string } }>(
    `/v1/workouts/${plannedWorkoutId}/start`,
    token,
    "POST",
    {},
  );
  await api(`/v1/workout-sessions/${started.session.id}/status`, token, "PATCH", {
    action: "pause",
  });
  await api(`/v1/workout-sessions/${started.session.id}/status`, token, "PATCH", {
    action: "resume",
  });
  const substituted = await api<{
    session: { exercises: Array<{ exerciseId: string }> };
  }>(`/v1/workout-sessions/${started.session.id}/substitutions`, token, "POST", {
    exerciseId: "bodyweight-squat",
  });
  const exerciseId = substituted.session.exercises[0]?.exerciseId;
  if (!exerciseId || exerciseId === "bodyweight-squat") {
    throw new Error("The live session did not persist a real exercise substitution");
  }
  await api(`/v1/workout-sessions/${started.session.id}/sets`, token, "POST", {
    exerciseId,
    reps: 10,
    loadKg: 10,
    effortRpe: 6,
  });
  const finished = await api<{
    session: { status: string; totalSets: number; totalVolumeKg: number };
  }>(`/v1/workout-sessions/${started.session.id}/finish`, token, "POST", {
    reflection: "E2E workout completed with controlled effort.",
    perceivedEffort: 6,
  });
  if (
    finished.session.status !== "completed" ||
    finished.session.totalSets !== 1 ||
    finished.session.totalVolumeKg !== 100
  ) {
    throw new Error("The completed session totals were not persisted correctly");
  }

  const dashboard = await api<{
    activeSession: unknown;
    progress: { completedSessions: number; completedSets: number };
  }>("/v1/dashboard", token);
  if (
    dashboard.activeSession !== null ||
    dashboard.progress.completedSessions !== 1 ||
    dashboard.progress.completedSets !== 1
  ) {
    throw new Error("The dashboard did not recalculate workout progress");
  }

  const future = await database.collection("plannedWorkouts").findOne({
    userId,
    id: futureWorkoutId,
  });
  const adjustment = future?.exercises?.[0]?.loadAdjustmentPercent;
  if (adjustment !== 5) {
    throw new Error(`Expected a +5% future load adjustment, received ${adjustment}`);
  }

  console.log(
    JSON.stringify({
      status: "passed",
      sessionId: started.session.id,
      completedSets: dashboard.progress.completedSets,
      futureLoadAdjustmentPercent: adjustment,
    }),
  );
} finally {
  await Promise.all([
    database.collection("appUsers").deleteMany({ externalId: userId }),
    database.collection("profiles").deleteMany({ userId }),
    database.collection("plannedWorkouts").deleteMany({ userId }),
    database.collection("workoutSessions").deleteMany({ userId }),
  ]);
  const client = await getMongoClient();
  await client.close();
}
