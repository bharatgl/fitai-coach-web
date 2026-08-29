import { MongoClient, ServerApiVersion, type Db } from "mongodb";
import { getConfig } from "./config.js";

declare global {
  var fitaiMongoClientPromise: Promise<MongoClient> | undefined;
}

function createClientPromise() {
  const { MONGODB_URI } = getConfig();
  const client = new MongoClient(MONGODB_URI, {
    maxPoolSize: 20,
    minPoolSize: 0,
    maxIdleTimeMS: 60_000,
    serverSelectionTimeoutMS: 8_000,
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  return client.connect();
}

export function getMongoClient(): Promise<MongoClient> {
  globalThis.fitaiMongoClientPromise ??= createClientPromise();
  return globalThis.fitaiMongoClientPromise;
}

export async function getDatabase(): Promise<Db> {
  const [client, config] = await Promise.all([
    getMongoClient(),
    Promise.resolve(getConfig()),
  ]);
  return client.db(config.MONGODB_DB);
}

export async function ensureIndexes() {
  const database = await getDatabase();
  await Promise.all([
    database.collection("appUsers").createIndex({ externalId: 1 }, { unique: true }),
    database.collection("profiles").createIndex({ userId: 1 }, { unique: true }),
    database.collection("providerSettings").createIndex({ userId: 1 }, { unique: true }),
    database.collection("readinessCheckIns").createIndex({ userId: 1, date: 1 }, { unique: true }),
    database.collection("readinessCheckIns").createIndex({ userId: 1, date: -1 }),
    database.collection("workoutPlans").createIndex({ userId: 1, status: 1 }),
    database.collection("workoutPlans").createIndex({ userId: 1, version: -1 }, { unique: true }),
    database.collection("plannedWorkouts").createIndex({ userId: 1, scheduledFor: 1 }),
    database.collection("plannedWorkouts").createIndex({ planId: 1, weekNumber: 1, dayOffset: 1 }, { unique: true }),
    database.collection("workoutSessions").createIndex({ userId: 1, startedAt: -1 }),
    database.collection("workoutSessions").createIndex({ userId: 1, plannedWorkoutId: 1 }, { unique: true }),
    database.collection("workoutSessions").createIndex(
      { activeSlot: 1 },
      { unique: true, partialFilterExpression: { activeSlot: { $type: "string" } } },
    ),
    database.collection("workoutSessions").createIndex({ userId: 1, status: 1, updatedAt: -1 }),
    database.collection("movementEvents").createIndex(
      { sessionId: 1, clientEventId: 1 },
      { unique: true },
    ),
    database.collection("movementEvents").createIndex({ userId: 1, sessionId: 1, occurredAt: 1 }),
    database.collection("coachMessages").createIndex({ userId: 1, createdAt: -1 }),
    database.collection("coachMessages").createIndex({ userId: 1, threadId: 1, createdAt: 1 }),
    database.collection("coachMessages").createIndex(
      { userId: 1, clientTurnId: 1, role: 1 },
      { unique: true, partialFilterExpression: { clientTurnId: { $type: "string" } } },
    ),
    database.collection("coachAttachments").createIndex({ id: 1 }, { unique: true }),
    database.collection("coachAttachments").createIndex({ userId: 1, messageId: 1 }),
    database.collection("coachAttachments").createIndex({ userId: 1, threadId: 1 }),
    database.collection("coachAttachments").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database.collection("coachThreads").createIndex({ userId: 1, updatedAt: -1 }),
    database.collection("coachThreads").createIndex({ userId: 1, archived: 1, pinned: -1, updatedAt: -1 }),
    database.collection("coachThreads").createIndex(
      { legacyUserId: 1 },
      { unique: true, partialFilterExpression: { legacyUserId: { $type: "string" } } },
    ),
    database.collection("planGenerationLocks").createIndex({ userId: 1 }, { unique: true }),
    database.collection("planGenerationLocks").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    database.collection("planAdjustmentProposals").createIndex({ id: 1 }, { unique: true }),
    database.collection("planAdjustmentProposals").createIndex({ userId: 1, planId: 1, status: 1, createdAt: -1 }),
    database.collection("planAdjustmentEvents").createIndex({ userId: 1, planId: 1, occurredAt: -1 }),
  ]);
}
