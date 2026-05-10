import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CreateSingleAuditSchema, CreateBulkAuditSchema } from "@/lib/audit-schemas";
import { createAudit, ensureOrgAndUser } from "@/lib/audit-submit";

/** POST /api/audits — create single or bulk audits and enqueue to worker. */
export async function POST(req: Request) {
  try {
    const { userId, organizationId } = await requireAuth();
    const body = await req.json();

    // Detect single vs bulk
    const isBulk = Array.isArray(body.urls);
    const singleParsed = !isBulk ? CreateSingleAuditSchema.safeParse(body) : null;
    const bulkParsed = isBulk ? CreateBulkAuditSchema.safeParse(body) : null;

    if (!isBulk && (!singleParsed || !singleParsed.success)) {
      return NextResponse.json(
        { error: "Invalid request", details: singleParsed?.error?.flatten() },
        { status: 400 },
      );
    }
    if (isBulk && (!bulkParsed || !bulkParsed.success)) {
      return NextResponse.json(
        { error: "Invalid request. Max 100 URLs.", details: bulkParsed?.error?.flatten() },
        { status: 400 },
      );
    }

    const urls: string[] = isBulk ? bulkParsed!.data!.urls : [singleParsed!.data!.url];
    const notes: string | undefined = isBulk ? bulkParsed!.data!.notes : singleParsed!.data!.notes;
    const notifyEmail: string | undefined = isBulk ? bulkParsed!.data!.notifyEmail : singleParsed!.data!.notifyEmail;

    await ensureOrgAndUser({ organizationId, userId });

    const auditIds: string[] = [];
    for (const url of urls) {
      const { auditId } = await createAudit({ organizationId, userId, url, notes, notifyEmail });
      auditIds.push(auditId);
    }

    return NextResponse.json(
      isBulk
        ? { auditIds, count: auditIds.length, status: "PENDING" }
        : { auditId: auditIds[0], status: "PENDING" },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("POST /api/audits error:", message);
    return NextResponse.json({ error: "Internal error", detail: message }, { status: 500 });
  }
}

/** GET /api/audits — list audits with server-side pagination, search, and filters. */
export async function GET(req: Request) {
  try {
    const { organizationId } = await requireAuth();
    const url = new URL(req.url);

    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1"));
    const pageSize = Math.min(50, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "10")));
    const search = url.searchParams.get("search") ?? "";
    const statusFilter = url.searchParams.get("status") ?? "";
    const scoreMin = url.searchParams.get("scoreMin");
    const scoreMax = url.searchParams.get("scoreMax");
    const sortBy = url.searchParams.get("sortBy") ?? "queuedAt";
    const sortOrder = url.searchParams.get("sortOrder") === "asc" ? "asc" : "desc";

    // Build where clause
    const where: Record<string, unknown> = { organizationId };

    if (search) {
      where.domain = { contains: search, mode: "insensitive" };
    }

    if (statusFilter) {
      const statuses = statusFilter.split(",").filter(Boolean);
      if (statuses.length > 0) {
        where.status = { in: statuses };
      }
    }

    if (scoreMin || scoreMax) {
      const scoreFilter: Record<string, number> = {};
      if (scoreMin) scoreFilter.gte = parseInt(scoreMin);
      if (scoreMax) scoreFilter.lte = parseInt(scoreMax);
      where.overallScore = scoreFilter;
    }

    // Build orderBy
    const validSortFields = ["domain", "status", "overallScore", "queuedAt", "platform"];
    const orderByField = validSortFields.includes(sortBy) ? sortBy : "queuedAt";
    const orderBy = { [orderByField]: sortOrder };

    const [audits, total] = await Promise.all([
      prisma.audit.findMany({
        where,
        orderBy,
        select: {
          id: true,
          url: true,
          domain: true,
          status: true,
          overallScore: true,
          overallGrade: true,
          queuedAt: true,
          completedAt: true,
          platform: true,
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.audit.count({ where }),
    ]);

    return NextResponse.json({
      audits,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

const DeleteAuditsSchema = z.object({
  ids: z.array(z.string()).min(1).max(100),
});

/** DELETE /api/audits — bulk delete audits by IDs. */
export async function DELETE(req: Request) {
  try {
    const { organizationId } = await requireAuth();
    const body = await req.json();
    const parsed = DeleteAuditsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    // Only delete audits belonging to the user's org
    const { ids } = parsed.data;

    // Delete findings first (cascade), then audits
    await prisma.finding.deleteMany({
      where: { audit: { id: { in: ids }, organizationId } },
    });
    const result = await prisma.audit.deleteMany({
      where: { id: { in: ids }, organizationId },
    });

    return NextResponse.json({ deleted: result.count });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
