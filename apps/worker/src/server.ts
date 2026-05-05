import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { Receiver } from "@upstash/qstash";
import { prisma, Prisma } from "@ga4-audit/db";
import { runAuditPipeline } from "./audit-runner.js";
import { analyzeNetworkRequests } from "./ai-analysis.js";

const app = new Hono();

// QStash signature verifier (disabled in dev mode)
const receiver =
  process.env.QSTASH_CURRENT_SIGNING_KEY && process.env.QSTASH_NEXT_SIGNING_KEY
    ? new Receiver({
        currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY,
        nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY,
      })
    : null;

app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post("/audit", async (c) => {
  // 1. Verify QStash signature (skip in dev)
  if (receiver) {
    const signature = c.req.header("upstash-signature");
    const body = await c.req.text();
    try {
      const isValid = await receiver.verify({ signature: signature!, body });
      if (!isValid) return c.text("Invalid signature", 401);
    } catch {
      return c.text("Signature verification failed", 401);
    }
    // Re-parse body after text() consumed it
    const payload = JSON.parse(body);
    return handleAudit(c, payload);
  }

  // Dev mode — no signature verification
  const payload = await c.req.json();
  return handleAudit(c, payload);
});

async function handleAudit(
  c: { json: (data: unknown, status?: number) => Response },
  payload: { auditId: string; notifyEmail?: string },
) {
  const { auditId, notifyEmail } = payload;
  if (!auditId) {
    return c.json({ error: "Missing auditId" }, 400);
  }

  // Check if audit exists and is not already complete
  const existing = await prisma.audit.findUnique({ where: { id: auditId } });
  if (!existing) {
    return c.json({ error: "Audit not found" }, 404);
  }
  if (existing.status === "COMPLETE") {
    return c.json({ message: "Audit already complete", auditId }, 200);
  }

  // Fire and forget — respond to QStash quickly, run audit in background
  runAuditPipeline({
    auditId,
    url: existing.url,
    operator: existing.createdById,
    organizationId: existing.organizationId,
    userId: existing.createdById,
    notifyEmail,
    onStatus: async (status) => {
      try {
        await prisma.audit.update({
          where: { id: auditId },
          data: {
            status: status as "RUNNING" | "ANALYZING" | "RENDERING" | "COMPLETE",
            ...(status === "RUNNING" ? { startedAt: new Date() } : {}),
            ...(status === "COMPLETE" ? { completedAt: new Date() } : {}),
          },
        });
      } catch (err) {
        console.error(`Failed to update status to ${status}:`, err);
      }
    },
  }).catch(async (err) => {
    console.error(`Audit ${auditId} failed:`, err);
    await prisma.audit.update({
      where: { id: auditId },
      data: {
        status: "FAILED",
        failedAt: new Date(),
        failureReason: err instanceof Error ? err.message : String(err),
      },
    }).catch(() => {});
  });

  return c.json({ accepted: true, auditId });
}

// ─── Re-analyze: re-run AI analysis on existing audit data ──────────
app.post("/reanalyze", async (c) => {
  const { auditId } = await c.req.json();
  if (!auditId) return c.json({ error: "Missing auditId" }, 400);

  const audit = await prisma.audit.findUnique({ where: { id: auditId } });
  if (!audit || audit.status !== "COMPLETE") {
    return c.json({ error: "Audit not found or not complete" }, 404);
  }

  // Get all request URLs and event names from stored data
  const events = (audit.events as Array<{ endpoint?: string; name?: string }>) ?? [];
  const allUrls = events.map((e) => e.endpoint).filter(Boolean) as string[];
  const capturedEventNames = events.map((e) => e.name).filter(Boolean) as string[];
  const ga4EventCount = capturedEventNames.length;

  try {
    const aiResult = await analyzeNetworkRequests(allUrls, ga4EventCount, audit.domain, capturedEventNames);

    await prisma.audit.update({
      where: { id: auditId },
      data: {
        aiAnalysis: {
          summary: aiResult.summary,
          insights: aiResult.insights,
          ga4Present: aiResult.ga4Present,
          tokensUsed: aiResult.tokensUsed,
          inputTokens: aiResult.inputTokens,
          outputTokens: aiResult.outputTokens,
          estimatedCostUsd: aiResult.estimatedCostUsd,
        } as unknown as Prisma.InputJsonValue,
        detectedPlatforms: aiResult.detectedPlatforms as unknown as Prisma.InputJsonValue,
      },
    });

    return c.json({ status: "complete", summary: aiResult.summary });
  } catch (err) {
    console.error("Reanalyze failed:", err);
    return c.json({ error: err instanceof Error ? err.message : "Analysis failed" }, 500);
  }
});

// ─── Dev-only route: trigger audit directly without QStash ──────────
app.post("/audit/dev", async (c) => {
  const { url, operator = "dev@local" } = await c.req.json();
  if (!url) return c.json({ error: "Missing url" }, 400);

  const domain = new URL(url).hostname;
  const orgId = "org_dev";
  const userId = "user_dev";

  // Create audit row
  await prisma.organization.upsert({
    where: { id: orgId },
    update: {},
    create: { id: orgId, name: "Dev Org" },
  });
  await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, email: operator, organizationId: orgId },
  });

  const audit = await prisma.audit.create({
    data: {
      organizationId: orgId,
      createdById: userId,
      url,
      domain,
      status: "PENDING",
    },
  });

  // Run synchronously for dev (blocks until complete)
  try {
    const result = await runAuditPipeline({
      auditId: audit.id,
      url,
      operator,
      organizationId: orgId,
      userId,
      onStatus: async (status) => {
        await prisma.audit.update({
          where: { id: audit.id },
          data: {
            status: status as "RUNNING" | "ANALYZING" | "RENDERING" | "COMPLETE",
            ...(status === "RUNNING" ? { startedAt: new Date() } : {}),
            ...(status === "COMPLETE" ? { completedAt: new Date() } : {}),
          },
        }).catch(() => {});
      },
    });

    return c.json({
      auditId: audit.id,
      score: result.auditDoc.scorecard.overall.score,
      grade: result.auditDoc.scorecard.overall.grade,
      eventCount: result.eventCount,
      findingCount: result.auditDoc.findings.length,
      duration: `${Math.round(result.duration / 1000)}s`,
    });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

const port = Number(process.env.PORT) || 8080;

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Worker listening on port ${info.port}`);
});
