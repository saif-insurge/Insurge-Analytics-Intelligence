import { NextResponse } from "next/server";
import { tick } from "@/lib/scheduler";

/**
 * Scheduler tick endpoint.
 *
 * Called by:
 *   - Coolify Scheduled Task every 60s (safety net for missed signals)
 *   - The worker after each audit completes (immediate slot-freeing)
 *
 * Auth via shared X-Scheduler-Token header. Returns counts of orphans reset,
 * audits dispatched, FAILED rows cleaned, and total audits currently running.
 */
async function handler(req: Request) {
  const token = req.headers.get("x-scheduler-token");
  if (!process.env.SCHEDULER_TOKEN || token !== process.env.SCHEDULER_TOKEN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await tick();
    return NextResponse.json(result);
  } catch (err) {
    console.error("Scheduler tick failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export const POST = handler;
// GET is allowed for manual debugging via curl (still token-checked).
export const GET = handler;
