import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "@google/genai";
import { z } from "zod";
import {
  groundedResearchFromResponse,
  researchClientOptions,
  toGeminiJsonSchema,
  translateGeminiError,
} from "../src/gemini.js";
import { AiProviderError } from "../src/provider-error.js";

test("converts Zod schemas to Gemini-supported JSON schema", () => {
  const schema = z.object({
    label: z.string().min(2).max(20),
    count: z.number().int().min(1).max(6),
    note: z.string().nullable(),
  });

  const jsonSchema = JSON.stringify(toGeminiJsonSchema(schema));
  assert.doesNotMatch(
    jsonSchema,
    /\$schema|minLength|maxLength|minItems|maxItems/,
  );
  assert.match(jsonSchema, /"minimum":1/);
  assert.match(jsonSchema, /"maximum":6/);
  assert.match(jsonSchema, /"type":"null"/);
});

test("translates Gemini free-tier rate limits without leaking provider details", () => {
  assert.throws(
    () => translateGeminiError(new ApiError({ status: 429, message: "quota details" })),
    (error) =>
      error instanceof AiProviderError &&
      error.reason === "rate_limit" &&
      !error.message.includes("quota details"),
  );
});

test("translates invalid Gemini credentials", () => {
  assert.throws(
    () => translateGeminiError(new ApiError({ status: 403, message: "forbidden" })),
    (error) =>
      error instanceof AiProviderError && error.reason === "authentication",
  );
});

test("configures grounded research for Vertex AI without an API key", () => {
  assert.deepEqual(researchClientOptions({
    kind: "vertex",
    project: "forgefit-project",
    location: "global",
  }), {
    vertexai: true,
    project: "forgefit-project",
    location: "global",
    apiVersion: "v1",
  });
});

test("keeps API-key research available for explicit personal credentials", () => {
  assert.deepEqual(researchClientOptions({ kind: "api_key", apiKey: "test-key" }), {
    apiKey: "test-key",
  });
});

test("turns Gemini grounding metadata into numbered, persisted research evidence", () => {
  const sentence = "Senior frontend hiring remains selective.";
  const result = groundedResearchFromResponse({
    text: sentence,
    candidates: [{
      groundingMetadata: {
        webSearchQueries: ["senior frontend hiring India 2026"],
        searchEntryPoint: { renderedContent: "<div>Search suggestions</div>" },
        groundingChunks: [
          { web: { title: "Example careers", uri: "https://example.com/careers" } },
          { web: { title: "Example careers duplicate", uri: "https://example.com/careers" } },
        ],
        groundingSupports: [{
          segment: { startIndex: 0, endIndex: sentence.length, text: sentence },
          groundingChunkIndices: [0, 1],
        }],
      },
    }],
  }, new Date("2026-08-31T00:00:00.000Z"));

  assert.equal(result.answer, `${sentence} [1]`);
  assert.equal(result.evidence.asOf, "2026-08-31T00:00:00.000Z");
  assert.deepEqual(result.evidence.queries, ["senior frontend hiring India 2026"]);
  assert.deepEqual(result.evidence.sources, [{
    title: "Example careers",
    url: "https://example.com/careers",
  }]);
  assert.match(result.evidence.searchSuggestionsHtml ?? "", /Search suggestions/);
});

test("rejects a supposedly current answer without verifiable web sources", () => {
  assert.throws(
    () => groundedResearchFromResponse({ text: "An unsupported current claim.", candidates: [] }),
    (error) => error instanceof AiProviderError && /verifiable evidence/i.test(error.message),
  );
});
