/**
 * Stagehand model configuration.
 * Reads STAGEHAND_MODEL from env vars.
 *
 * Supported formats:
 *   - "openai/gpt-5.4-mini"              → uses OPENAI_API_KEY
 *   - "anthropic/claude-sonnet-4-6"       → uses ANTHROPIC_API_KEY
 *   - "google/gemini-3-flash-preview"     → uses GEMINI_API_KEY
 *   - "openrouter/google/gemini-3-flash"  → proxied via OpenRouter (uses OPENROUTER_API_KEY)
 *
 * OpenRouter models are rewritten to "openai/<rest>" with baseURL pointed at OpenRouter's
 * OpenAI-compatible endpoint, so Stagehand treats them as OpenAI models.
 */

const DEFAULT_MODEL = "openai/gpt-5.4-mini";
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

export type StagehandModelConfig = {
  /** Model name in Stagehand format (e.g., "openai/gpt-5.4-mini"). */
  model: string;
  /** Original provider from the env var. */
  provider: string;
  /** Client options to pass to Stagehand (baseURL, apiKey overrides). */
  clientOptions?: { baseURL?: string; apiKey?: string };
};

/** Returns the Stagehand model config from environment variables. */
export function getStagehandModelConfig(): StagehandModelConfig {
  const raw = process.env.STAGEHAND_MODEL || DEFAULT_MODEL;
  const provider = raw.split("/")[0] ?? "openai";

  // OpenRouter: rewrite "openrouter/google/gemini-3-flash" → "openai/google/gemini-3-flash"
  // and set baseURL to OpenRouter's OpenAI-compatible endpoint.
  if (provider === "openrouter") {
    const modelPath = raw.slice("openrouter/".length); // e.g. "google/gemini-3-flash"
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is required when using openrouter/ models");
    }
    return {
      model: `openai/${modelPath}`,
      provider: "openrouter",
      clientOptions: { baseURL: OPENROUTER_BASE_URL, apiKey },
    };
  }

  return { model: raw, provider };
}
