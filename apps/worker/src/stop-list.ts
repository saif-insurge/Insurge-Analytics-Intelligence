/**
 * Payment stop-list — deterministic guardrail that prevents clicking
 * purchase-completion buttons. This is code, not a prompt instruction.
 *
 * Per spec: block on checkout pages. Allow "buy now" on PDP to capture events.
 */

const PAYMENT_FORBIDDEN_PATTERNS = [
  /place\s*order/i,
  /complete\s*purchase/i,
  /pay\s*now/i,
  /submit\s*order/i,
  /confirm\s*and\s*pay/i,
  /confirm\s*order/i,
  /process\s*payment/i,
  /complete\s*order/i,
  /finalize\s*purchase/i,
];

/** Returns true if the given text matches a payment completion pattern. */
export function isPaymentAction(text: string): boolean {
  return PAYMENT_FORBIDDEN_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Checks an array of observed actions and returns only the safe ones.
 * Logs a warning for any blocked actions.
 */
export function filterSafeActions<T extends { description?: string }>(
  actions: T[],
): T[] {
  return actions.filter((action) => {
    const text = action.description ?? "";
    if (isPaymentAction(text)) {
      console.warn(`🚫 STOP-LIST BLOCKED: "${text}"`);
      return false;
    }
    return true;
  });
}
