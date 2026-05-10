import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * DELETE /api/api-keys/:id — revoke an API key (soft delete via revokedAt).
 * The key remains in the DB for audit trail but cannot be used for authentication.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { organizationId } = await requireAuth();
    const { id } = await params;

    const updated = await prisma.apiKey.updateMany({
      where: { id, organizationId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (updated.count === 0) {
      return NextResponse.json({ error: "API key not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal error", detail: message }, { status: 500 });
  }
}
