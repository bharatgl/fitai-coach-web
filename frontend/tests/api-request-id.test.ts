import assert from "node:assert/strict";
import test from "node:test";
import { ApiRequestError, apiRequest } from "../lib/api.js";

test("carries the request id from a failure so it can be traced in the logs", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => Response.json(
    { error: "The backend could not be reached. Please try again." },
    { status: 502, headers: { "x-request-id": "b3f1c2d4e5a60718" } },
  );

  await assert.rejects(
    apiRequest("/v1/coach/messages", { method: "POST", body: "{}" }),
    (cause: unknown) => {
      assert.ok(cause instanceof ApiRequestError);
      assert.equal(cause.requestId, "b3f1c2d4e5a60718");
      return true;
    },
  );
});

test("a failure without a request id is still a usable error", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async () => Response.json({ error: "Nope" }, { status: 500 });

  await assert.rejects(
    apiRequest("/v1/profile"),
    (cause: unknown) => {
      assert.ok(cause instanceof ApiRequestError);
      assert.equal(cause.requestId, null);
      return true;
    },
  );
});
