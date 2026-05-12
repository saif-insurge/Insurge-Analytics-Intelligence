import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env") });

import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { prisma, Prisma } from "@ga4-audit/db";
import { runAuditPipeline } from "./audit-runner.js";
import { analyzeNetworkRequests } from "./ai-analysis.js";

const app = new Hono();
const SHARED_SECRET = process.env.WORKER_SHARED_SECRET;

app.get("/health", (c) => {
  return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * Dispatch endpoint — called by the web app's scheduler.
 *
 * The handler AWAITS the full pipeline so Cloud Run sees the request as
 * in-flight for the entire 5-15 min audit duration. This lets Cloud Run's
 * concurrency + max-instances act as a real concurrency cap.
 */
app.post("/audit", async (c) => {
  // Shared-secret auth (replaces QStash signature verification).
  if (SHARED_SECRET && c.req.header("x-worker-token") !== SHARED_SECRET) {
    return c.text("Unauthorized", 401);
  }

  const payload = await c.req.json().catch(() => ({}));
  const auditId: string | undefined = payload?.auditId;
  if (!auditId) return c.json({ error: "Missing auditId" }, 400);

  const existing = await prisma.audit.findUnique({ where: { id: auditId } });
  if (!existing) return c.json({ error: "Audit not found" }, 404);

  // Idempotency: terminal audits are no-ops. PENDING shouldn't reach us
  // (the scheduler claims rows as RUNNING before dispatch), but tolerate it.
  if (existing.status === "COMPLETE" || existing.status === "FAILED" || existing.status === "CANCELLED") {
    pingScheduler();
    return c.json({ message: "Already terminal", auditId, status: existing.status }, 200);
  }

  // Cancellation plumbing: poll the DB every 5s and abort Stagehand cleanly
  // if the user (or anything else) flips status=CANCELLED. The poll loop
  // shuts down in the `finally` so it doesn't leak across requests.
  const ac = new AbortController();
  const pollInterval = setInterval(async () => {
    try {
      const r = await prisma.audit.findUnique({ where: { id: auditId }, select: { status: true } });
      if (r?.status === "CANCELLED") {
        console.log(`[${auditId}] Cancellation detected via DB poll — aborting.`);
        ac.abort();
      }
    } catch {
      // Swallow — next tick retries. We never want polling failures to
      // crash the audit handler.
    }
  }, 5000);

  try {
    await runAuditPipeline({
      auditId,
      url: existing.url,
      operator: existing.createdById,
      organizationId: existing.organizationId,
      userId: existing.createdById,
      notifyEmail: existing.notifyEmail ?? undefined,
      abortSignal: ac.signal,
      onStatus: async (status) => {
        try {
          // updateMany with a "notIn" guard: if the row is already CANCELLED
          // (or FAILED, defensively), don't overwrite. This is the race-safe
          // way to handle cancel-during-transition.
          await prisma.audit.updateMany({
            where: { id: auditId, status: { notIn: ["CANCELLED", "FAILED"] } },
            data: {
              status: status as "RUNNING" | "ANALYZING" | "RENDERING" | "COMPLETE",
              ...(status === "RUNNING" ? { startedAt: new Date() } : {}),
              ...(status === "COMPLETE" ? { completedAt: new Date() } : {}),
            },
          });
        } catch (err) {
          // Log loudly — a silently-dropped status update means the orphan
          // sweep is our only recovery path.
          console.error(`[${auditId}] Failed to update status to ${status}:`, err);
        }
      },
    });
    return c.json({ ok: true, auditId });
  } catch (err) {
    // If the user cancelled, the row is already in CANCELLED state — don't
    // overwrite it with FAILED. Just exit cleanly so the slot frees up.
    const current = await prisma.audit.findUnique({ where: { id: auditId }, select: { status: true } }).catch(() => null);
    if (current?.status === "CANCELLED") {
      console.log(`[${auditId}] Audit cancelled by user — pipeline aborted cleanly.`);
      return c.json({ cancelled: true, auditId }, 200);
    }

    console.error(`[${auditId}] Audit failed:`, err);
    try {
      await prisma.audit.update({
        where: { id: auditId },
        data: {
          status: "FAILED",
          failedAt: new Date(),
          failureReason: err instanceof Error ? err.message : String(err),
        },
      });
    } catch (dbErr) {
      // Worst case: orphan sweep catches this in ORPHAN_AGE_MINUTES.
      console.error(`[${auditId}] Failed to mark audit as FAILED:`, dbErr);
    }
    return c.json({ error: "Audit failed", auditId }, 500);
  } finally {
    clearInterval(pollInterval);
    // Free the next slot immediately — fire-and-forget ping back to the web
    // scheduler. If the ping fails, the Coolify cron will catch up within 60s.
    pingScheduler();
  }
});

/** Fire-and-forget ping to the web app's scheduler tick endpoint. */
function pingScheduler(): void {
  const webUrl = process.env.WEB_BASE_URL;
  const token = process.env.SCHEDULER_TOKEN;
  if (!webUrl || !token) return;
  void fetch(`${webUrl}/api/scheduler/tick`, {
    method: "POST",
    headers: { "X-Scheduler-Token": token },
    keepalive: true,
  }).catch((err) => {
    console.error("Scheduler ping failed (cron will catch up):", err);
  });
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
