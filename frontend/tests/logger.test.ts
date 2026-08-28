import assert from "node:assert/strict";
import test from "node:test";
import { logger, shouldLog } from "../lib/logger.js";

function captureConsole(context: { after: (fn: () => void) => void }) {
  const lines: Array<Record<string, unknown>> = [];
  const originalLog = console.log;
  const originalError = console.error;
  const capture = (value: unknown) => lines.push(JSON.parse(String(value)));
  console.log = capture;
  console.error = capture;
  context.after(() => {
    console.log = originalLog;
    console.error = originalError;
  });
  return lines;
}

test("emits the same Cloud Logging shape as the backend", (context) => {
  const lines = captureConsole(context);

  logger.error("proxy.failed", { requestId: "abc123def456", route: "/v1/profile" });

  const line = lines[0]!;
  assert.equal(line.severity, "ERROR");
  assert.equal(line.level, "error");
  assert.equal(line.message, "proxy.failed");
  assert.match(String(line.time), /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/);
  assert.equal(line.requestId, "abc123def456");
  assert.equal(line.route, "/v1/profile");
});

test("withholds debug at the default level and admits it when lowered", (context) => {
  const lines = captureConsole(context);
  const originalLevel = process.env.LOG_LEVEL;
  context.after(() => {
    if (originalLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = originalLevel;
  });

  delete process.env.LOG_LEVEL;
  logger.debug("quiet");
  assert.equal(lines.length, 0);

  process.env.LOG_LEVEL = "debug";
  logger.debug("now visible");
  assert.equal(lines[0]?.message, "now visible");
  assert.equal(lines[0]?.severity, "DEBUG");
});

test("ranks levels so a floor admits everything at or above it", () => {
  assert.equal(shouldLog("error", "info"), true);
  assert.equal(shouldLog("info", "info"), true);
  assert.equal(shouldLog("debug", "info"), false);
  assert.equal(shouldLog("trace", "debug"), false);
  assert.equal(shouldLog("debug", "trace"), true);
});

test("falls back to info when LOG_LEVEL is not a level", (context) => {
  const lines = captureConsole(context);
  const originalLevel = process.env.LOG_LEVEL;
  context.after(() => {
    if (originalLevel === undefined) delete process.env.LOG_LEVEL;
    else process.env.LOG_LEVEL = originalLevel;
  });

  process.env.LOG_LEVEL = "verbose";
  logger.info("still emitted");
  logger.debug("still withheld");

  assert.equal(lines.length, 1);
  assert.equal(lines[0]?.message, "still emitted");
});
