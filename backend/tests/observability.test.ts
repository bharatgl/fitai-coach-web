import assert from "node:assert/strict";
import test from "node:test";
import { resetConfigForTests } from "../src/config.js";
import {
  generateRequestId,
  normalizeRequestId,
  redactPaths,
} from "../src/observability/logging.js";
import { userRef } from "../src/observability/ai-telemetry.js";

const secretValue = "test-secret-that-is-at-least-32-characters-long";

function configureTestEnvironment() {
  process.env.MONGODB_URI = "mongodb://127.0.0.1:27017";
  process.env.MONGODB_DB = "fitai_test";
  process.env.API_JWT_SECRET = secretValue;
  process.env.GEMINI_API_KEY = "test-key";
  process.env.NODE_ENV = "test";
  delete process.env.LOG_SALT;
  resetConfigForTests();
}

test("adopts a caller-supplied request id so one identifier spans the tiers", () => {
  const id = generateRequestId({ headers: { "x-request-id": "abc123def456" } });
  assert.equal(id, "abc123def456");
});

test("rejects a request id that could inject content into a log line", () => {
  for (const hostile of [
    "short",
    "has spaces",
    'quote"break',
    "line\nbreak",
    "x".repeat(65),
    123,
    null,
  ]) {
    assert.equal(normalizeRequestId(hostile), null, `should reject ${JSON.stringify(hostile)}`);
  }
});

test("mints an id when the caller supplies none", () => {
  const id = generateRequestId({ headers: {} });
  assert.match(id, /^[0-9a-f-]{36}$/);
});

test("redacts credentials and payloads that must never reach a log line", () => {
  for (const path of [
    "req.headers.authorization",
    "req.headers.cookie",
    "*.apiKey",
    "*.dataBase64",
    "*.imageBase64",
    "*.token",
    "*.email",
  ]) {
    assert.ok(redactPaths.includes(path), `${path} must be redacted`);
  }
});

test("logs a stable pseudonym rather than the account id", () => {
  configureTestEnvironment();
  const first = userRef("user-123");
  const second = userRef("user-123");

  assert.equal(first, second, "the same member must resolve to the same reference");
  assert.notEqual(first, userRef("user-456"));
  assert.doesNotMatch(first, /user-123/);
  assert.match(first, /^[0-9a-f]{16}$/);
});

test("a pseudonym cannot be reproduced without the server secret", () => {
  configureTestEnvironment();
  const withDefaultSalt = userRef("user-123");

  process.env.LOG_SALT = "a-different-log-salt-value";
  resetConfigForTests();
  assert.notEqual(userRef("user-123"), withDefaultSalt);

  delete process.env.LOG_SALT;
  resetConfigForTests();
});
