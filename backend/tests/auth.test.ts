import assert from "node:assert/strict";
import test from "node:test";
import type { FastifyRequest } from "fastify";
import { SignJWT } from "jose";
import { authenticate } from "../src/auth.js";
import { resetConfigForTests } from "../src/config.js";

const secretValue = "test-secret-that-is-at-least-32-characters-long";

function configureTestEnvironment() {
  process.env.MONGODB_URI = "mongodb://127.0.0.1:27017";
  process.env.MONGODB_DB = "fitai_test";
  process.env.API_JWT_SECRET = secretValue;
  process.env.OPENAI_API_KEY = "test-key";
  process.env.NODE_ENV = "test";
  resetConfigForTests();
}

test("accepts a correctly scoped frontend token", async () => {
  configureTestEnvironment();
  const token = await new SignJWT({ email: "user@example.com", name: "Test User" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("user-123")
    .setIssuer("fitai-frontend")
    .setAudience("fitai-backend")
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(secretValue));

  const user = await authenticate({
    headers: { authorization: `Bearer ${token}` },
  } as FastifyRequest);

  assert.deepEqual(user, {
    id: "user-123",
    email: "user@example.com",
    name: "Test User",
  });
});

test("rejects requests without a bearer token", async () => {
  configureTestEnvironment();
  await assert.rejects(
    authenticate({ headers: {} } as FastifyRequest),
    /Authentication required/,
  );
});
