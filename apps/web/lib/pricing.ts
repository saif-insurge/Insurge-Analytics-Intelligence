/**
 * DB-backed model pricing helper.
 *
 * Source of truth: the `ModelPrice` Prisma table, edited via the Settings →
 * Model Pricing form. We compute cost at read time so historical audits
 * automatically recompute against the latest rate.
 *
 * Small in-process cache (5 min) so a single ledger render that loops over
 * many audits only triggers one DB query for pricing. Any write through the
 * CRUD routes calls `invalidatePricingCache()` so the next call rehydrates.
 */

import { prisma } from "@/lib/db";

type PriceMap = Map<string, { inputPerMTok: number; outputPerMTok: number }>;

let cache: { rows: PriceMap; loadedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

export function invalidatePricingCache(): void {
  cache = null;
}

async function loadPrices(): Promise<PriceMap> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.rows;
  const rows = await prisma.modelPrice.findMany({
    select: { model: true, inputPerMTok: true, outputPerMTok: true },
  });
  const map: PriceMap = new Map(
    rows.map((r) => [r.model, { inputPerMTok: r.inputPerMTok, outputPerMTok: r.outputPerMTok }]),
  );
  cache = { rows: map, loadedAt: Date.now() };
  return map;
}

/**
 * Returns USD cost for the given model + token counts, or null if the model
 * isn't in the price table. Callers typically coalesce null to 0 for display.
 */
export async function estimateCost(
  model: string | null | undefined,
  inputTokens: number,
  outputTokens: number,
): Promise<number | null> {
  if (!model) return null;
  const prices = await loadPrices();
  const p = prices.get(model);
  if (!p) return null;
  return (
    (inputTokens / 1_000_000) * p.inputPerMTok +
    (outputTokens / 1_000_000) * p.outputPerMTok
  );
}
