/**
 * Why a model call did not produce a usable result.
 *
 * These are deliberately distinct because they are different engineering
 * problems with different owners:
 *
 * - `authentication`, `rate_limit`, `timeout`, `unavailable` are the provider's
 *   side of the boundary.
 * - `empty_response` is a provider response we cannot use.
 * - `malformed_json` means the model did not emit JSON at all — a prompt or
 *   decoding problem.
 * - `schema_violation` means the model emitted valid JSON that broke our
 *   contract — a prompt or schema problem, and ours to fix.
 *
 * `unavailable` is retained as the catch-all so previously persisted values
 * such as `local-fallback:unavailable` keep their meaning.
 */
export type AiFailureReason =
  | "authentication"
  | "rate_limit"
  | "timeout"
  | "unavailable"
  | "empty_response"
  | "malformed_json"
  | "schema_violation";

/**
 * Failures worth attempting again with identical inputs. A schema violation is
 * not retryable here: the same prompt produced output we rejected, so a bare
 * retry mostly buys another rejection. Repairing that needs a changed request.
 */
const retryableReasons: ReadonlySet<AiFailureReason> = new Set([
  "rate_limit",
  "timeout",
  "unavailable",
]);

export class AiProviderError extends Error {
  readonly statusCode = 503;

  constructor(
    message: string,
    readonly reason: AiFailureReason,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AiProviderError";
  }

  get retryable(): boolean {
    return retryableReasons.has(this.reason);
  }
}
