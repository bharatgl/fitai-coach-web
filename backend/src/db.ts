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
    database.collection("exercises").createIndex({ slug: 1 }, { unique: true }),
    database.collection("workoutPlans").createIndex({ userId: 1, status: 1 }),
    database.collection("plannedWorkouts").createIndex({ userId: 1, scheduledFor: 1 }),
    database.collection("workoutSessions").createIndex({ userId: 1, startedAt: -1 }),
    database.collection("coachMessages").createIndex({ userId: 1, createdAt: -1 }),
  ]);
}
