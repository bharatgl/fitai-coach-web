import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "@google/genai";
import { z } from "zod";
import { generateGeminiStructured, type GeminiClient } from "../src/gemini.js";
import { AiProviderError } from "../src/provider-error.js";
import type { AiRunTelemetry } from "../src/telemetry.js";

const schema = z.object({ answer: z.string(), score: z.number().int() });

const usageMetadata = {
  promptTokenCount: 1_000,
  candidatesTokenCount: 200,
  thoughtsTokenCount: 50,
  cachedContentTokenCount: 400,
  totalTokenCount: 1_250,
};

function collector() {
  const runs: AiRunTelemetry[] = [];
  return { runs, onRun: (run: AiRunTelemetry) => void runs.push(run) };
}

function clientReturning(response: { text?: string; usageMetadata?: typeof usageMetadata }): GeminiClient {
  return { models: { generateContent: async () => response } };
}

function clientThrowing(error: unknown): GeminiClient {
  return {
    models: {
      generateContent: async () => {
        throw error;
      },
    },
  };
}

async function call(client: GeminiClient, onRun: (run: AiRunTelemetry) => void) {
  return generateGeminiStructured({
    apiKey: "test-key",
    model: "gemini-3.1-flash-lite",
    schema,
    systemInstruction: "be brief",
    contents: "hello",
    feature: "coach",
    temperature: 0.3,
    maxOutputTokens: 100,
    timeoutMs: 5_000,
    context: { requestId: "req-abc", userRef: "user-hash", onRun },
    client,
  });
}

test("records tokens, cost, and timing for a successful call", async () => {
  const { runs, onRun } = collector();
  const result = await call(
    clientReturning({ text: JSON.stringify({ answer: "ok", score: 3 }), usageMetadata }),
    onRun,
  );

  assert.deepEqual(result, { answer: "ok", score: 3 });
  assert.equal(runs.length, 1);

  const run = runs[0]!;
  assert.equal(run.schema, "ai.run/1");
  assert.equal(run.outcome, "ok");
  assert.equal(run.errorReason, null);
  assert.equal(run.feature, "coach");
  assert.equal(run.requestId, "req-abc");
  assert.equal(run.userRef, "user-hash");
  assert.deepEqual(run.usage, {
    promptTokens: 1_000,
    cachedPromptTokens: 400,
    outputTokens: 200,
    thoughtTokens: 50,
    totalTokens: 1_250,
  });
  // 600 uncached input at $0.25/M, 400 cached at $0.025/M, 250 output at $1.50/M.
  assert.equal(run.costMicroUsd, Math.round(600 * 0.25 + 400 * 0.025 + 250 * 1.5));
  assert.equal(run.pricingKnown, true);
  assert.ok(run.durationMs >= 0);
  assert.deepEqual(run.request, {
    temperature: 0.3,
    maxOutputTokens: 100,
    timeoutMs: 5_000,
  });
});

test("still reports the tokens a schema violation cost", async () => {
  const { runs, onRun } = collector();

  await assert.rejects(
    call(clientReturning({ text: JSON.stringify({ answer: "ok", score: "three" }), usageMetadata }), onRun),
    (error: unknown) => error instanceof AiProviderError && error.reason === "schema_violation",
  );

  const run = runs[0]!;
  assert.equal(run.outcome, "failed");
  assert.equal(run.errorReason, "schema_violation");
  assert.equal(run.usage?.promptTokens, 1_000);
  assert.ok(run.costMicroUsd && run.costMicroUsd > 0);
});

test("names the field that broke the contract without recording its value", async () => {
  const { runs, onRun } = collector();

  await assert.rejects(
    call(clientReturning({ text: JSON.stringify({ answer: "ok", score: "three" }) }), onRun),
    AiProviderError,
  );

  const run = runs[0]!;
  assert.deepEqual(run.validationIssues?.map((issue) => issue.path), ["score"]);
  // The offending value must not travel with the diagnostic.
  assert.doesNotMatch(JSON.stringify(run), /three/);
});

test("separates unparseable output from a contract violation", async () => {
  const { runs, onRun } = collector();

  await assert.rejects(
    call(clientReturning({ text: "Sure! Here is your plan:" }), onRun),
    (error: unknown) => error instanceof AiProviderError && error.reason === "malformed_json",
  );

  assert.equal(runs[0]!.errorReason, "malformed_json");
  // Raw output is withheld unless the caller explicitly opts in.
  assert.equal(runs[0]!.rawFailureExcerpt, null);
});

test("captures a bounded excerpt of unparseable output when asked to", async () => {
  const runs: AiRunTelemetry[] = [];
  await assert.rejects(
    generateGeminiStructured({
      apiKey: "test-key",
      model: "gemini-3.1-flash-lite",
      schema,
      systemInstruction: "be brief",
      contents: "hello",
      feature: "plan",
      temperature: 0.3,
      maxOutputTokens: 100,
      timeoutMs: 5_000,
      context: {
        captureFailureExcerpt: true,
        onRun: (run) => void runs.push(run),
      },
      client: clientReturning({ text: "x".repeat(2_000) }),
    }),
    AiProviderError,
  );

  assert.equal(runs[0]!.rawFailureExcerpt?.length, 500);
});

test("treats an empty response as its own failure class", async () => {
  const { runs, onRun } = collector();

  await assert.rejects(
    call(clientReturning({ text: "" }), onRun),
    (error: unknown) =>
      error instanceof AiProviderError
      && error.reason === "empty_response"
      && error.message === "The AI provider returned an empty response. Please try again.",
  );

  assert.equal(runs[0]!.errorReason, "empty_response");
});

test("classifies a timeout separately from provider unavailability", async () => {
  const { runs, onRun } = collector();
  const timeout = new Error("The operation timed out");
  timeout.name = "TimeoutError";

  await assert.rejects(
    call(clientThrowing(timeout), onRun),
    (error: unknown) => error instanceof AiProviderError && error.reason === "timeout",
  );

  assert.equal(runs[0]!.errorReason, "timeout");
  assert.equal(runs[0]!.usage, null);
});

test("keeps provider failures classified and records the attempt", async () => {
  const { runs, onRun } = collector();

  await assert.rejects(
    call(clientThrowing(new ApiError({ status: 429, message: "quota details" })), onRun),
    (error: unknown) =>
      error instanceof AiProviderError
      && error.reason === "rate_limit"
      && !error.message.includes("quota details"),
  );

  assert.equal(runs[0]!.outcome, "failed");
  assert.equal(runs[0]!.errorReason, "rate_limit");
});

test("marks a model with no price as unpriced instead of free", async () => {
  const runs: AiRunTelemetry[] = [];
  await generateGeminiStructured({
    apiKey: "test-key",
    model: "gemini-unreleased-preview",
    schema,
    systemInstruction: "be brief",
    contents: "hello",
    feature: "vision",
    temperature: 0.3,
    maxOutputTokens: 100,
    timeoutMs: 5_000,
    context: { onRun: (run) => void runs.push(run) },
    client: clientReturning({ text: JSON.stringify({ answer: "ok", score: 1 }), usageMetadata }),
  });

  assert.equal(runs[0]!.pricingKnown, false);
  assert.equal(runs[0]!.costMicroUsd, null);
  assert.equal(runs[0]!.usage?.totalTokens, 1_250);
});

test("a failing telemetry sink never fails the request", async () => {
  const result = await generateGeminiStructured({
    apiKey: "test-key",
    model: "gemini-3.1-flash-lite",
    schema,
    systemInstruction: "be brief",
    contents: "hello",
    feature: "coach",
    temperature: 0.3,
    maxOutputTokens: 100,
    timeoutMs: 5_000,
    context: {
      onRun: () => {
        throw new Error("log store is down");
      },
    },
    client: clientReturning({ text: JSON.stringify({ answer: "ok", score: 3 }) }),
  });

  assert.deepEqual(result, { answer: "ok", score: 3 });
});

test("retryability is a property of the failure class", () => {
  assert.equal(new AiProviderError("x", "rate_limit").retryable, true);
  assert.equal(new AiProviderError("x", "timeout").retryable, true);
  assert.equal(new AiProviderError("x", "unavailable").retryable, true);
  assert.equal(new AiProviderError("x", "schema_violation").retryable, false);
  assert.equal(new AiProviderError("x", "authentication").retryable, false);
});
