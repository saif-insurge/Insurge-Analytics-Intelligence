import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma, Prisma } from "@/lib/db";

/** GET /api/settings/costs — aggregate AI cost stats across all audits. */
export async function GET() {
  try {
    const { organizationId } = await requireAuth();

    const audits = await prisma.audit.findMany({
      where: { organizationId, aiAnalysis: { not: Prisma.JsonNull } },
      select: { id: true, domain: true, aiAnalysis: true, queuedAt: true },
      orderBy: { queuedAt: "desc" },
    });

    let totalCost = 0;
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalTokens = 0;
    const auditCosts: { id: string; domain: string; cost: number; tokens: number; date: string }[] = [];

    for (const audit of audits) {
      const analysis = audit.aiAnalysis as Record<string, unknown> | null;
      if (!analysis) continue;
      const cost = (analysis.estimatedCostUsd as number) ?? 0;
      const input = (analysis.inputTokens as number) ?? 0;
      const output = (analysis.outputTokens as number) ?? 0;
      const tokens = (analysis.tokensUsed as number) ?? 0;

      totalCost += cost;
      totalInputTokens += input;
      totalOutputTokens += output;
      totalTokens += tokens;

      auditCosts.push({
        id: audit.id,
        domain: audit.domain,
        cost,
        tokens,
        date: audit.queuedAt.toISOString(),
      });
    }

    return NextResponse.json({
      totalCost,
      totalInputTokens,
      totalOutputTokens,
      totalTokens,
      totalAudits: audits.length,
      averageCostPerAudit: audits.length > 0 ? totalCost / audits.length : 0,
      audits: auditCosts,
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
