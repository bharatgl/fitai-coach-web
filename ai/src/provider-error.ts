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
