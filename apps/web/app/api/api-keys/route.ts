import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateApiKey } from "@/lib/api-keys";
import { ensureOrgAndUser } from "@/lib/audit-submit";

const CreateApiKeySchema = z.object({
  name: z.string().min(1).max(100),
});

/** GET /api/api-keys — list the org's API keys (without plaintext). */
export async function GET() {
  try {
    const { organizationId } = await requireAuth();
    const keys = await prisma.apiKey.findMany({
      where: { organizationId, revokedAt: null },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        prefix: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ keys });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal error", detail: message }, { status: 500 });
  }
}

/**
 * POST /api/api-keys — create a new API key.
 * Returns the plaintext ONCE. After this response, only metadata is retrievable.
 */
export async function POST(req: Request) {
  try {
    const { organizationId, userId } = await requireAuth();
    const body = await req.json();
    const parsed = CreateApiKeySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    await ensureOrgAndUser({ organizationId, userId });

    const { plaintext, hash, prefix } = generateApiKey();
    const key = await prisma.apiKey.create({
      data: {
        organizationId,
        createdById: userId,
        name: parsed.data.name,
        prefix,
        keyHash: hash,
      },
      select: { id: true, name: true, prefix: true, createdAt: true },
    });

    return NextResponse.json(
      {
        ...key,
        plaintext, // shown to the user ONCE — they must save it
        warning: "Store this key securely. It will not be shown again.",
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal error", detail: message }, { status: 500 });
  }
}
