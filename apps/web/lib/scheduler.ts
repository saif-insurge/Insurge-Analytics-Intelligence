import { prisma } from "@/lib/db";

/** Max concurrent audits in non-terminal status. Matches Cloud Run max-instances × concurrency. */
const CONCURRENCY = 10;
/** RUNNING/ANALYZING/RENDERING longer than this gets reset to PENDING by the orphan sweep. */
const ORPHAN_AGE_MINUTES = 30;
/** FAILED audits older than this get deleted. */
const CLEANUP_AGE_DAYS = 2;
/** Postgres advisory lock key — arbitrary int, just needs to be the same everywhere. */
const ADVISORY_LOCK_KEY = 42;

export type TickResult = {
  /** How many stuck audits were reset to PENDING. */
  orphansReset: number;
  /** How many PENDING audits were claimed (status → RUNNING) and dispatched in this tick. */
  dispatched: number;
  /** How many old FAILED rows were deleted. */
  cleaned: number;
  /** Total audits in non-terminal status after this tick. */
  running: number;
};

/**
 * Single source of truth for moving audits through the pipeline.
 *
 * Called from three places:
 *   1. `/api/scheduler/tick` (Coolify cron, every 60s — safety net)
 *   2. `createAudit()` after writing a new PENDING row (low-latency dispatch)
 *   3. Worker on audit completion (immediate slot-freeing ping)
 *
 * Uses a Postgres advisory lock so concurrent callers serialize — only one tick
 * actually does work at a time. The others just return what they observed.
 */
export async function tick(): Promise<TickResult> {
  const result = await prisma.$transaction(async (tx) => {
    // Block other tick() calls until this transaction commits.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${ADVISORY_LOCK_KEY})`;

    // 1. Reset orphans — audits that have been in a non-terminal status longer
    //    than ORPHAN_AGE_MINUTES (e.g. worker crashed, Cloud Run evicted, etc.)
    const orphans = await tx.audit.updateMany({
      where: {
        status: { in: ["RUNNING", "ANALYZING", "RENDERING"] },
        startedAt: { lt: new Date(Date.now() - ORPHAN_AGE_MINUTES * 60_000) },
      },
      data: {
        status: "PENDING",
        startedAt: null,
        failureReason: `Reset by scheduler — exceeded ${ORPHAN_AGE_MINUTES} min runtime`,
      },
    });

    // 2. How many slots are open right now?
    const running = await tx.audit.count({
      where: { status: { in: ["RUNNING", "ANALYZING", "RENDERING"] } },
    });

    // 3. Claim up to (CONCURRENCY - running) PENDING audits, oldest first.
    const slots = Math.max(0, CONCURRENCY - running);
    const candidates =
      slots > 0
        ? await tx.audit.findMany({
            where: { status: "PENDING" },
            orderBy: { queuedAt: "asc" },
            take: slots,
            select: { id: true },
          })
        : [];

    if (candidates.length > 0) {
      await tx.audit.updateMany({
        where: { id: { in: candidates.map((c) => c.id) } },
        data: { status: "RUNNING", startedAt: new Date(), failureReason: null },
      });
    }

    // 4. Cleanup: drop FAILED audits older than CLEANUP_AGE_DAYS days.
    const cleaned = await tx.audit.deleteMany({
      where: {
        status: "FAILED",
        failedAt: { lt: new Date(Date.now() - CLEANUP_AGE_DAYS * 86400_000) },
      },
    });

    return {
      orphansReset: orphans.count,
      claimedIds: candidates.map((c) => c.id),
      cleaned: cleaned.count,
      running: running + candidates.length,
    };
  });

  // Dispatch outside the transaction so we don't hold the advisory lock during
  // HTTP. Dispatch is fire-and-forget — the worker holds the connection open
  // for the full audit duration and writes status updates to the DB.
  for (const id of result.claimedIds) {
    dispatchToWorker(id);
  }

  return {
    orphansReset: result.orphansReset,
    dispatched: result.claimedIds.length,
    cleaned: result.cleaned,
    running: result.running,
  };
}

/**
 * Sends an HTTP POST to the Cloud Run worker to start an audit.
 * Fire-and-forget: we don't await the response because the worker holds the
 * request open for the full 5-15 min pipeline. The audit's status is tracked
 * in the DB; if dispatch fails (network, Cloud Run unavailable, etc.), the
 * audit stays in RUNNING and the orphan sweep picks it up after 30 min.
 */
function dispatchToWorker(auditId: string): void {
  const workerUrl = process.env.WORKER_BASE_URL;
  if (!workerUrl) {
    console.error(`No WORKER_BASE_URL — cannot dispatch audit ${auditId}`);
    return;
  }
  // `keepalive: true` lets the request survive past the end of the current
  // execution context (e.g. a Next.js serverless function returning).
  void fetch(`${workerUrl}/audit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Worker-Token": process.env.WORKER_SHARED_SECRET ?? "",
    },
    body: JSON.stringify({ auditId }),
    keepalive: true,
  }).catch((err) => {
    console.error(`Failed to dispatch audit ${auditId} to worker:`, err);
  });
}
