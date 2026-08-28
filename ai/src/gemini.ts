import { randomUUID } from "node:crypto";
import { ApiError, GoogleGenAI, type ContentListUnion, type GenerateContentResponse } from "@google/genai";
import type { BotResearchEvidence, BotResearchSource } from "@fitai/contracts";
import { z } from "zod";
import { AiProviderError, type AiFailureReason } from "./provider-error.js";
import { estimateCostMicroUsd, pricingFor, type AiUsage } from "./pricing.js";
import {
  emitRun,
  failureExcerptLimit,
  type AiCallContext,
  type AiFeature,
  type AiRunTelemetry,
} from "./telemetry.js";

const unsupportedSchemaKeys = new Set([
  "$schema",
  "maxLength",
  "maxItems",
  "minLength",
  "minItems",
  "pattern",
]);

export function toGeminiJsonSchema(schema: z.ZodType): unknown {
  return removeUnsupportedSchemaKeywords(z.toJSONSchema(schema));
}

function removeUnsupportedSchemaKeywords(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(removeUnsupportedSchemaKeywords);
  }
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !unsupportedSchemaKeys.has(key))
      .map(([key, child]) => [key, removeUnsupportedSchemaKeywords(child)]),
  );
}

/**
 * One client per API key. Constructing a client per call discarded connection
 * reuse for no benefit.
 */
const clients = new Map<string, GoogleGenAI>();

function clientFor(apiKey: string): GoogleGenAI {
  let client = clients.get(apiKey);
  if (!client) {
    client = new GoogleGenAI({ apiKey });
    clients.set(apiKey, client);
  }
  return client;
}

function readUsage(usageMetadata: {
  promptTokenCount?: number;
  candidatesTokenCount?: number;
  thoughtsTokenCount?: number;
  cachedContentTokenCount?: number;
  totalTokenCount?: number;
} | undefined): AiUsage | null {
  if (!usageMetadata) return null;
  return {
    promptTokens: usageMetadata.promptTokenCount ?? 0,
    cachedPromptTokens: usageMetadata.cachedContentTokenCount ?? 0,
    outputTokens: usageMetadata.candidatesTokenCount ?? 0,
    thoughtTokens: usageMetadata.thoughtsTokenCount ?? 0,
    totalTokens: usageMetadata.totalTokenCount ?? 0,
  };
}

/**
 * The slice of the provider client this module uses. Declaring it structurally
 * lets a test — or an offline eval run — supply a stand-in without a network
 * call and without reaching for module mocking.
 */
export type GeminiClient = {
  models: {
    generateContent: (
      request: Parameters<GoogleGenAI["models"]["generateContent"]>[0],
    ) => Promise<{
      text?: string;
      usageMetadata?: Parameters<typeof readUsage>[0];
    }>;
  };
};

type GenerateGeminiStructuredInput<T> = {
  apiKey: string;
  model: string;
  schema: z.ZodType<T>;
  systemInstruction: string;
  contents: ContentListUnion;
  maxOutputTokens: number;
  feature: AiFeature;
  temperature: number;
  timeoutMs: number;
  context?: AiCallContext;
  /** Overrides the provider client. Defaults to the shared client for this key. */
  client?: GeminiClient;
};

export type GenerateGroundedResearchInput = {
  auth: GeminiResearchAuth;
  model: string;
  question: string;
  specialty: string;
  audience: string;
  conversationContext?: string;
  asOf?: Date;
};

export type GeminiResearchAuth =
  | { kind: "api_key"; apiKey: string }
  | { kind: "vertex"; project: string; location: string };

export type GroundedResearchResult = {
  answer: string;
  evidence: BotResearchEvidence;
};

export function researchClientOptions(auth: GeminiResearchAuth): ConstructorParameters<typeof GoogleGenAI>[0] {
  if (auth.kind === "vertex") {
    return {
      vertexai: true,
      project: auth.project,
      location: auth.location,
      apiVersion: "v1",
    };
  }
  return { apiKey: auth.apiKey };
}

function safeWebSource(title: string | undefined, uri: string | undefined): BotResearchSource | null {
  if (!uri) return null;
  try {
    const parsed = new URL(uri);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return {
      title: title?.trim() || parsed.hostname.replace(/^www\./, ""),
      url: parsed.toString(),
    };
  } catch {
    return null;
  }
}

export function groundedResearchFromResponse(
  response: Pick<GenerateContentResponse, "candidates" | "text">,
  asOf = new Date(),
): GroundedResearchResult {
  const metadata = response.candidates?.[0]?.groundingMetadata;
  const chunkNumbers = new Map<number, number>();
  const sourceNumbers = new Map<string, number>();
  const sources: BotResearchSource[] = [];
  for (const [chunkIndex, chunk] of (metadata?.groundingChunks ?? []).entries()) {
    const source = safeWebSource(chunk.web?.title, chunk.web?.uri);
    if (!source) continue;
    const existing = sourceNumbers.get(source.url);
    if (existing) {
      chunkNumbers.set(chunkIndex, existing);
      continue;
    }
    if (sources.length >= 10) continue;
    sources.push(source);
    const number = sources.length;
    sourceNumbers.set(source.url, number);
    chunkNumbers.set(chunkIndex, number);
  }

  let answer = response.text?.trim() ?? "";
  const supports = [...(metadata?.groundingSupports ?? [])]
    .sort((left, right) => (right.segment?.endIndex ?? 0) - (left.segment?.endIndex ?? 0));
  for (const support of supports) {
    const endIndex = support.segment?.endIndex;
    if (endIndex === undefined || endIndex < 0 || endIndex > answer.length) continue;
    const citations = [...new Set((support.groundingChunkIndices ?? [])
      .map((index) => chunkNumbers.get(index))
      .filter((number): number is number => Boolean(number)))]
      .map((number) => `[${number}]`)
      .join("");
    if (citations) answer = `${answer.slice(0, endIndex)} ${citations}${answer.slice(endIndex)}`;
  }

  if (!answer || !sources.length) {
    throw new AiProviderError(
      "Live research did not return enough verifiable evidence. Add a specific role, location, company, or time range and try again.",
      "unavailable",
    );
  }
  return {
    answer,
    evidence: {
      asOf: asOf.toISOString(),
      queries: (metadata?.webSearchQueries ?? []).map((query) => query.trim()).filter(Boolean).slice(0, 8),
      sources,
      searchSuggestionsHtml: metadata?.searchEntryPoint?.renderedContent?.trim() || null,
    },
  };
}

export async function generateGroundedResearch(
  input: GenerateGroundedResearchInput,
): Promise<GroundedResearchResult> {
  const client = new GoogleGenAI(researchClientOptions(input.auth));
  const asOf = input.asOf ?? new Date();
  try {
    const response = await client.models.generateContent({
      model: input.model,
      contents: [
        `Research this question for a ${input.specialty} specialist helping ${input.audience}:`,
        input.question,
        input.conversationContext
          ? `Recent private conversation context (use only to identify the target role, seniority, location, and company type; never copy private details into a web query):\n${input.conversationContext.slice(0, 4_000)}`
          : "No additional conversation context was supplied.",
        "",
        `The current date is ${asOf.toISOString()}. You must use Google Search and base the answer on current, verifiable web evidence.`,
        "Prioritize primary sources, official company career pages and engineering material, reputable salary or labor-market datasets, and recent job postings. Compare multiple sources when values vary.",
        "For compensation, state location, currency, seniority, base versus total compensation, and data limitations. For trends, separate durable signals from hype. Never treat one job posting or anecdote as the whole market.",
        "Do not put private résumé details, names, email addresses, phone numbers, or employer-confidential material into search queries. Generalize the query when needed.",
        "Return a practical evidence brief. Clearly label estimates and uncertainty. Do not fabricate citations.",
      ].join("\n"),
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.2,
        maxOutputTokens: 3_200,
      },
    });
    return groundedResearchFromResponse(response, asOf);
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    translateGeminiError(error);
  }
}

export async function generateGeminiStructured<T>(
  input: GenerateGeminiStructuredInput<T>,
): Promise<T> {
  const startedAt = new Date();
  const startedTicks = performance.now();

  let usage: AiUsage | null = null;
  let failure: AiProviderError | null = null;
  let validationIssues: AiRunTelemetry["validationIssues"] = null;
  let rawFailureExcerpt: string | null = null;

  try {
    const client = input.client ?? clientFor(input.apiKey);
    const response = await client.models.generateContent({
      model: input.model,
      contents: input.contents,
      config: {
        systemInstruction: input.systemInstruction,
        temperature: input.temperature,
        maxOutputTokens: input.maxOutputTokens,
        responseMimeType: "application/json",
        responseJsonSchema: toGeminiJsonSchema(input.schema),
        abortSignal: AbortSignal.timeout(input.timeoutMs),
      },
    });

    // Read usage before anything can throw, so a schema violation still reports
    // the tokens it cost.
    usage = readUsage(response.usageMetadata);

    if (!response.text) {
      throw new AiProviderError(
        "The AI provider returned an empty response. Please try again.",
        "empty_response",
      );
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(response.text);
    } catch {
      if (input.context?.captureFailureExcerpt) {
        rawFailureExcerpt = response.text.slice(0, failureExcerptLimit);
      }
      throw new AiProviderError(
        "The AI provider returned an invalid structured response. Please try again.",
        "malformed_json",
      );
    }

    const result = input.schema.safeParse(parsedJson);
    if (!result.success) {
      // Paths and codes only. This says which field broke the contract without
      // recording the value that broke it.
      validationIssues = result.error.issues.slice(0, 10).map((issue) => ({
        path: issue.path.join("."),
        code: issue.code,
      }));
      throw new AiProviderError(
        "The AI provider returned an invalid structured response. Please try again.",
        "schema_violation",
      );
    }

    return result.data;
  } catch (error) {
    failure = asAiProviderError(error);
    throw failure;
  } finally {
    const costMicroUsd = usage ? estimateCostMicroUsd(input.model, usage) : null;
    emitRun(input.context, {
      schema: "ai.run/1",
      runId: randomUUID(),
      requestId: input.context?.requestId ?? null,
      userRef: input.context?.userRef ?? null,
      feature: input.feature,
      provider: "google",
      model: input.model,
      startedAt: startedAt.toISOString(),
      durationMs: Math.round(performance.now() - startedTicks),
      outcome: failure ? "failed" : "ok",
      errorReason: failure?.reason ?? null,
      usage,
      costMicroUsd,
      pricingKnown: pricingFor(input.model) !== null,
      request: {
        temperature: input.temperature,
        maxOutputTokens: input.maxOutputTokens,
        timeoutMs: input.timeoutMs,
      },
      validationIssues,
      rawFailureExcerpt,
    });
  }
}

function asAiProviderError(error: unknown): AiProviderError {
  if (error instanceof AiProviderError) return error;
  const reason = reasonFor(error);
  return new AiProviderError(messageForReason(reason), reason);
}

/**
 * `AbortSignal.timeout` rejects with a `TimeoutError`; an upstream cancellation
 * surfaces as `AbortError`. Both mean we stopped waiting, not that the provider
 * refused us.
 */
function isAbort(error: unknown): boolean {
  return error instanceof Error
    && (error.name === "TimeoutError" || error.name === "AbortError");
}

function reasonFor(error: unknown): AiFailureReason {
  if (isAbort(error)) return "timeout";
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return "authentication";
    if (error.status === 429) return "rate_limit";
  }
  return "unavailable";
}

function messageForReason(reason: AiFailureReason): string {
  switch (reason) {
    case "authentication":
      return "The AI provider credentials are invalid or do not have access to this model.";
    case "rate_limit":
      return "The AI provider free-tier quota or rate limit was reached. Please try again later.";
    case "timeout":
      return "The AI provider did not respond in time. Please try again.";
    default:
      return "The AI provider is temporarily unavailable. Please try again.";
  }
}

export function translateGeminiError(error: unknown): never {
  throw asAiProviderError(error);
}
