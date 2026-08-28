import assert from "node:assert/strict";
import test from "node:test";
import { estimateCostMicroUsd, modelPricing, pricingFor } from "../src/pricing.js";

const noUsage = {
  promptTokens: 0,
  cachedPromptTokens: 0,
  outputTokens: 0,
  thoughtTokens: 0,
  totalTokens: 0,
};

test("prices the configured default model from token counts", () => {
  // 1M input at $0.25 plus 1M output at $1.50 is $1.75, or 1_750_000 micro-USD.
  const cost = estimateCostMicroUsd("gemini-3.1-flash-lite", {
    ...noUsage,
    promptTokens: 1_000_000,
    outputTokens: 1_000_000,
    totalTokens: 2_000_000,
  });
  assert.equal(cost, 1_750_000);
});

test("bills reasoning tokens as output", () => {
  const withoutThoughts = estimateCostMicroUsd("gemini-3.1-flash-lite", {
    ...noUsage,
    outputTokens: 1_000,
  });
  const withThoughts = estimateCostMicroUsd("gemini-3.1-flash-lite", {
    ...noUsage,
    outputTokens: 1_000,
    thoughtTokens: 1_000,
  });
  assert.equal(withoutThoughts, 1_500);
  assert.equal(withThoughts, 3_000);
});

test("charges cache reads at the cheaper rate without double counting input", () => {
  // Cached tokens are a subset of promptTokens, so 1M prompt tokens of which
  // 1M are cache reads costs the cached rate only: $0.025.
  const cost = estimateCostMicroUsd("gemini-3.1-flash-lite", {
    ...noUsage,
    promptTokens: 1_000_000,
    cachedPromptTokens: 1_000_000,
    totalTokens: 1_000_000,
  });
  assert.equal(cost, 25_000);
});

test("prices cached tokens as ordinary input when a model has no cached rate", () => {
  assert.equal(modelPricing["gemini-2.5-flash"]!.cachedInputPerMillionUsd, null);
  const cost = estimateCostMicroUsd("gemini-2.5-flash", {
    ...noUsage,
    promptTokens: 1_000_000,
    cachedPromptTokens: 1_000_000,
    totalTokens: 1_000_000,
  });
  assert.equal(cost, 300_000);
});

test("applies the long-context input rate above the threshold", () => {
  const pricing = modelPricing["gemini-3.1-pro"]!;
  assert.ok(pricing.longContext);
  const below = estimateCostMicroUsd("gemini-3.1-pro", {
    ...noUsage,
    promptTokens: 100_000,
  });
  const above = estimateCostMicroUsd("gemini-3.1-pro", {
    ...noUsage,
    promptTokens: 300_000,
  });
  assert.equal(below, 200_000);
  assert.equal(above, 1_200_000);
});

test("matches a dated or prefixed model id to its base pricing", () => {
  assert.equal(
    pricingFor("models/gemini-3.1-flash-lite-preview-04-17"),
    modelPricing["gemini-3.1-flash-lite"],
  );
});

test("reports no cost for an unknown model rather than guessing one", () => {
  assert.equal(pricingFor("some-unreleased-model"), null);
  assert.equal(
    estimateCostMicroUsd("some-unreleased-model", { ...noUsage, promptTokens: 1_000 }),
    null,
  );
});
