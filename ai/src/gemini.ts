import { ApiError, GoogleGenAI, type ContentListUnion, type GenerateContentResponse } from "@google/genai";
import type { BotResearchEvidence, BotResearchSource } from "@fitai/contracts";
import { z } from "zod";
import { AiProviderError } from "./provider-error.js";

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

type GenerateGeminiStructuredInput<T> = {
  apiKey: string;
  model: string;
  schema: z.ZodType<T>;
  systemInstruction: string;
  contents: ContentListUnion;
  maxOutputTokens: number;
};

export type GenerateGroundedResearchInput = {
  auth: GeminiResearchAuth;
  model: string;
  question: string;
  specialty: string;
  audience: string;
  conversationContext?: string;
  mode?: "market" | "jobs";
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

const canonicalAtsHosts = /(?:^|\.)(?:greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|smartrecruiters\.com|jobvite\.com|icims\.com|workable\.com)$/i;

export function isLikelyDirectJobSource(source: BotResearchSource) {
  try {
    const url = new URL(source.url);
    const path = decodeURIComponent(url.pathname).replace(/\/+$/, "");
    const segments = path.split("/").filter(Boolean);
    const hasJobIdentifier = /(?:^|[?&])(?:gh_jid|jobid|job_id|requisitionid|reqid)=/i.test(url.search)
      || /\/(?:job|jobs|careers|position|positions|opening|openings|vacancy|vacancies|requisition|apply)(?:\/|[-_])[^/]+/i.test(path)
      || /\/(?:jobdetail|job-details|jobdescription)\//i.test(path);
    if (canonicalAtsHosts.test(url.hostname)) return segments.length >= 2 && !/^\/(?:jobs?|careers?)$/i.test(path);
    return hasJobIdentifier && segments.length >= 2;
  } catch {
    return false;
  }
}

export function groundedResearchFromResponse(
  response: Pick<GenerateContentResponse, "candidates" | "text">,
  asOf = new Date(),
  mode: "market" | "jobs" = "market",
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
  const applicationSources = mode === "jobs" ? sources.filter(isLikelyDirectJobSource) : undefined;
  if (mode === "jobs" && !applicationSources?.length) {
    throw new AiProviderError(
      "Live job search found web results, but no direct employer or canonical ATS listing could be verified. Add a specific role and location, then try again.",
      "unavailable",
    );
  }
  return {
    answer,
    evidence: {
      kind: mode,
      asOf: asOf.toISOString(),
      queries: (metadata?.webSearchQueries ?? []).map((query) => query.trim()).filter(Boolean).slice(0, 8),
      sources,
      applicationSources,
      searchSuggestionsHtml: metadata?.searchEntryPoint?.renderedContent?.trim() || null,
    },
  };
}

export function groundedResearchPrompt(
  input: Pick<GenerateGroundedResearchInput, "specialty" | "audience" | "question" | "conversationContext" | "mode">,
  asOf: Date,
  targetedRetry = false,
) {
  const mode = input.mode ?? "market";
  return [
    `Research this question for a ${input.specialty} specialist helping ${input.audience}:`,
    input.question,
    input.conversationContext
      ? `Recent private conversation context (use only to identify the target role, seniority, location, skills, and company type; never copy private details into a web query):\n${input.conversationContext.slice(0, 4_000)}`
      : "No additional conversation context was supplied.",
    "",
    `The current date is ${asOf.toISOString()}. You must use Google Search and base the answer on current, verifiable web evidence.`,
    mode === "jobs"
      ? "Before searching, derive one concrete search brief from the supplied question and recent context: target role, seniority, location or remote preference, and 3 to 6 relevant skills. Use that brief in at least two specific Google Search queries. Do not put private identity details in a query."
      : "",
    mode === "jobs"
      ? "Find currently available roles matching the user's target title, seniority, skills, and location or remote preference. Prioritize the exact job page on the employer's official careers site or canonical ATS over aggregators and generic careers homepages."
      : "Prioritize primary sources, official company career pages and engineering material, reputable salary or labor-market datasets, and recent job postings. Compare multiple sources when values vary.",
    mode === "jobs"
      ? "Return a short ranked list. For every match include the exact title, company, location or remote status, why it matches, and a direct application URL supported by the web evidence. Include posting or closing dates only when verified. Say when a listing's active status could not be confirmed, and never invent a vacancy or URL."
      : "For compensation, state location, currency, seniority, base versus total compensation, and data limitations. For trends, separate durable signals from hype. Never treat one job posting or anecdote as the whole market.",
    mode === "jobs"
      ? "Freshness is mandatory: open each exact listing and confirm it still shows an active application action as of today. Prefer roles posted or updated within the last 30 days. Exclude expired, closed, removed, filled, or no-longer-accepting listings; cached snippets; aggregators; search pages; and generic company careers homepages. If a role is older than 30 days, include it only when the official page explicitly remains open and report its posting date. Sort verified matches newest first."
      : "",
    mode === "jobs"
      ? "Do not apply, submit a form, or claim an application was completed. The user must review the employer page and explicitly confirm any submission."
      : "",
    targetedRetry
      ? "The initial search returned no usable cited listings. Retry with narrower title-and-location queries derived from the conversation, plus one remote-role query. Open every candidate result and return only exact employer or canonical ATS job pages that are still accepting applications today."
      : "",
    "Do not put private résumé details, names, email addresses, phone numbers, or employer-confidential material into search queries. Generalize the query when needed.",
    "Return a practical evidence brief. Clearly label estimates and uncertainty. Do not fabricate citations.",
  ].filter(Boolean).join("\n");
}

export async function generateGroundedResearch(
  input: GenerateGroundedResearchInput,
): Promise<GroundedResearchResult> {
  const client = new GoogleGenAI(researchClientOptions(input.auth));
  const asOf = input.asOf ?? new Date();
  const mode = input.mode ?? "market";
  try {
    const search = (targetedRetry = false) => client.models.generateContent({
      model: input.model,
      contents: groundedResearchPrompt(input, asOf, targetedRetry),
      config: {
        tools: [{ googleSearch: {} }],
        temperature: 0.2,
        maxOutputTokens: 3_200,
      },
    });
    const response = await search();
    try {
      return groundedResearchFromResponse(response, asOf, mode);
    } catch (error) {
      if (mode !== "jobs" || !(error instanceof AiProviderError) || error.reason !== "unavailable") {
        throw error;
      }
      return groundedResearchFromResponse(await search(true), asOf, mode);
    }
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    translateGeminiError(error);
  }
}

export async function generateGeminiStructured<T>(
  input: GenerateGeminiStructuredInput<T>,
): Promise<T> {
  const client = new GoogleGenAI({ apiKey: input.apiKey });

  try {
    const response = await client.models.generateContent({
      model: input.model,
      contents: input.contents,
      config: {
        systemInstruction: input.systemInstruction,
        temperature: 0.3,
        maxOutputTokens: input.maxOutputTokens,
        responseMimeType: "application/json",
        responseJsonSchema: toGeminiJsonSchema(input.schema),
      },
    });

    if (!response.text) {
      throw new AiProviderError(
        "The AI provider returned an empty response. Please try again.",
        "unavailable",
      );
    }

    return input.schema.parse(JSON.parse(response.text));
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (error instanceof SyntaxError || error instanceof z.ZodError) {
      throw new AiProviderError(
        "The AI provider returned an invalid structured response. Please try again.",
        "unavailable",
      );
    }
    translateGeminiError(error);
  }
}

export function translateGeminiError(error: unknown): never {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      throw new AiProviderError(
        "The AI provider credentials are invalid or do not have access to this model.",
        "authentication",
      );
    }
    if (error.status === 429) {
      throw new AiProviderError(
        "The AI provider free-tier quota or rate limit was reached. Please try again later.",
        "rate_limit",
      );
    }
  }

  throw new AiProviderError(
    "The AI provider is temporarily unavailable. Please try again.",
    "unavailable",
  );
}
