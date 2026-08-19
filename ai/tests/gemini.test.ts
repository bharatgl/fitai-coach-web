import assert from "node:assert/strict";
import test from "node:test";
import { ApiError } from "@google/genai";
import { z } from "zod";
import {
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
  assert.doesNotMatch(jsonSchema, /\$schema|minLength|maxLength/);
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
