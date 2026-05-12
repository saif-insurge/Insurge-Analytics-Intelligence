import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * POST /api/audits/:id/cancel
 *
 * Flips status to CANCELLED if the audit is still in flight. Idempotent —
 * calling it on an already-terminal audit returns 200 with `cancelled: false`.
 *
 * For a PENDING audit, the scheduler picks up the new status next tick and
 * skips it. For a RUNNING/ANALYZING/RENDERING audit, the worker's own 5s
 * poll detects the CANCELLED status, aborts Stagehand, and exits cleanly.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { organizationId } = await requireAuth();
    const { id } = await params;

    // Atomic conditional update — only succeeds if the audit is still in a
    // cancellable state. updateMany returns a count; we never throw on "no
    // rows updated" — that's the idempotent / already-terminal case.
    const result = await prisma.audit.updateMany({
      where: {
        id,
        organizationId,
        status: { in: ["PENDING", "RUNNING", "ANALYZING", "RENDERING"] },
      },
      data: {
        status: "CANCELLED",
        failureReason: "Cancelled by user",
        failedAt: new Date(),
      },
    });

    if (result.count === 0) {
      // Either the audit doesn't exist, isn't ours, or is already terminal.
      const current = await prisma.audit.findUnique({
        where: { id },
        select: { status: true, organizationId: true },
      });
      if (!current || current.organizationId !== organizationId) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
      return NextResponse.json({ cancelled: false, currentStatus: current.status }, { status: 200 });
    }

    return NextResponse.json({ cancelled: true });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal error", detail: message }, { status: 500 });
  }
}
