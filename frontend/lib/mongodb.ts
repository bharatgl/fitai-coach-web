import { MongoClient, ServerApiVersion } from "mongodb";

declare global {
  var fitaiAuthMongoClientPromise: Promise<MongoClient> | undefined;
}

const mongoClientOptions = {
  maxPoolSize: 10,
  // Atlas discovery, DNS, and TLS negotiation can exceed a few seconds on a
  // cold or slow connection. Keep the wait bounded without failing too early.
  serverSelectionTimeoutMS: 30_000,
  connectTimeoutMS: 30_000,
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
} as const;

export function getMongoClient(): Promise<MongoClient> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required for authentication");

  if (!globalThis.fitaiAuthMongoClientPromise) {
    const client = new MongoClient(uri, mongoClientOptions);
    const connection = client.connect();

    // All concurrent Auth.js calls await the same connection attempt. If it
    // fails, discard both the closed topology and the rejected promise so the
    // next request can establish a fresh client instead of failing forever.
    const reusableConnection = connection.catch(async (error: unknown) => {
      if (globalThis.fitaiAuthMongoClientPromise === reusableConnection) {
        globalThis.fitaiAuthMongoClientPromise = undefined;
      }
      await client.close().catch(() => undefined);
      throw error;
    });

    globalThis.fitaiAuthMongoClientPromise = reusableConnection;
  }

  return globalThis.fitaiAuthMongoClientPromise;
}
