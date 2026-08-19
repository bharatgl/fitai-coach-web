import { MongoClient, ServerApiVersion } from "mongodb";

declare global {
  var fitaiAuthMongoClient: MongoClient | undefined;
}

export function getMongoClient() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is required for authentication");

  globalThis.fitaiAuthMongoClient ??= new MongoClient(uri, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 8_000,
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
  return globalThis.fitaiAuthMongoClient;
}
