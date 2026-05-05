/**
 * Database persistence — writes an AuditDocument to Postgres.
 * Maps the audit document fields to the Prisma Audit + Finding models.
 */

import { prisma, Prisma } from "@ga4-audit/db";
import type { AuditDocument } from "@ga4-audit/audit-core";

/** Persists a completed audit to the database. Creates the audit row + finding rows. */
export async function persistAudit(
  auditDoc: AuditDocument,
  meta: {
    organizationId: string;
    createdById: string;
    aiAnalysis?: unknown;
    detectedPlatforms?: unknown;
    funnelLog?: unknown;
  },
) {
  const audit = auditDoc.audit;
  const site = audit.site;

  // Upsert organization (single-user for now, but data model supports multi-tenant)
  await prisma.organization.upsert({
    where: { id: meta.organizationId },
    update: {},
    create: { id: meta.organizationId, name: "Default Organization" },
  });

  // Upsert user
  await prisma.user.upsert({
    where: { id: meta.createdById },
    update: {},
    create: {
      id: meta.createdById,
      email: audit.operator,
      organizationId: meta.organizationId,
    },
  });

  const auditData = {
    status: "COMPLETE" as const,
    startedAt: new Date(audit.createdAt),
    completedAt: new Date(audit.completedAt),
    platform: site.platform.detected,
    platformConfidence: site.platform.confidence,
    overallScore: auditDoc.scorecard.overall.score,
    overallGrade: auditDoc.scorecard.overall.grade,
    events: auditDoc.capturedEvents as unknown as Prisma.InputJsonValue,
    pages: auditDoc.pages as unknown as Prisma.InputJsonValue,
    aiAnalysis: (meta.aiAnalysis ?? null) as Prisma.InputJsonValue,
    detectedPlatforms: (meta.detectedPlatforms ?? null) as Prisma.InputJsonValue,
    funnelLog: (meta.funnelLog ?? null) as Prisma.InputJsonValue,
  };

  // Delete existing findings if re-running
  await prisma.finding.deleteMany({ where: { auditId: audit.id } });

  const result = await prisma.audit.upsert({
    where: { id: audit.id },
    update: {
      ...auditData,
      findings: {
        create: auditDoc.findings.map((f) => ({
          ruleId: f.ruleId,
          category: f.category,
          severity: f.severity,
          status: f.status,
          title: f.title,
          summary: f.summary,
          evidence: f.evidence as unknown as Prisma.InputJsonValue,
          impact: f.impact,
          fix: f.fix ? (f.fix as unknown as Prisma.InputJsonValue) : undefined,
        })),
      },
    },
    create: {
      id: audit.id,
      organizationId: meta.organizationId,
      createdById: meta.createdById,
      url: site.url,
      domain: site.domain,
      ...auditData,
      findings: {
        create: auditDoc.findings.map((f) => ({
          ruleId: f.ruleId,
          category: f.category,
          severity: f.severity,
          status: f.status,
          title: f.title,
          summary: f.summary,
          evidence: f.evidence as unknown as Prisma.InputJsonValue,
          impact: f.impact,
          fix: f.fix ? (f.fix as unknown as Prisma.InputJsonValue) : undefined,
        })),
      },
    },
    include: { findings: true },
  });

  return result;
}
