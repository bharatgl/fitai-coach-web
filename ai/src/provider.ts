import type { ContentListUnion, Part } from "@google/genai";
import { z } from "zod";
import { generateGeminiStructured, toGeminiJsonSchema } from "./gemini.js";
import { AiProviderError } from "./provider-error.js";

export type AIProviderKind = "gemini" | "openai" | "anthropic" | "openai_compatible";

export type AIProviderConfig = {
  kind: AIProviderKind;
  apiKey: string;
  model: string;
  baseUrl?: string | null;
};

export type AIFilePart = {
  file: {
    name: string;
    mimeType: string;
    dataBase64: string;
  };
};

export type AIContentPart = { text: string } | AIFilePart;
export type AIContent = string | Array<{
  role: "user" | "assistant";
  parts: AIContentPart[];
}>;

type StructuredGenerationInput<T> = {
  provider: AIProviderConfig;
  schema: z.ZodType<T>;
  systemInstruction: string;
  contents: AIContent;
  maxOutputTokens: number;
};

function genericSchemaInstruction(schema: z.ZodType) {
  return `Return only valid JSON matching this JSON Schema. Do not wrap it in Markdown:\n${JSON.stringify(toGeminiJsonSchema(schema))}`;
}

function parseStructuredText<T>(text: string, schema: z.ZodType<T>) {
  const normalized = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return schema.parse(JSON.parse(normalized));
  } catch (cause) {
    throw new AiProviderError(
      "The AI provider returned an invalid structured response. Please try again.",
      "unavailable",
      { cause },
    );
  }
}

function contentMessages(contents: AIContent) {
  return typeof contents === "string"
    ? [{ role: "user" as const, parts: [{ text: contents }] }]
    : contents;
}

function dataUrl(file: AIFilePart["file"]) {
  return `data:${file.mimeType};base64,${file.dataBase64}`;
}

function openAIInput(contents: AIContent) {
  return contentMessages(contents).map((message) => ({
    role: message.role,
    content: message.parts.map((part) => {
      if ("text" in part) return { type: "input_text", text: part.text };
      if (part.file.mimeType.startsWith("image/")) {
        return { type: "input_image", image_url: dataUrl(part.file), detail: "auto" };
      }
      return {
        type: "input_file",
        filename: part.file.name,
        file_data: dataUrl(part.file),
      };
    }),
  }));
}

function anthropicMessages(contents: AIContent) {
  return contentMessages(contents).map((message) => ({
    role: message.role,
    content: message.parts.map((part) => {
      if ("text" in part) return { type: "text", text: part.text };
      if (part.file.mimeType === "application/pdf") {
        return {
          type: "document",
          source: { type: "base64", media_type: part.file.mimeType, data: part.file.dataBase64 },
          title: part.file.name,
        };
      }
      return {
        type: "image",
        source: { type: "base64", media_type: part.file.mimeType, data: part.file.dataBase64 },
      };
    }),
  }));
}

async function providerFetch(url: string, init: RequestInit) {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(60_000) });
  } catch (cause) {
    throw new AiProviderError("The AI provider could not be reached. Please try again.", "unavailable", { cause });
  }
  if (response.ok) return response;
  const detail = await response.text().catch(() => "");
  const reason = response.status === 401 || response.status === 403
    ? "authentication"
    : response.status === 429
      ? "rate_limit"
      : "unavailable";
  throw new AiProviderError(
    reason === "authentication"
      ? "The AI provider credentials are invalid or do not have access to this model."
      : reason === "rate_limit"
        ? "The AI provider quota or rate limit was reached. Please try again later."
        : `The AI provider request failed (${response.status}). Please try again.`,
    reason,
    { cause: new Error(detail.slice(0, 500)) },
  );
}

async function generateOpenAIStructured<T>(input: StructuredGenerationInput<T>) {
  if (input.provider.kind === "openai_compatible" && !input.provider.baseUrl) {
    throw new AiProviderError(
      "The OpenAI-compatible provider needs a base URL.",
      "unavailable",
    );
  }
  const baseUrl = (input.provider.baseUrl || "https://api.openai.com/v1").replace(/\/$/, "");
  const response = await providerFetch(`${baseUrl}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.provider.model,
      instructions: input.systemInstruction,
      input: openAIInput(input.contents),
      max_output_tokens: input.maxOutputTokens,
      text: {
        format: {
          type: "json_schema",
          name: "forgefit_response",
          strict: true,
          schema: toGeminiJsonSchema(input.schema),
        },
      },
    }),
  });
  const payload = await response.json() as {
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  const text = payload.output_text ?? payload.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "output_text")?.text;
  if (!text) throw new AiProviderError("The AI provider returned an empty response. Please try again.", "unavailable");
  return parseStructuredText(text, input.schema);
}

async function generateAnthropicStructured<T>(input: StructuredGenerationInput<T>) {
  const baseUrl = (input.provider.baseUrl || "https://api.anthropic.com/v1").replace(/\/$/, "");
  const response = await providerFetch(`${baseUrl}/messages`, {
    method: "POST",
    headers: {
      "x-api-key": input.provider.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: input.provider.model,
      system: `${input.systemInstruction}\n\n${genericSchemaInstruction(input.schema)}`,
      messages: anthropicMessages(input.contents),
      max_tokens: input.maxOutputTokens,
      temperature: 0.3,
    }),
  });
  const payload = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  const text = payload.content?.find((item) => item.type === "text")?.text;
  if (!text) throw new AiProviderError("The AI provider returned an empty response. Please try again.", "unavailable");
  return parseStructuredText(text, input.schema);
}

function geminiContents(contents: AIContent): ContentListUnion {
  if (typeof contents === "string") return contents;
  return contents.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: message.parts.map((part): Part => "text" in part
      ? { text: part.text }
      : { inlineData: { data: part.file.dataBase64, mimeType: part.file.mimeType } }),
  }));
}

export async function generateStructuredAI<T>(input: StructuredGenerationInput<T>): Promise<T> {
  if (input.provider.kind === "gemini") {
    return generateGeminiStructured({
      apiKey: input.provider.apiKey,
      model: input.provider.model,
      schema: input.schema,
      systemInstruction: input.systemInstruction,
      contents: geminiContents(input.contents),
      maxOutputTokens: input.maxOutputTokens,
    });
  }
  if (input.provider.kind === "anthropic") return generateAnthropicStructured(input);
  return generateOpenAIStructured(input);
}
