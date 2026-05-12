import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { estimateCost } from "@ga4-audit/audit-core";

/**
 * GET /api/settings/costs — aggregate AI cost stats across all audits.
 *
 * Sums two cost sources:
 *   - Funnel-agent (Stagehand): tokens stored in Audit.funnel{Input,Output}Tokens
 *     with the model in Audit.funnelModel. Cost computed via estimateCost().
 *   - Post-walk analysis (OpenAI): tokens stored in Audit.aiAnalysis JSON.
 *     Cost computed via estimateCost() if model is present; falls back to
 *     the stored estimatedCostUsd for older audits that don't have a model field.
 *
 * Pricing lives in packages/audit-core/src/pricing.ts (MODEL_PRICING). Update
 * that table when providers change rates — all historical rows recompute on
 * the next fetch.
 */
export async function GET() {
  try {
    const { organizationId } = await requireAuth();

    const audits = await prisma.audit.findMany({
      where: { organizationId },
      select: {
        id: true,
        domain: true,
        queuedAt: true,
        aiAnalysis: true,
        funnelInputTokens: true,
        funnelOutputTokens: true,
        funnelModel: true,
        funnelInferenceMs: true,
      },
      orderBy: { queuedAt: "desc" },
    });

    let totalCost = 0;
    let totalFunnelCost = 0;
    let totalAnalysisCost = 0;
    let totalFunnelInputTokens = 0;
    let totalFunnelOutputTokens = 0;
    let totalAnalysisInputTokens = 0;
    let totalAnalysisOutputTokens = 0;

    const auditCosts: Array<{
      id: string;
      domain: string;
      funnelTokens: number;
      funnelCost: number;
      funnelModel: string | null;
      analysisTokens: number;
      analysisCost: number;
      analysisModel: string | null;
      totalCost: number;
      date: string;
    }> = [];

    for (const audit of audits) {
      // Funnel-agent tokens (Stagehand)
      const fIn = audit.funnelInputTokens ?? 0;
      const fOut = audit.funnelOutputTokens ?? 0;
      const funnelCost = estimateCost(audit.funnelModel, fIn, fOut) ?? 0;

      // Analysis tokens (OpenAI) — stored in JSON
      const analysis = audit.aiAnalysis as Record<string, unknown> | null;
      const aIn = (analysis?.inputTokens as number | undefined) ?? 0;
      const aOut = (analysis?.outputTokens as number | undefined) ?? 0;
      const aModel = (analysis?.model as string | undefined) ?? null;
      const analysisCost =
        estimateCost(aModel, aIn, aOut) ??
        // Backward-compat for audits run before we tracked model.
        ((analysis?.estimatedCostUsd as number | undefined) ?? 0);

      const audTotal = funnelCost + analysisCost;

      totalCost += audTotal;
      totalFunnelCost += funnelCost;
      totalAnalysisCost += analysisCost;
      totalFunnelInputTokens += fIn;
      totalFunnelOutputTokens += fOut;
      totalAnalysisInputTokens += aIn;
      totalAnalysisOutputTokens += aOut;

      // Only surface audits that had at least one cost source.
      if (audTotal > 0 || fIn + fOut > 0 || aIn + aOut > 0) {
        auditCosts.push({
          id: audit.id,
          domain: audit.domain,
          funnelTokens: fIn + fOut,
          funnelCost,
          funnelModel: audit.funnelModel,
          analysisTokens: aIn + aOut,
          analysisCost,
          analysisModel: aModel,
          totalCost: audTotal,
          date: audit.queuedAt.toISOString(),
        });
      }
    }

    const totalTokens =
      totalFunnelInputTokens + totalFunnelOutputTokens + totalAnalysisInputTokens + totalAnalysisOutputTokens;

    return NextResponse.json({
      totalCost,
      totalFunnelCost,
      totalAnalysisCost,
      totalInputTokens: totalFunnelInputTokens + totalAnalysisInputTokens,
      totalOutputTokens: totalFunnelOutputTokens + totalAnalysisOutputTokens,
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
