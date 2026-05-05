import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma, Prisma } from "@/lib/db";

/** POST /api/audits/[id]/reanalyze — triggers the worker to re-run AI analysis. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { organizationId } = await requireAuth();
    const { id } = await params;

    const audit = await prisma.audit.findUnique({ where: { id } });
    if (!audit || audit.organizationId !== organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (audit.status !== "COMPLETE") {
      return NextResponse.json({ error: "Audit must be complete to re-analyze" }, { status: 400 });
    }

    // Call worker's reanalyze endpoint
    const workerUrl = process.env.WORKER_BASE_URL;
    if (!workerUrl) {
      return NextResponse.json({ error: "Worker not configured" }, { status: 500 });
    }

    const res = await fetch(`${workerUrl}/reanalyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auditId: id }),
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Worker failed" }, { status: 500 });
    }

    return NextResponse.json({ status: "analyzing" });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
