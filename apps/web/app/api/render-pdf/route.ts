import { NextResponse } from "next/server";
import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { AuditReport } from "@ga4-audit/pdf";
import { prisma } from "@/lib/db";
import type { AuditDocument } from "@ga4-audit/audit-core";

/** POST /api/render-pdf — renders a PDF report for a completed audit.
 *  Called by the worker after audit completes, or on-demand.
 *  Authed by x-internal-secret header (worker→web) or Clerk (user).
 */
export async function POST(req: Request) {
  // Verify internal secret
  const internalSecret = process.env.INTERNAL_SECRET;
  const providedSecret = req.headers.get("x-internal-secret");

  if (internalSecret && providedSecret !== internalSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { auditId } = await req.json();
  if (!auditId) {
    return NextResponse.json({ error: "Missing auditId" }, { status: 400 });
  }

  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
    include: { findings: true },
  });

  if (!audit || audit.status !== "COMPLETE") {
    return NextResponse.json({ error: "Audit not found or not complete" }, { status: 404 });
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
          detected: (audit.platform as AuditDocument["audit"]["site"]["platform"]["detected"]) ?? "custom",
          confidence: (audit.platformConfidence as "high" | "medium" | "low") ?? "low",
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
        grade: (audit.overallGrade as "pass" | "evaluate" | "fail") ?? "fail",
        score: audit.overallScore ?? 0,
        maxScore: 100,
      },
      categories: [],
    },
    recommendations: { immediate: [], shortTerm: [], strategic: [] },
    artifacts: {},
    operatorNotes: audit.operatorNotes ?? "",
  };

  // Render PDF
  const element = React.createElement(AuditReport, { audit: auditDoc });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const buffer = await renderToBuffer(element as any);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="ga4-audit-${audit.domain}.pdf"`,
    },
  });
}
