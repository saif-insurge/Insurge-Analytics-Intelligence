/**
 * Per-model token pricing in USD per million tokens. Used by both the
 * worker (live cost during audit) and the web app (Settings → Inference
 * Ledger). Costs are computed on-the-fly from stored token counts and the
 * model name, so price changes here auto-propagate to historical rows
 * without re-migrating the DB.
 *
 * Keys must match the strings persisted in `Audit.funnelModel` (Stagehand
 * format like `"google/gemini-3-flash-preview"`) and the strings stored
 * inside `aiAnalysis.model` (bare names like `"gpt-4.1-mini"`).
 *
 * Keep the comment next to each entry with the date it was last verified
 * against the provider's public pricing page.
 */

export type ModelPricing = {
  /** USD per 1,000,000 input tokens. */
  inputPerMTok: number;
  /** USD per 1,000,000 output tokens. */
  outputPerMTok: number;
};

export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Google Gemini — verified May 2026
  "google/gemini-3-flash-preview": { inputPerMTok: 0.10, outputPerMTok: 0.40 },
  "google/gemini-2.5-flash":       { inputPerMTok: 0.075, outputPerMTok: 0.30 },
  "google/gemini-2.0-flash":       { inputPerMTok: 0.10, outputPerMTok: 0.40 },
  "google/gemini-2.5-pro":         { inputPerMTok: 1.25, outputPerMTok: 5.00 },

  // OpenAI — verified May 2026
  "openai/gpt-5.4-mini":            { inputPerMTok: 0.25, outputPerMTok: 2.00 },
  "openai/gpt-5.4":                 { inputPerMTok: 2.50, outputPerMTok: 15.00 },
  "openai/gpt-4.1-mini":            { inputPerMTok: 0.15, outputPerMTok: 0.60 },
  "openai/gpt-4.1":                 { inputPerMTok: 2.00, outputPerMTok: 8.00 },
  // Bare names used by ai-analysis's OpenAI SDK call.
  "gpt-4.1-mini":                   { inputPerMTok: 0.15, outputPerMTok: 0.60 },
  "gpt-5.4-mini":                   { inputPerMTok: 0.25, outputPerMTok: 2.00 },

  // Anthropic — verified May 2026
  "anthropic/claude-sonnet-4-6":    { inputPerMTok: 3.00, outputPerMTok: 15.00 },
  "anthropic/claude-haiku-4-5":     { inputPerMTok: 1.00, outputPerMTok: 5.00 },
  "anthropic/claude-opus-4-7":      { inputPerMTok: 15.00, outputPerMTok: 75.00 },
};

/**
 * Look up a model in MODEL_PRICING and compute the USD cost of the given
 * token usage. Returns `null` when:
 *   - the model is null/undefined (caller didn't capture it yet), or
 *   - the model isn't in MODEL_PRICING (we don't know the rate).
 *
 * Caller decides how to surface unknown costs — typically render
 * "$ unknown" in the ledger so the table prompts you to add the row.
 */
export function estimateCost(
  model: string | null | undefined,
  inputTokens: number,
  outputTokens: number,
): number | null {
  if (!model) return null;
  const pricing = MODEL_PRICING[model];
  if (!pricing) return null;
  return (
    (inputTokens / 1_000_000) * pricing.inputPerMTok +
    (outputTokens / 1_000_000) * pricing.outputPerMTok
  );
}
