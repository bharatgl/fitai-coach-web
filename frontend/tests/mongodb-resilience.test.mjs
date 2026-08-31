import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("shares MongoDB startup and recovers after a failed slow connection", async () => {
  const source = await readFile(
    new URL("../lib/mongodb.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /fitaiAuthMongoClientPromise: Promise<MongoClient>/);
  assert.match(source, /serverSelectionTimeoutMS: 30_000/);
  assert.match(source, /connectTimeoutMS: 30_000/);
  assert.match(source, /const connection = client\.connect\(\)/);
  assert.match(source, /fitaiAuthMongoClientPromise === reusableConnection/);
  assert.match(source, /fitaiAuthMongoClientPromise = undefined/);
  assert.doesNotMatch(source, /fitaiAuthMongoClient \?\?=/);
});
