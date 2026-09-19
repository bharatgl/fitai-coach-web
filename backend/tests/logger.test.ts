import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";
import Fastify from "fastify";
import { resetConfigForTests } from "../src/config.js";
import { loggerOptions, severityFor } from "../src/observability/logger.js";

function configureTestEnvironment(level?: string) {
  process.env.MONGODB_URI = "mongodb://127.0.0.1:27017";
  process.env.MONGODB_DB = "fitai_test";
  process.env.API_JWT_SECRET = "test-secret-that-is-at-least-32-characters-long";
  process.env.GEMINI_API_KEY = "test-key";
  // The real logger options are disabled under NODE_ENV=test, so these tests use
  // development to exercise the configuration that actually ships.
  process.env.NODE_ENV = "development";
  if (level) process.env.LOG_LEVEL = level;
  else delete process.env.LOG_LEVEL;
  resetConfigForTests();
}

function restoreTestEnvironment() {
  process.env.NODE_ENV = "test";
  delete process.env.LOG_LEVEL;
  resetConfigForTests();
}

function captureLogs(level?: string) {
  configureTestEnvironment(level);
  const lines: Array<Record<string, unknown>> = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(JSON.parse(String(chunk)));
      done();
    },
  });

  const options = loggerOptions();
  assert.notEqual(options, false, "logger must be configured outside tests");
  const app = Fastify({
    logger: { ...(options as object), stream },
  });
  return { app, lines };
}

test("maps every level to a Cloud Logging severity", () => {
  assert.equal(severityFor("trace"), "DEBUG");
  assert.equal(severityFor("debug"), "DEBUG");
  assert.equal(severityFor("info"), "INFO");
  assert.equal(severityFor("warn"), "WARNING");
  assert.equal(severityFor("error"), "ERROR");
  assert.equal(severityFor("fatal"), "CRITICAL");
  assert.equal(severityFor("something-else"), "DEFAULT");
});

test("emits the field names Cloud Logging promotes out of the payload", async (context) => {
  const { app, lines } = captureLogs();
  context.after(async () => {
    await app.close();
    restoreTestEnvironment();
  });

  app.log.warn({ ai: { feature: "coach" } }, "ai.run");

  const line = lines.find((entry) => entry.message === "ai.run")!;
  assert.equal(line.severity, "WARNING");
  assert.equal(line.level, "warn");
  assert.match(String(line.time), /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  // Structured context survives as a nested field, so a query can filter on
  // jsonPayload.ai.feature rather than parsing a string.
  assert.deepEqual(line.ai, { feature: "coach" });
  // pino's numeric level and msg key must not leak through.
  assert.equal(line.msg, undefined);
  assert.equal(typeof line.level, "string");
});

test("debug is withheld at the default level", async (context) => {
  const { app, lines } = captureLogs();
  context.after(async () => {
    await app.close();
    restoreTestEnvironment();
  });

  app.log.debug("quiet");
  app.log.info("loud");

  assert.equal(lines.some((entry) => entry.message === "quiet"), false);
  assert.equal(lines.some((entry) => entry.message === "loud"), true);
});

test("debug is recorded once the level is lowered to admit it", async (context) => {
  const { app, lines } = captureLogs("debug");
  context.after(async () => {
    await app.close();
    restoreTestEnvironment();
  });

  app.log.debug("now visible");

  const line = lines.find((entry) => entry.message === "now visible")!;
  assert.equal(line.severity, "DEBUG");
  assert.equal(line.level, "debug");
});

test("trace stays withheld at debug level", async (context) => {
  const { app, lines } = captureLogs("debug");
  context.after(async () => {
    await app.close();
    restoreTestEnvironment();
  });

  app.log.trace("deepest");

  assert.equal(lines.some((entry) => entry.message === "deepest"), false);
});
