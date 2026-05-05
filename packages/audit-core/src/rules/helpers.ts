/** Shared utilities for rule implementations. */

import type {
  AuditDocument,
  CapturedEvent,
  Finding,
  FindingCategory,
  FindingSeverity,
  FindingStatus,
  PageRecord,
} from "../types.js";
import type { Rule } from "./types.js";

/** Filter captured events by event name. */
export function findEventsByName(
  audit: AuditDocument,
  name: string,
): CapturedEvent[] {
  return audit.capturedEvents.filter((e) => e.name === name);
}

/** Filter pages by classification type. */
export function findPagesByType(
  audit: AuditDocument,
  type: PageRecord["classification"]["type"],
): PageRecord[] {
  return audit.pages.filter((p) => p.classification.type === type);
}

/** Find captured events associated with a specific page. */
export function findEventsOnPage(
  audit: AuditDocument,
  pageId: string,
): CapturedEvent[] {
  return audit.capturedEvents.filter((e) => e.pageId === pageId);
}

/** Check if an event has a non-empty value for a given param key. */
export function hasParam(event: CapturedEvent, key: string): boolean {
  const val = event.params[key];
  return val !== undefined && val !== null && val !== "";
}

/** Safely get an item field value. */
export function getItemField(
  item: Record<string, unknown>,
  field: string,
): unknown {
  return item[field];
}

let findingCounter = 0;

/** Factory to create a Finding with defaults filled from the Rule. */
export function makeFinding(
  rule: Rule,
  overrides: {
    severity: FindingSeverity;
    status: FindingStatus;
    title: string;
    summary: string;
    evidence?: Finding["evidence"];
    impact?: string;
    fix?: Finding["fix"];
  },
): Finding {
  findingCounter++;
  return {
    id: `finding_${findingCounter}`,
    ruleId: rule.id,
    category: rule.category,
    severity: overrides.severity,
    status: overrides.status,
    title: overrides.title,
    summary: overrides.summary,
    evidence: overrides.evidence ?? {},
    impact: overrides.impact,
    fix: overrides.fix,
  };
}

/** Reset finding counter (for tests). */
export function resetFindingCounter(): void {
  findingCounter = 0;
}

/** Get all unique GA4 measurement IDs from captured events. */
export function getUniqueTids(audit: AuditDocument): string[] {
  const tids = new Set<string>();
  for (const event of audit.capturedEvents) {
    if (event.tid) tids.add(event.tid);
  }
  return [...tids];
}

/** Check if an event name follows snake_case convention. */
export function isSnakeCase(name: string): boolean {
  return /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name);
}

/** Known non-standard event name → canonical GA4 equivalent mappings. */
export const CANONICAL_NAME_MAP: Record<string, string> = {
  addtocart: "add_to_cart",
  addToCart: "add_to_cart",
  AddToCart: "add_to_cart",
  cart_add: "add_to_cart",
  viewitem: "view_item",
  ViewItem: "view_item",
  viewItem: "view_item",
  ViewContent: "view_item",
  viewcart: "view_cart",
  ViewCart: "view_cart",
  begincheckout: "begin_checkout",
  BeginCheckout: "begin_checkout",
  InitiateCheckout: "begin_checkout",
  PageView: "page_view",
  pageview: "page_view",
  Pageview: "page_view",
};
