import { ApiError, GoogleGenAI, type ContentListUnion } from "@google/genai";
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
