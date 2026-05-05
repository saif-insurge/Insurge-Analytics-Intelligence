import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/** GET /api/audits/[id] — get audit details + findings. Used for status polling. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { organizationId } = await requireAuth();
    const { id } = await params;

    const audit = await prisma.audit.findUnique({
      where: { id },
      include: {
        findings: {
          orderBy: { severity: "asc" },
        },
      },
      // events is a Json field — included by default in findUnique
    });

    if (!audit) {
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }

    if (audit.organizationId !== organizationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json({ audit });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

/** PATCH /api/audits/[id] — update operator notes. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { organizationId } = await requireAuth();
    const { id } = await params;
    const body = await req.json();

    const audit = await prisma.audit.findUnique({ where: { id } });
    if (!audit || audit.organizationId !== organizationId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const updated = await prisma.audit.update({
      where: { id },
      data: { operatorNotes: body.operatorNotes ?? audit.operatorNotes },
    });

    return NextResponse.json({ audit: updated });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
