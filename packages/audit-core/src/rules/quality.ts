/** Data quality rules — check that ecommerce events have required parameters and items. */

import type { Rule } from "./types.js";
import { findEventsByName, makeFinding, hasParam, getItemField } from "./helpers.js";
import { GA4_ECOMMERCE_EVENTS } from "../ga4-events.js";

/** Events that require currency and value params. */
const EVENTS_REQUIRING_CURRENCY = GA4_ECOMMERCE_EVENTS
  .filter((e) => e.requiredParams.includes("currency"))
  .map((e) => e.name);

const EVENTS_REQUIRING_VALUE = GA4_ECOMMERCE_EVENTS
  .filter((e) => e.requiredParams.includes("value"))
  .map((e) => e.name);

export const currencyMissing: Rule = {
  id: "ga4.params.currency.missing",
  category: "data_quality",
  description: "Checks that ecommerce events include the currency parameter",
  evaluate: (audit) => {
    const violating: { name: string; ids: string[] }[] = [];

    for (const eventName of EVENTS_REQUIRING_CURRENCY) {
      const events = findEventsByName(audit, eventName);
      const missing = events.filter((e) => !hasParam(e, "currency") && !hasParam(e, "cu"));
      if (missing.length > 0) {
        violating.push({ name: eventName, ids: missing.map((e) => e.id) });
      }
    }

    if (violating.length === 0) {
      const totalChecked = EVENTS_REQUIRING_CURRENCY.reduce(
        (sum, name) => sum + findEventsByName(audit, name).length, 0,
      );
      if (totalChecked === 0) return [];
      return [makeFinding(currencyMissing, {
        severity: "info", status: "pass",
        title: "Currency parameter present on all ecommerce events",
        summary: "All ecommerce events that require currency include it.",
      })];
    }

    return [makeFinding(currencyMissing, {
      severity: "high", status: "fail",
      title: "Missing currency parameter on ecommerce events",
      summary: `Events missing currency: ${violating.map((v) => `${v.name} (${v.ids.length}x)`).join(", ")}. GA4 requires currency in ISO 4217 format for revenue reporting.`,
      evidence: { observed: violating, eventIds: violating.flatMap((v) => v.ids) },
      impact: "Revenue data will not be attributed correctly in GA4 reports. Monetary values will be ignored without a currency.",
      fix: {
        platformSpecific: {
          shopify: "Add the currency parameter to your dataLayer push. Use Shopify.currency.active for the current store currency.",
          woocommerce: "Ensure the WooCommerce GA4 plugin passes currency. Check the woocommerce_currency option.",
          custom: "Include currency (ISO 4217, e.g. 'USD') in every ecommerce event that includes a value.",
        },
        estimatedEffort: "30 minutes",
      },
    })];
  },
};

export const valueMissing: Rule = {
  id: "ga4.params.value.missing",
  category: "data_quality",
  description: "Checks that ecommerce events include the value parameter",
  evaluate: (audit) => {
    const violating: { name: string; ids: string[] }[] = [];

    for (const eventName of EVENTS_REQUIRING_VALUE) {
      const events = findEventsByName(audit, eventName);
      const missing = events.filter((e) => {
        const val = e.params["value"];
        return val === undefined || val === null || val === "";
      });
      if (missing.length > 0) {
        violating.push({ name: eventName, ids: missing.map((e) => e.id) });
      }
    }

    if (violating.length === 0) {
      const totalChecked = EVENTS_REQUIRING_VALUE.reduce(
        (sum, name) => sum + findEventsByName(audit, name).length, 0,
      );
      if (totalChecked === 0) return [];
      return [makeFinding(valueMissing, {
        severity: "info", status: "pass",
        title: "Value parameter present on all ecommerce events",
        summary: "All ecommerce events that require value include it.",
      })];
    }

    return [makeFinding(valueMissing, {
      severity: "high", status: "fail",
      title: "Missing value parameter on ecommerce events",
      summary: `Events missing value: ${violating.map((v) => `${v.name} (${v.ids.length}x)`).join(", ")}. value is required for revenue reporting.`,
      evidence: { observed: violating, eventIds: violating.flatMap((v) => v.ids) },
      impact: "Revenue metrics will be zero or inaccurate in GA4. Key ecommerce reports depend on the value parameter.",
      fix: {
        platformSpecific: {
          shopify: "Calculate value as sum of (price * quantity) for all items and include in the dataLayer push.",
          woocommerce: "Ensure the GA4 plugin calculates cart/item total correctly.",
          custom: "Set value to the sum of (price * quantity) for all items in the event.",
        },
        estimatedEffort: "30 minutes - 1 hour",
      },
    })];
  },
};

export const itemIdMissing: Rule = {
  id: "ga4.items.item_id.missing",
  category: "data_quality",
  description: "Checks that all items have item_id",
  evaluate: (audit) => {
    const violations: { eventName: string; eventId: string }[] = [];

    for (const event of audit.capturedEvents) {
      if (event.items.length === 0) continue;
      for (const item of event.items) {
        if (!getItemField(item, "item_id") && !getItemField(item, "id")) {
          violations.push({ eventName: event.name, eventId: event.id });
          break;
        }
      }
    }

    if (violations.length === 0) {
      const eventsWithItems = audit.capturedEvents.filter((e) => e.items.length > 0);
      if (eventsWithItems.length === 0) return [];
      return [makeFinding(itemIdMissing, {
        severity: "info", status: "pass",
        title: "All items have item_id",
        summary: "Every item in captured events includes an item_id.",
      })];
    }

    return [makeFinding(itemIdMissing, {
      severity: "high", status: "fail",
      title: "Items missing item_id",
      summary: `${violations.length} event(s) have items without item_id: ${[...new Set(violations.map((v) => v.eventName))].join(", ")}. item_id is required for item-scoped reporting.`,
      evidence: { observed: violations, eventIds: violations.map((v) => v.eventId) },
      impact: "Item-level reports (product performance, shopping behavior) will be incomplete without item_id.",
      fix: {
        platformSpecific: {
          shopify: "Map item_id to the Shopify product variant ID or SKU in your dataLayer.",
          woocommerce: "Use the WooCommerce product ID or SKU as item_id.",
          custom: "Include a unique item_id (product SKU or ID) for every item in the items array.",
        },
        estimatedEffort: "30 minutes - 1 hour",
      },
    })];
  },
};

export const itemNameMissing: Rule = {
  id: "ga4.items.item_name.missing",
  category: "data_quality",
  description: "Checks that all items have item_name",
  evaluate: (audit) => {
    const violations: { eventName: string; eventId: string }[] = [];

    for (const event of audit.capturedEvents) {
      if (event.items.length === 0) continue;
      for (const item of event.items) {
        if (!getItemField(item, "item_name") && !getItemField(item, "nm")) {
          violations.push({ eventName: event.name, eventId: event.id });
          break;
        }
      }
    }

    if (violations.length === 0) {
      const eventsWithItems = audit.capturedEvents.filter((e) => e.items.length > 0);
      if (eventsWithItems.length === 0) return [];
      return [makeFinding(itemNameMissing, {
        severity: "info", status: "pass",
        title: "All items have item_name",
        summary: "Every item in captured events includes an item_name.",
      })];
    }

    return [makeFinding(itemNameMissing, {
      severity: "medium", status: "fail",
      title: "Items missing item_name",
      summary: `${violations.length} event(s) have items without item_name.`,
      evidence: { eventIds: violations.map((v) => v.eventId) },
      impact: "Items will appear as unnamed in GA4 reports, making product analysis difficult.",
      fix: {
        platformSpecific: {
          shopify: "Map item_name to the product title in your dataLayer push.",
          woocommerce: "Use the WooCommerce product name as item_name.",
          custom: "Include item_name for every item in the items array.",
        },
        estimatedEffort: "30 minutes",
      },
    })];
  },
};

export const itemIdInconsistent: Rule = {
  id: "ga4.items.item_id.inconsistent",
  category: "data_quality",
  description: "Checks that the same product has consistent item_id across events",
  evaluate: (audit) => {
    // Group items by page URL to find the same product across view_item and add_to_cart
    const productIds = new Map<string, Set<string>>();

    for (const event of audit.capturedEvents) {
      if (!["view_item", "add_to_cart", "select_item"].includes(event.name)) continue;
      for (const item of event.items) {
        const name = String(getItemField(item, "item_name") ?? "");
        const id = String(getItemField(item, "item_id") ?? "");
        if (!name || !id) continue;

        const existing = productIds.get(name) ?? new Set();
        existing.add(id);
        productIds.set(name, existing);
      }
    }

    const inconsistent = [...productIds.entries()].filter(([, ids]) => ids.size > 1);

    if (inconsistent.length === 0) return [];

    return [makeFinding(itemIdInconsistent, {
      severity: "medium", status: "fail",
      title: "Inconsistent item_id across events",
      summary: `${inconsistent.length} product(s) have different item_id values across events: ${inconsistent.map(([name, ids]) => `"${name}" has IDs: ${[...ids].join(", ")}`).join("; ")}`,
      evidence: { observed: inconsistent.map(([name, ids]) => ({ name, ids: [...ids] })) },
      impact: "GA4 will treat the same product as different items, fragmenting product performance data.",
      fix: {
        platformSpecific: {
          shopify: "Ensure view_item and add_to_cart use the same ID source (variant ID or product ID, not both).",
          woocommerce: "Use a consistent product identifier across all ecommerce events.",
          custom: "Standardize item_id to the same value (e.g., SKU) across all ecommerce events for each product.",
        },
        estimatedEffort: "1-2 hours",
      },
    })];
  },
};

export const priceZero: Rule = {
  id: "ga4.items.price_zero",
  category: "data_quality",
  description: "Flags items with price of 0 (could be a bug or a free product)",
  evaluate: (audit) => {
    const zeroPrice: { eventName: string; itemName: string }[] = [];

    for (const event of audit.capturedEvents) {
      for (const item of event.items) {
        const price = getItemField(item, "price");
        if (price === 0 || price === "0") {
          zeroPrice.push({
            eventName: event.name,
            itemName: String(getItemField(item, "item_name") ?? "unknown"),
          });
        }
      }
    }

    if (zeroPrice.length === 0) return [];

    return [makeFinding(priceZero, {
      severity: "low", status: "evaluate",
      title: "Items with zero price detected",
      summary: `${zeroPrice.length} item(s) have price: 0. This could be a tracking bug or a legitimately free product. Verify: ${zeroPrice.slice(0, 3).map((z) => `"${z.itemName}" in ${z.eventName}`).join(", ")}`,
      evidence: { observed: zeroPrice },
      impact: "If unintentional, revenue calculations will undercount. Verify these are genuinely free items.",
    })];
  },
};

export const qualityRules: Rule[] = [
  currencyMissing,
  valueMissing,
  itemIdMissing,
  itemNameMissing,
  itemIdInconsistent,
  priceZero,
];
