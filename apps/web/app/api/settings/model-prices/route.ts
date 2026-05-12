import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { invalidatePricingCache } from "@/lib/pricing";

/**
 * Model-pricing CRUD.
 *
 * GET  → list all rows + the set of models seen in recent audits that don't
 *        yet have a price configured, so the operator gets prompted.
 * POST → create or upsert a row (model is the PK).
 */

export const ModelPriceInput = z.object({
  model: z.string().trim().min(1).max(200),
  inputPerMTok: z.number().nonnegative().max(10_000),
  outputPerMTok: z.number().nonnegative().max(10_000),
  displayName: z.string().trim().max(200).nullable().optional(),
  provider: z.string().trim().max(64).nullable().optional(),
  notes: z.string().trim().max(500).nullable().optional(),
});

export async function GET() {
  try {
    await requireAuth();
    const rows = await prisma.modelPrice.findMany({
      orderBy: [{ provider: "asc" }, { model: "asc" }],
    });

    // Surface models that are in use in recent audits but missing a price row.
    const seen = await prisma.audit.findMany({
      where: {
        queuedAt: { gte: new Date(Date.now() - 30 * 86400_000) },
        OR: [{ funnelModel: { not: null } }, { aiAnalysis: { not: undefined } }],
      },
      select: { funnelModel: true, aiAnalysis: true },
    });
    const seenModels = new Set<string>();
    for (const a of seen) {
      if (a.funnelModel) seenModels.add(a.funnelModel);
      const am = (a.aiAnalysis as { model?: string } | null)?.model;
      if (am) seenModels.add(am);
    }
    const known = new Set(rows.map((r) => r.model));
    const missing = [...seenModels].filter((m) => !known.has(m)).sort();

    return NextResponse.json({ prices: rows, missing });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal error", detail: message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    await requireAuth();
    const body = await req.json();
    const parsed = ModelPriceInput.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", detail: parsed.error.flatten() },
        { status: 400 },
      );
    }
    const data = {
      model: parsed.data.model,
      inputPerMTok: parsed.data.inputPerMTok,
      outputPerMTok: parsed.data.outputPerMTok,
      displayName: parsed.data.displayName ?? null,
      provider: parsed.data.provider ?? null,
      notes: parsed.data.notes ?? null,
    };
    const row = await prisma.modelPrice.upsert({
      where: { model: data.model },
      create: data,
      update: data,
    });
    invalidatePricingCache();
    return NextResponse.json({ price: row });
  } catch (err) {
    if (err instanceof Error && err.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Internal error", detail: message }, { status: 500 });
  }
}
