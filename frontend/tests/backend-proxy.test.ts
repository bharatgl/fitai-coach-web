import assert from "node:assert/strict";
import test from "node:test";
import {
  fetchBackendWithStartupRetry,
  isBackendTransportError,
} from "../lib/backend-proxy.js";

test("retries temporary backend startup connection failures for safe requests", async () => {
  let calls = 0;
  const fetcher = (async () => {
    calls += 1;
    if (calls < 3) throw new TypeError("fetch failed: connect ECONNREFUSED");
    return Response.json({ status: "ready" });
  }) as typeof fetch;

  const response = await fetchBackendWithStartupRetry("http://localhost:4000/v1/bots", {}, {
    attempts: 5,
    initialDelayMs: 0,
    fetcher,
  });

  assert.equal(calls, 3);
  assert.equal(response.status, 200);
});

test("does not retry a request when only one attempt is authorized", async () => {
  let calls = 0;
  const fetcher = (async () => {
    calls += 1;
    throw new TypeError("fetch failed: connect ECONNREFUSED");
  }) as typeof fetch;

  await assert.rejects(
    fetchBackendWithStartupRetry("http://localhost:4000/v1/bots", {}, {
      attempts: 1,
      initialDelayMs: 0,
      fetcher,
    }),
    /ECONNREFUSED/,
  );
  assert.equal(calls, 1);
});

test("distinguishes backend transport failures from application errors", () => {
  assert.equal(isBackendTransportError(new TypeError("fetch failed")), true);
  assert.equal(isBackendTransportError(new Error("Invalid request")), false);
});
