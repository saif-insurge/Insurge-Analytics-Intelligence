/**
 * Thrown when an AI provider (Gemini, Anthropic, OpenAI, etc.) returns an
 * error that means we can't reliably complete the audit — quota exceeded,
 * billing cap hit, invalid API key, sustained rate limiting after retries,
 * or service unavailability.
 *
 * Always fatal: the audit short-circuits to status=FAILED with this error's
 * message as the failureReason shown in the UI. Distinguishing AI-provider
 * errors from generic site/browser failures matters because the latter can
 * still produce a useful (degraded) audit, while the former produce a
 * misleading "no GA4 detected" false negative if we silently continue.
 */
export class AiProviderError extends Error {
  /** The original underlying error for logs. */
  public readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "AiProviderError";
    this.cause = cause;
  }
}

/**
 * Returns an AiProviderError if the given error matches a known AI provider
 * failure pattern (billing, quota, auth, rate limit, unavailable). Returns
 * null otherwise — caller should preserve the original error type so other
 * failures (browser crashes, navigation timeouts, etc.) keep their current
 * degraded-completion behavior.
 *
 * Pattern-based on error messages because Stagehand wraps Gemini/Anthropic
 * errors in a generic envelope (e.g. "Failed after 3 attempts. Last error:
 * <provider message>") and the underlying SDK errors aren't typed when they
 * bubble through. Inspecting the message is the simplest reliable signal.
 */
export function detectAiProviderError(err: unknown): AiProviderError | null {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();

  const patterns: { regex: RegExp; userMessage: string }[] = [
    // Gemini AI Studio — most common in this codebase
    {
      regex: /spending cap|spend cap|exceeded its monthly/i,
      userMessage: "Gemini monthly spending cap reached — top up at ai.studio/spend",
    },
    // Any provider — quota
    {
      regex: /quota.*exceeded|exceeded.*quota|insufficient_quota/i,
      userMessage: "AI provider quota exceeded — check billing dashboard",
    },
    // Anthropic / OpenAI — billing
    {
      regex: /insufficient.balance|payment.required|billing.required/i,
      userMessage: "AI provider requires payment — check billing dashboard",
    },
    // Auth
    {
      regex: /invalid.api.key|unauthorized|\b401\b|authentication.failed/i,
      userMessage: "AI provider auth failed — API key may be missing or revoked",
    },
    // Rate limit (only after Stagehand's own retries fail)
    {
      regex: /rate.?limit|\b429\b|too many requests/i,
      userMessage: "AI provider rate-limited (retries exhausted) — retry in a few minutes",
    },
    // Service unavailable
    {
      regex: /\b503\b|service unavailable|overloaded/i,
      userMessage: "AI provider currently unavailable — retry shortly",
    },
  ];

  for (const { regex, userMessage } of patterns) {
    if (regex.test(lower)) return new AiProviderError(userMessage, err);
  }
  return null;
}
