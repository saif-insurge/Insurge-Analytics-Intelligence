import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireApiKey, ApiAuthError } from "@/lib/api-auth";

/**
 * GET /api/v1/audits/:id — fetch one audit (full results when COMPLETE).
 * Returns 404 if the audit doesn't belong to the caller's org.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { organizationId } = await requireApiKey(req);
    const { id } = await params;

    const audit = await prisma.audit.findFirst({
      where: { id, organizationId },
      include: {
        findings: {
          select: {
            id: true,
            ruleId: true,
            category: true,
            severity: true,
            status: true,
            title: true,
            summary: true,
            evidence: true,
            impact: true,
            fix: true,
          },
        },
      },
    });

    if (!audit) {
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }

    // Redact internal funnelLog instructions (LLM prompts) — return only outcomes.
    const funnelLog = Array.isArray(audit.funnelLog)
      ? (audit.funnelLog as Array<Record<string, unknown>>).map((step) => ({
          step: step.step,
          name: step.name,
          observation: step.observation,
          urlAfter: step.urlAfter,
          success: step.success,
          error: step.error,
          timestamp: step.timestamp,
        }))
      : null;

    return NextResponse.json({
      id: audit.id,
      url: audit.url,
      domain: audit.domain,
      status: audit.status,
      platform: audit.platform,
      platformConfidence: audit.platformConfidence,
      queuedAt: audit.queuedAt,
      startedAt: audit.startedAt,
      completedAt: audit.completedAt,
      failedAt: audit.failedAt,
      failureReason: audit.failureReason,
      overallScore: audit.overallScore,
      overallGrade: audit.overallGrade,
      events: audit.events,
      pages: audit.pages,
      aiAnalysis: audit.aiAnalysis,
      detectedPlatforms: audit.detectedPlatforms,
      funnelLog,
      findings: audit.findings,
    });
  } catch (err) {
    if (err instanceof ApiAuthError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("GET /api/v1/audits/:id error:", message);
    return NextResponse.json({ error: "Internal error", detail: message }, { status: 500 });
  }
}
