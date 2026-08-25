import assert from "node:assert/strict";
import test from "node:test";
import { apiRequest } from "../lib/api.js";

test("does not label an empty DELETE request as JSON", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (_input, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(init?.method, "DELETE");
    assert.equal(init?.body, undefined);
    assert.equal(headers.has("content-type"), false);
    return new Response(null, { status: 204 });
  };

  await apiRequest<void>("/v1/coach/threads/thread-id", { method: "DELETE" });
});

test("sets JSON content type when a request has a body", async (context) => {
  const originalFetch = globalThis.fetch;
  context.after(() => {
    globalThis.fetch = originalFetch;
  });

  globalThis.fetch = async (_input, init) => {
    const headers = new Headers(init?.headers);
    assert.equal(headers.get("content-type"), "application/json");
    return Response.json({ ok: true });
  };

  const response = await apiRequest<{ ok: boolean }>("/v1/profile", {
    method: "PUT",
    body: JSON.stringify({ value: true }),
  });
  assert.equal(response.ok, true);
});
