import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey, ApiAuthError } from "@/lib/api-auth";
import { CreateSingleAuditSchema, CreateBulkAuditSchema } from "@/lib/audit-schemas";
import { createAudit, ensureOrgAndUser } from "@/lib/audit-submit";

/**
 * POST /api/v1/audits — submit one or more audits.
 * Auth: Authorization: Bearer <api-key>
 * Body (single): { url, notes?, notifyEmail? }
 * Body (bulk):   { urls: string[], notes?, notifyEmail? } — max 100
 */
export async function POST(req: Request) {
  try {
    const { organizationId, createdById } = await requireApiKey(req);
    const body = await req.json();

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

    await ensureOrgAndUser({ organizationId, userId: createdById });

    const auditIds: string[] = [];
    for (const url of urls) {
      const { auditId } = await createAudit({
        organizationId,
        userId: createdById,
        url,
        notes,
        notifyEmail,
      });
      auditIds.push(auditId);
    }

    return NextResponse.json(
      isBulk
        ? { auditIds, count: auditIds.length, status: "PENDING" }
        : { auditId: auditIds[0], status: "PENDING" },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("POST /api/v1/audits error:", message);
    return NextResponse.json({ error: "Internal error", detail: message }, { status: 500 });
  }
}

/**
 * GET /api/v1/audits — list audits for the org (paginated).
 * Query: ?page=1&pageSize=25&status=COMPLETE&search=domain
 */
export async function GET(req: Request) {
  try {
    const { organizationId } = await requireApiKey(req);
    const url = new URL(req.url);

    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "25", 10)));
    const status = url.searchParams.get("status") ?? undefined;
    const search = url.searchParams.get("search") ?? undefined;

    const where: Record<string, unknown> = { organizationId };
    if (status) where.status = status;
    if (search) where.domain = { contains: search, mode: "insensitive" };

    const [total, audits] = await Promise.all([
      prisma.audit.count({ where }),
      prisma.audit.findMany({
        where,
        orderBy: { queuedAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          url: true,
          domain: true,
          status: true,
          platform: true,
          overallScore: true,
          overallGrade: true,
          queuedAt: true,
          startedAt: true,
          completedAt: true,
          failedAt: true,
          failureReason: true,
        },
      }),
    ]);

    return NextResponse.json({
      audits,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("GET /api/v1/audits error:", message);
    return NextResponse.json({ error: "Internal error", detail: message }, { status: 500 });
  }
}
