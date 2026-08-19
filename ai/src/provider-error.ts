import OpenAI from "openai";

export class AiProviderError extends Error {
  readonly statusCode = 503;

  constructor(
    message: string,
    readonly reason: "authentication" | "rate_limit" | "unavailable",
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

export function translateOpenAIError(error: unknown): never {
  if (error instanceof OpenAI.APIError) {
    if (error.status === 401 || error.status === 403) {
      throw new AiProviderError(
        "The AI provider credentials are invalid or do not have access to this model.",
        "authentication",
      );
    }
    if (error.status === 429) {
      throw new AiProviderError(
        "The AI provider quota or rate limit was reached. Please try again after API capacity is available.",
        "rate_limit",
      );
    }
  }
  throw new AiProviderError(
    "The AI provider is temporarily unavailable. Please try again.",
    "unavailable",
  );
}
