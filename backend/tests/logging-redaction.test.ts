import assert from "node:assert/strict";
import { Writable } from "node:stream";
import test from "node:test";
import Fastify from "fastify";
import { generateRequestId, redactPaths } from "../src/observability/logging.js";

/**
 * Builds a Fastify instance wired exactly as `buildApp` wires it, but writing to
 * a capture stream and without the database-backed routes. This exercises the
 * real pino configuration: an invalid redact path throws at construction, and a
 * mis-specified one silently lets data through.
 */
function captureLogs() {
  const lines: Array<Record<string, unknown>> = [];
  const stream = new Writable({
    write(chunk, _encoding, done) {
      lines.push(JSON.parse(String(chunk)));
      done();
    },
  });

  const app = Fastify({
    logger: {
      level: "info",
      redact: { paths: redactPaths, remove: true },
      stream,
    },
    genReqId: generateRequestId,
  });

  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  return { app, lines };
}

test("echoes the request id the caller supplied and mints one when absent", async (context) => {
  const { app } = captureLogs();
  context.after(() => app.close());
  app.get("/probe", async () => ({ ok: true }));

  const supplied = await app.inject({
    method: "GET",
    url: "/probe",
    headers: { "x-request-id": "abc123def456" },
  });
  const minted = await app.inject({ method: "GET", url: "/probe" });

  assert.equal(supplied.headers["x-request-id"], "abc123def456");
  assert.match(String(minted.headers["x-request-id"]), /^[0-9a-f-]{36}$/);
});

test("ties every log line for one request to the same id", async (context) => {
  const { app, lines } = captureLogs();
  context.after(() => app.close());
  app.get("/probe", async (request) => {
    request.log.info({ ai: { schema: "ai.run/1", feature: "coach" } }, "ai.run");
    return { ok: true };
  });

  await app.inject({
    method: "GET",
    url: "/probe",
    headers: { "x-request-id": "abc123def456" },
  });

  const requestScoped = lines.filter((line) => line.reqId !== undefined);
  assert.ok(requestScoped.length > 1, "expected request and response lines");
  for (const line of requestScoped) {
    assert.equal(line.reqId, "abc123def456");
  }
  assert.ok(lines.some((line) => line.msg === "ai.run"));
});

test("no credential or member identifier survives into a log line", async (context) => {
  const { app, lines } = captureLogs();
  context.after(() => app.close());

  app.get("/probe", async (request) => {
    request.log.warn(
      {
        apiKey: "SECRET-API-KEY",
        nested: {
          token: "SECRET-TOKEN",
          email: "member@example.com",
          dataBase64: "SECRET-ATTACHMENT",
          imageBase64: "SECRET-FRAME",
        },
      },
      "probe",
    );
    return { ok: true };
  });

  await app.inject({
    method: "GET",
    url: "/probe",
    headers: {
      authorization: "Bearer SECRET-JWT",
      cookie: "session=SECRET-COOKIE",
    },
  });

  const serialized = JSON.stringify(lines);
  for (const secret of [
    "SECRET-API-KEY",
    "SECRET-TOKEN",
    "member@example.com",
    "SECRET-ATTACHMENT",
    "SECRET-FRAME",
    "SECRET-JWT",
    "SECRET-COOKIE",
  ]) {
    assert.ok(!serialized.includes(secret), `${secret} must not reach a log line`);
  }
});

test("redaction removes the field rather than leaving a placeholder", async (context) => {
  const { app, lines } = captureLogs();
  context.after(() => app.close());
  app.get("/probe", async (request) => {
    request.log.info({ apiKey: "SECRET", keep: "visible" }, "probe");
    return { ok: true };
  });

  await app.inject({ method: "GET", url: "/probe" });

  const probe = lines.find((line) => line.msg === "probe")!;
  assert.equal("apiKey" in probe, false);
  assert.equal(probe.keep, "visible");
});
