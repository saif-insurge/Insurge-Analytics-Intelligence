import { randomBytes, createHash, timingSafeEqual } from "crypto";

const KEY_PREFIX = "ina_live_";
const PREFIX_DISPLAY_LEN = 12; // chars including KEY_PREFIX shown for UI identification

/**
 * Generates a new API key.
 * Returns the plaintext (returned once to the user), its SHA-256 hash (stored in DB),
 * and a short prefix for UI display.
 */
export function generateApiKey(): { plaintext: string; hash: string; prefix: string } {
  const random = randomBytes(32).toString("base64url");
  const plaintext = `${KEY_PREFIX}${random}`;
  const hash = hashApiKey(plaintext);
  const prefix = plaintext.slice(0, PREFIX_DISPLAY_LEN);
  return { plaintext, hash, prefix };
}

/** SHA-256 hash of an API key, hex-encoded. */
export function hashApiKey(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/** Constant-time hex string comparison to avoid timing attacks. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}
