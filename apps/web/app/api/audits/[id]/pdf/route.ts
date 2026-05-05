import { NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { AuditReport } from "@ga4-audit/pdf";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import type { AuditDocument } from "@ga4-audit/audit-core";

/** GET /api/audits/[id]/pdf — generate and download PDF for authenticated users. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { organizationId } = await requireAuth();
    const { id } = await params;

    const audit = await prisma.audit.findUnique({
      where: { id },
      include: { findings: true },
    });

    if (!audit) {
      return NextResponse.json({ error: "Audit not found" }, { status: 404 });
    }
    if (audit.organizationId !== organizationId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (audit.status !== "COMPLETE") {
      return NextResponse.json({ error: "Audit not complete yet" }, { status: 400 });
    }

    // Reconstruct AuditDocument from DB
    const auditDoc: AuditDocument = {
      audit: {
        id: audit.id,
        version: "1.0.0",
        createdAt: audit.queuedAt.toISOString(),
        completedAt: (audit.completedAt ?? new Date()).toISOString(),
        operator: audit.createdById,
        site: {
          url: audit.url,
          domain: audit.domain,
          platform: {
            detected: (audit.platform ?? "custom") as AuditDocument["audit"]["site"]["platform"]["detected"],
            confidence: (audit.platformConfidence ?? "low") as "high" | "medium" | "low",
            signals: [],
          },
          stack: {
            tagManager: "gtm",
            containerIds: [],
            ga4Properties: [],
            duplicateTrackers: [],
            otherPixels: [],
          },
        },
      },
      pages: (audit.pages as AuditDocument["pages"]) ?? [],
      capturedEvents: (audit.events as AuditDocument["capturedEvents"]) ?? [],
      findings: audit.findings.map((f) => ({
        id: f.id,
        ruleId: f.ruleId,
        category: f.category as AuditDocument["findings"][0]["category"],
        severity: f.severity as AuditDocument["findings"][0]["severity"],
        status: f.status as AuditDocument["findings"][0]["status"],
        title: f.title,
        summary: f.summary,
        evidence: (f.evidence as AuditDocument["findings"][0]["evidence"]) ?? {},
        impact: f.impact ?? undefined,
        fix: (f.fix as AuditDocument["findings"][0]["fix"]) ?? undefined,
      })),
      scorecard: {
        overall: {
          grade: (audit.overallGrade ?? "fail") as "pass" | "evaluate" | "fail",
          score: audit.overallScore ?? 0,
          maxScore: 100,
        },
        categories: [],
      },
      recommendations: { immediate: [], shortTerm: [], strategic: [] },
      artifacts: {},
      operatorNotes: audit.operatorNotes ?? "",
    };

    const element = React.createElement(AuditReport, { audit: auditDoc });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const buffer = await renderToBuffer(element as any);

    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="ga4-audit-${audit.domain}.pdf"`,
      },
    });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("PDF render error:", message);
    return NextResponse.json({ error: "PDF render failed", detail: message }, { status: 500 });
  }
}
