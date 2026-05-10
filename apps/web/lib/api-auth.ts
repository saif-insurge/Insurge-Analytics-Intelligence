import { prisma } from "@/lib/db";
import { hashApiKey } from "@/lib/api-keys";

export class ApiAuthError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "ApiAuthError";
  }
}

/**
 * Authenticates a request using an API key in the Authorization header.
 * Returns the organizationId and apiKeyId on success.
 * Throws ApiAuthError(401) on missing/invalid/revoked keys.
 *
 * Updates lastUsedAt fire-and-forget (does not block the request).
 */
export async function requireApiKey(
  req: Request,
): Promise<{ organizationId: string; apiKeyId: string; createdById: string }> {
  const header = req.headers.get("authorization") ?? req.headers.get("Authorization");
  if (!header) {
    throw new ApiAuthError(401, "Missing Authorization header");
  }

  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) {
    throw new ApiAuthError(401, "Authorization header must be: Bearer <api-key>");
  }
  const plaintext = (match[1] ?? "").trim();
  if (!plaintext) {
    throw new ApiAuthError(401, "Empty API key");
  }

  const keyHash = hashApiKey(plaintext);
  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: { id: true, organizationId: true, createdById: true, revokedAt: true },
  });

  if (!apiKey) {
    throw new ApiAuthError(401, "Invalid API key");
  }
  if (apiKey.revokedAt) {
    throw new ApiAuthError(401, "API key has been revoked");
  }

  // Fire-and-forget lastUsedAt update — don't block the request
  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch(() => { /* ignore — best-effort tracking */ });

  return {
    organizationId: apiKey.organizationId,
    apiKeyId: apiKey.id,
    createdById: apiKey.createdById,
  };
}
