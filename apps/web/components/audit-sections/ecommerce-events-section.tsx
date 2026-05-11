"use client";

import { Fragment } from "react";
import type { CapturedEvent } from "./types";

/**
 * GA4 ecommerce funnel events that the synthetic shopper actively audits.
 * The agent walks through these states (home → checkout) and we expect
 * to detect each one firing.
 */
export const AUDITED_FUNNEL_EVENTS = [
  { name: "view_item_list", label: "View Item List" },
  { name: "select_item", label: "Select Item" },
  { name: "view_item", label: "View Item" },
  { name: "add_to_cart", label: "Add to Cart" },
  { name: "view_cart", label: "View Cart" },
  { name: "begin_checkout", label: "Begin Checkout" },
];

/**
 * Funnel events we deliberately don't audit — they happen post-checkout
 * (forms, payment, transaction) which the synthetic shopper avoids by
 * design (payment stop-list).
 */
export const NOT_AUDITED_FUNNEL_EVENTS = [
  { name: "add_shipping_info", label: "Add Shipping Info" },
  { name: "add_payment_info", label: "Add Payment Info" },
  { name: "purchase", label: "Purchase" },
];

const ALL_FUNNEL_EVENT_NAMES = new Set([
  ...AUDITED_FUNNEL_EVENTS.map((e) => e.name),
  ...NOT_AUDITED_FUNNEL_EVENTS.map((e) => e.name),
]);

const SUPPLEMENTARY_ECOMMERCE_EVENTS = new Set([
  "remove_from_cart", "refund", "add_to_wishlist",
  "view_promotion", "select_promotion",
]);

const ENGAGEMENT_EVENTS = new Set([
  "page_view", "scroll", "user_engagement",
  "first_visit", "session_start", "session_end",
  "search", "generate_lead", "sign_up", "login",
]);

export type EventType = "funnel" | "supplementary" | "engagement" | "custom";

export function classifyEvent(name: string): EventType {
  if (ALL_FUNNEL_EVENT_NAMES.has(name)) return "funnel";
  if (SUPPLEMENTARY_ECOMMERCE_EVENTS.has(name)) return "supplementary";
  if (ENGAGEMENT_EVENTS.has(name)) return "engagement";
  return "custom";
}

const EVENT_TYPE_GROUP_LABELS: Record<EventType, string> = {
  funnel: "Funnel",
  supplementary: "Supplementary Ecommerce",
  engagement: "Engagement / Standard",
  custom: "Custom",
};

function EventTypeBadge({ type }: { type: EventType }) {
  const styles: Record<EventType, string> = {
    funnel: "bg-accent/10 text-accent border-accent/20",
    supplementary: "bg-info/10 text-info border-info/20",
    engagement: "bg-bg-subtle text-text-muted border-border",
    custom: "bg-bg-subtle text-text-muted border-border",
  };
  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${styles[type]}`}>
      {type}
    </span>
  );
}

export function EcommerceEventsSection({ events }: { events: CapturedEvent[] }) {
  const byName = new Map<string, CapturedEvent[]>();
  for (const e of events) {
    if (!e.name) continue;
    const existing = byName.get(e.name) ?? [];
    existing.push(e);
    byName.set(e.name, existing);
  }

  type EventRow = { name: string; type: EventType; count: number; items: number };
  const byType: Record<EventType, EventRow[]> = {
    funnel: [], supplementary: [], engagement: [], custom: [],
  };
  for (const [name, evts] of byName) {
    const items = evts.reduce((s, e) => s + (e.items?.length ?? 0), 0);
    byType[classifyEvent(name)].push({ name, type: classifyEvent(name), count: evts.length, items });
  }
  for (const k of Object.keys(byType) as EventType[]) {
    byType[k].sort((a, b) => b.count - a.count);
  }

  const customEvents = byType.custom;
  const tids = [...new Set(events.map((e) => e.tid).filter(Boolean))];

  return (
    <div className="mb-8">
      <h2 className="font-display text-xl font-semibold mb-4">Ecommerce Events</h2>

      {/* GA4 Properties */}
      <div className="mb-4 flex items-center gap-2 text-sm text-text-muted">
        <span>GA4 Properties:</span>
        {tids.map((tid) => (
          <span key={tid} className="px-2 py-0.5 bg-bg-subtle border border-border rounded text-xs font-mono">
            {tid}
          </span>
        ))}
      </div>

      {/* Funnel checklist — only audited events */}
      <div className="glass rounded-lg p-4 sm:p-5 mb-4">
        <h3 className="text-sm font-medium text-text-muted mb-3 uppercase tracking-wide">Funnel Event Checklist</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {AUDITED_FUNNEL_EVENTS.map((funnelEvent) => {
            const captured = byName.get(funnelEvent.name);
            const found = captured && captured.length > 0;
            const itemCount = captured?.reduce((sum, e) => sum + (e.items?.length ?? 0), 0) ?? 0;
            return (
              <div
                key={funnelEvent.name}
                className={`flex items-center gap-2 p-2.5 rounded-md border ${found ? "bg-success/5 border-success/20" : "bg-danger/5 border-danger/20"}`}
              >
                <span className={`text-base ${found ? "text-success" : "text-danger"}`}>
                  {found ? "✓" : "✗"}
                </span>
                <div>
                  <div className={`text-xs font-medium ${found ? "text-text" : "text-danger"}`}>
                    {funnelEvent.name}
                  </div>
                  <div className={`text-[10px] ${found ? "text-success" : "text-danger/70"}`}>
                    {found ? `${captured!.length}x · ${itemCount} items` : "Not Detected"}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Not audited — events we deliberately skip */}
        <div className="mt-4 pt-4 border-t border-border-subtle">
          <div className="flex items-baseline gap-2 mb-2">
            <span className="text-[10px] tracking-wider uppercase text-text-faint">Not Audited</span>
            <span className="text-[10px] text-text-faint">— skipped by the synthetic shopper (payment stop-list)</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {NOT_AUDITED_FUNNEL_EVENTS.map((evt) => (
              <span
                key={evt.name}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-bg-subtle border border-border-subtle text-[11px] font-mono text-text-muted"
              >
                <span className="text-text-faint">—</span>
                {evt.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* All captured events — table grouped by type */}
      <div className="glass rounded-lg p-4 sm:p-5 mb-4">
        <h3 className="text-sm font-medium text-text-muted mb-3 uppercase tracking-wide">
          All Captured Events ({events.length} total)
        </h3>

        <div className="overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0">
        <table className="w-full text-sm min-w-[20rem]">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-text-faint border-b border-border">
              <th className="py-2 pr-3 font-medium">Event</th>
              <th className="py-2 px-3 font-medium">Type</th>
              <th className="py-2 pl-3 font-medium text-right">Count</th>
            </tr>
          </thead>
          <tbody>
            {(["funnel", "supplementary", "engagement", "custom"] as const).map((type) => {
              const rows = byType[type];
              if (rows.length === 0) return null;
              return (
                <Fragment key={type}>
                  <tr className="bg-bg-subtle/30">
                    <td colSpan={3} className="py-1.5 px-2 text-[10px] uppercase tracking-wider text-text-faint">
                      {EVENT_TYPE_GROUP_LABELS[type]}
                    </td>
                  </tr>
                  {rows.map((row) => (
                    <tr key={row.name} className="border-b border-border-subtle last:border-0">
                      <td className="py-2 pr-3 font-mono text-sm text-text">{row.name}</td>
                      <td className="py-2 px-3">
                        <EventTypeBadge type={row.type} />
                      </td>
                      <td className="py-2 pl-3 text-right text-text-muted tnum">{row.count}x</td>
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>

      {/* Custom events note (informational, not warning) */}
      {customEvents.length > 0 && (
        <div className="border-l-2 border-l-text-faint/40 bg-bg-subtle/30 rounded-r-md pl-4 pr-5 py-4">
          <h3 className="text-sm font-medium mb-1.5 flex items-center gap-2 text-text">
            <span className="text-text-faint font-mono text-xs">i</span>
            Custom events detected
          </h3>
          <p className="text-xs text-text-muted mb-3 leading-relaxed">
            These don&apos;t match GA4&apos;s recommended ecommerce names, so they won&apos;t populate standard ecommerce reports.
            That may be deliberate if your team uses custom event tracking — worth confirming with whoever set up the implementation.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {customEvents.map((row) => (
              <span key={row.name} className="text-xs px-2 py-1 bg-bg border border-border text-text-muted rounded-md font-mono">
                {row.name} <span className="text-text-faint">({row.count}x)</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
