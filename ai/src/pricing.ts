/**
 * Token prices for the models this project calls directly.
 *
 * Prices are USD per million tokens, as published for the paid tier. They are
 * checked in deliberately rather than fetched: a cost figure has to be
 * reproducible after the fact, and a run recorded last month should keep the
 * price that was in force when it ran.
 *
 * Maintenance contract:
 * - `verifiedOn` is the date a human last checked the row against the provider's
 *   pricing page. Treat a stale row as an estimate.
 * - A model missing from this table is not an error. Its run records still carry
 *   full token counts and simply report `costMicroUsd: null`, so adding a new
 *   model never blocks on updating this file.
 *
 * Source: https://ai.google.dev/gemini-api/docs/pricing
 */
export type ModelPricing = {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
  /** Cache *reads*. Null when the model has no published cached-input rate. */
  cachedInputPerMillionUsd: number | null;
  /**
   * Some models bill a higher rate once a single request's prompt crosses a
   * context threshold. When set, prompts above the threshold use the long-context
   * rates for the whole request.
   */
  longContext?: {
    thresholdTokens: number;
    inputPerMillionUsd: number;
    outputPerMillionUsd: number;
  };
  verifiedOn: string;
};

export const modelPricing: Readonly<Record<string, ModelPricing>> = {
  "gemini-3.1-flash-lite": {
    inputPerMillionUsd: 0.25,
    outputPerMillionUsd: 1.5,
    cachedInputPerMillionUsd: 0.025,
    verifiedOn: "2026-08-28",
  },
  "gemini-3.7-flash": {
    inputPerMillionUsd: 0.75,
    outputPerMillionUsd: 3.75,
    cachedInputPerMillionUsd: null,
    verifiedOn: "2026-08-28",
  },
  "gemini-3.1-pro": {
    inputPerMillionUsd: 2,
    outputPerMillionUsd: 12,
    cachedInputPerMillionUsd: null,
    longContext: {
      thresholdTokens: 200_000,
      inputPerMillionUsd: 4,
      outputPerMillionUsd: 12,
    },
    verifiedOn: "2026-08-28",
  },
  "gemini-2.5-flash": {
    inputPerMillionUsd: 0.3,
    outputPerMillionUsd: 2.5,
    cachedInputPerMillionUsd: null,
    verifiedOn: "2026-08-28",
  },
};

export type AiUsage = {
  /** Total prompt tokens, inclusive of `cachedPromptTokens`. */
  promptTokens: number;
  /** The cache-read subset of `promptTokens`, billed at the cheaper rate. */
  cachedPromptTokens: number;
  outputTokens: number;
  /** Reasoning tokens. Billed as output. */
  thoughtTokens: number;
  totalTokens: number;
};

/**
 * Provider ids may carry a `models/` prefix or a version suffix
 * (`gemini-3.1-flash-lite-preview-04-17`). Match the longest configured key that
 * the id starts with, so a dated variant still prices as its base model.
 */
export function pricingFor(model: string): ModelPricing | null {
  const normalized = model.replace(/^models\//, "");
  if (modelPricing[normalized]) return modelPricing[normalized];

  const match = Object.keys(modelPricing)
    .filter((key) => normalized.startsWith(key))
    .sort((a, b) => b.length - a.length)[0];
  return match ? modelPricing[match]! : null;
}

/**
 * Cost in micro-USD (1e-6 USD) as an integer, so run records can be summed
 * without accumulating floating-point drift. Returns null when the model has no
 * known price — token counts stay usable either way.
 */
export function estimateCostMicroUsd(model: string, usage: AiUsage): number | null {
  const pricing = pricingFor(model);
  if (!pricing) return null;

  const overThreshold = pricing.longContext
    && usage.promptTokens > pricing.longContext.thresholdTokens;
  const inputRate = overThreshold
    ? pricing.longContext!.inputPerMillionUsd
    : pricing.inputPerMillionUsd;
  const outputRate = overThreshold
    ? pricing.longContext!.outputPerMillionUsd
    : pricing.outputPerMillionUsd;

  // A cached-token count is only billable at the cheaper rate when the model
  // publishes one; otherwise it stays priced as ordinary input.
  const cachedTokens = pricing.cachedInputPerMillionUsd === null
    ? 0
    : Math.min(usage.cachedPromptTokens, usage.promptTokens);
  const uncachedInputTokens = usage.promptTokens - cachedTokens;
  const billableOutputTokens = usage.outputTokens + usage.thoughtTokens;

  const usd = (uncachedInputTokens * inputRate
    + cachedTokens * (pricing.cachedInputPerMillionUsd ?? 0)
    + billableOutputTokens * outputRate) / 1_000_000;

  return Math.round(usd * 1_000_000);
}
