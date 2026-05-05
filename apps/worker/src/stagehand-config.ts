/**
 * Stagehand model configuration.
 * Reads STAGEHAND_MODEL from env vars (format: "provider/model").
 * Stagehand v3 auto-resolves API keys from OPENAI_API_KEY / ANTHROPIC_API_KEY
 * based on the provider prefix.
 */

const DEFAULT_MODEL = "openai/gpt-4.1-mini";

/** Returns the Stagehand model config from environment variables. */
export function getStagehandModelConfig() {
  const model = process.env.STAGEHAND_MODEL || DEFAULT_MODEL;
  const provider = model.split("/")[0] ?? "openai";

  return { model, provider };
}
