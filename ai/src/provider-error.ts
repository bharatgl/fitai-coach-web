export class AiProviderError extends Error {
  readonly statusCode = 503;

  constructor(
    message: string,
    readonly reason: "authentication" | "rate_limit" | "unavailable",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AiProviderError";
  }
}
