/** Implementation coverage rules — check that required ecommerce events fire at the right time. */

import type { Rule } from "./types.js";
import {
  findEventsByName,
  findPagesByType,
  findEventsOnPage,
  makeFinding,
  isSnakeCase,
  CANONICAL_NAME_MAP,
} from "./helpers.js";
import { ECOMMERCE_EVENT_NAMES } from "../ga4-events.js";

export const viewItemListMissing: Rule = {
  id: "ga4.ecommerce.view_item_list.missing",
  category: "implementation_coverage",
  description: "Checks if view_item_list fires on category/listing pages",
  evaluate: (audit) => {
    const categoryPages = findPagesByType(audit, "category");
    if (categoryPages.length === 0) return [];

    const viewItemListEvents = findEventsByName(audit, "view_item_list");
    if (viewItemListEvents.length > 0) {
      return [
        makeFinding(viewItemListMissing, {
          severity: "info",
          status: "pass",
          title: "view_item_list event fires on listing pages",
          summary: `Found ${viewItemListEvents.length} view_item_list event(s) with ${viewItemListEvents.reduce((sum, e) => sum + e.items.length, 0)} total items.`,
        }),
      ];
    }

    return [
      makeFinding(viewItemListMissing, {
        severity: "critical",
        status: "fail",
        title: "Missing view_item_list on category pages",
        summary:
          "No view_item_list event was detected on category/listing pages. This event is critical for measuring product discovery and list performance in GA4.",
        evidence: {
          expected: "view_item_list event on category pages",
          observed: "No view_item_list events captured",
          pageIds: categoryPages.map((p) => p.id),
        },
        impact:
          "Cannot measure product list impressions, making it impossible to analyze which product listings drive the most engagement.",
        fix: {
          platformSpecific: {
            shopify: "Ensure your theme fires view_item_list on collection pages. Check if your GTM container has a trigger for collection page loads.",
            woocommerce: "Add view_item_list to your product archive template via dataLayer.push or the WooCommerce GA4 integration plugin.",
            custom: "Push a view_item_list event to the dataLayer when product listing content renders on the page.",
          },
          estimatedEffort: "1-2 hours",
        },
      }),
    ];
  },
};

export const viewItemMissing: Rule = {
  id: "ga4.ecommerce.view_item.missing",
  category: "implementation_coverage",
  description: "Checks if view_item fires on product detail pages",
  evaluate: (audit) => {
    const productPages = findPagesByType(audit, "product");
    if (productPages.length === 0) return [];

    const viewItemEvents = findEventsByName(audit, "view_item");
    if (viewItemEvents.length > 0) {
      return [
        makeFinding(viewItemMissing, {
          severity: "info",
          status: "pass",
          title: "view_item event fires on product pages",
          summary: `Found ${viewItemEvents.length} view_item event(s).`,
        }),
      ];
    }

    return [
      makeFinding(viewItemMissing, {
        severity: "critical",
        status: "fail",
        title: "Missing view_item on product pages",
        summary:
          "No view_item event was detected on product detail pages. This is a core ecommerce event for measuring product interest.",
        evidence: {
          expected: "view_item event on product detail pages",
          observed: "No view_item events captured",
          pageIds: productPages.map((p) => p.id),
        },
        impact:
          "Cannot measure which products users view, breaking funnel analysis between discovery and add-to-cart.",
        fix: {
          platformSpecific: {
            shopify: "Check your theme's product.liquid template or GTM trigger for product page loads. Ensure the dataLayer push includes product details.",
            woocommerce: "Verify the WooCommerce GA4 plugin is active or add a dataLayer.push on single-product templates.",
            custom: "Fire a view_item event with item details when the product detail page renders.",
          },
          estimatedEffort: "1-2 hours",
        },
      }),
    ];
  },
};

export const addToCartMissing: Rule = {
  id: "ga4.ecommerce.add_to_cart.missing",
  category: "implementation_coverage",
  description: "Checks if add_to_cart fires after adding an item",
  evaluate: (audit) => {
    const atcEvents = findEventsByName(audit, "add_to_cart");
    if (atcEvents.length > 0) {
      return [
        makeFinding(addToCartMissing, {
          severity: "info",
          status: "pass",
          title: "add_to_cart event fires correctly",
          summary: `Found ${atcEvents.length} add_to_cart event(s).`,
        }),
      ];
    }

    return [
      makeFinding(addToCartMissing, {
        severity: "critical",
        status: "fail",
        title: "Missing add_to_cart event",
        summary:
          "No add_to_cart event was detected after clicking the add-to-cart button. This is the most critical ecommerce conversion event.",
        evidence: {
          expected: "add_to_cart event after ATC button click",
          observed: "No add_to_cart events captured",
        },
        impact:
          "Cannot measure cart additions, making it impossible to calculate add-to-cart rate or identify drop-off before checkout.",
        fix: {
          platformSpecific: {
            shopify: "Ensure your GTM container fires add_to_cart on the 'Add to Cart' click trigger or Ajax cart events.",
            woocommerce: "Check the WooCommerce GA4 integration plugin or add a dataLayer.push on the add_to_cart AJAX success callback.",
            custom: "Fire an add_to_cart event with item details when the user clicks the add-to-cart button.",
          },
          estimatedEffort: "1-3 hours",
        },
      }),
    ];
  },
};

export const viewCartMissing: Rule = {
  id: "ga4.ecommerce.view_cart.missing",
  category: "implementation_coverage",
  description: "Checks if view_cart fires on cart page or drawer",
  evaluate: (audit) => {
    const cartPages = findPagesByType(audit, "cart");
    const viewCartEvents = findEventsByName(audit, "view_cart");

    if (viewCartEvents.length > 0) {
      return [
        makeFinding(viewCartMissing, {
          severity: "info",
          status: "pass",
          title: "view_cart event fires correctly",
          summary: `Found ${viewCartEvents.length} view_cart event(s).`,
        }),
      ];
    }

    if (cartPages.length === 0) return [];

    return [
      makeFinding(viewCartMissing, {
        severity: "high",
        status: "fail",
        title: "Missing view_cart event",
        summary:
          "No view_cart event was detected when viewing the cart. This event helps measure cart review behavior.",
        evidence: {
          expected: "view_cart event on cart page or drawer open",
          observed: "No view_cart events captured",
          pageIds: cartPages.map((p) => p.id),
        },
        impact:
          "Cannot measure how often users review their cart before checkout.",
        fix: {
          platformSpecific: {
            shopify: "Add a view_cart trigger in GTM that fires on cart page load or cart drawer open.",
            woocommerce: "Fire view_cart on the WooCommerce cart page template.",
            custom: "Push a view_cart event when the cart page renders or cart drawer opens.",
          },
          estimatedEffort: "1 hour",
        },
      }),
    ];
  },
};

export const beginCheckoutMissing: Rule = {
  id: "ga4.ecommerce.begin_checkout.missing",
  category: "implementation_coverage",
  description: "Checks if begin_checkout fires at checkout initiation",
  evaluate: (audit) => {
    const checkoutPages = findPagesByType(audit, "checkout");
    const beginCheckoutEvents = findEventsByName(audit, "begin_checkout");

    if (beginCheckoutEvents.length > 0) {
      return [
        makeFinding(beginCheckoutMissing, {
          severity: "info",
          status: "pass",
          title: "begin_checkout event fires correctly",
          summary: `Found ${beginCheckoutEvents.length} begin_checkout event(s).`,
        }),
      ];
    }

    if (checkoutPages.length === 0) return [];

    return [
      makeFinding(beginCheckoutMissing, {
        severity: "critical",
        status: "fail",
        title: "Missing begin_checkout event",
        summary:
          "No begin_checkout event was detected during checkout. This is essential for measuring checkout funnel drop-off.",
        evidence: {
          expected: "begin_checkout event at checkout initiation",
          observed: "No begin_checkout events captured",
          pageIds: checkoutPages.map((p) => p.id),
        },
        impact:
          "Cannot measure checkout initiation rate or identify where users abandon the checkout process.",
        fix: {
          platformSpecific: {
            shopify: "Add a begin_checkout trigger in GTM that fires on checkout page load. Shopify Plus may require additional script permissions.",
            woocommerce: "Fire begin_checkout on the WooCommerce checkout page load.",
            custom: "Push a begin_checkout event when the user navigates to the checkout page.",
          },
          estimatedEffort: "1-2 hours",
        },
      }),
    ];
  },
};

export const namingSnakeCase: Rule = {
  id: "ga4.ecommerce.naming.snake_case",
  category: "implementation_coverage",
  description: "Checks that ecommerce events use snake_case naming",
  evaluate: (audit) => {
    const nonSnakeCase: { name: string; eventIds: string[] }[] = [];

    for (const event of audit.capturedEvents) {
      if (!event.name || event.name === "page_view") continue;
      if (!isSnakeCase(event.name)) {
        const existing = nonSnakeCase.find((n) => n.name === event.name);
        if (existing) {
          existing.eventIds.push(event.id);
        } else {
          nonSnakeCase.push({ name: event.name, eventIds: [event.id] });
        }
      }
    }

    if (nonSnakeCase.length === 0) {
      return [
        makeFinding(namingSnakeCase, {
          severity: "info",
          status: "pass",
          title: "All events use snake_case naming",
          summary: "All captured event names follow the GA4 snake_case convention.",
        }),
      ];
    }

    return [
      makeFinding(namingSnakeCase, {
        severity: "medium",
        status: "fail",
        title: "Non-snake_case event names detected",
        summary: `Found ${nonSnakeCase.length} event name(s) not using snake_case: ${nonSnakeCase.map((n) => `"${n.name}"`).join(", ")}. GA4 recommends snake_case for all event names.`,
        evidence: {
          observed: nonSnakeCase.map((n) => n.name),
          eventIds: nonSnakeCase.flatMap((n) => n.eventIds),
        },
        impact: "Non-standard naming creates inconsistencies in GA4 reports and makes it harder to build audiences and conversions.",
        fix: {
          platformSpecific: {
            shopify: "Update your GTM tag configurations to use snake_case event names.",
            woocommerce: "Check your GA4 plugin settings or custom dataLayer pushes for incorrect naming.",
            custom: "Rename all event triggers to use snake_case format (e.g., addToCart → add_to_cart).",
          },
          estimatedEffort: "30 minutes - 1 hour",
        },
      }),
    ];
  },
};

export const namingCanonical: Rule = {
  id: "ga4.ecommerce.naming.canonical",
  category: "implementation_coverage",
  description: "Checks for non-standard event names where a GA4 canonical name exists",
  evaluate: (audit) => {
    const nonCanonical: { name: string; canonical: string; count: number }[] = [];

    const nameCounts = new Map<string, number>();
    for (const event of audit.capturedEvents) {
      if (!event.name) continue;
      nameCounts.set(event.name, (nameCounts.get(event.name) ?? 0) + 1);
    }

    for (const [name, count] of nameCounts.entries()) {
      const canonical = CANONICAL_NAME_MAP[name];
      if (canonical) {
        nonCanonical.push({ name, canonical, count });
      }
    }

    if (nonCanonical.length === 0) {
      return [
        makeFinding(namingCanonical, {
          severity: "info",
          status: "pass",
          title: "All events use canonical GA4 names",
          summary: "No non-standard event names detected where a canonical GA4 equivalent exists.",
        }),
      ];
    }

    return [
      makeFinding(namingCanonical, {
        severity: "medium",
        status: "fail",
        title: "Non-canonical event names detected",
        summary: `Found non-standard event names: ${nonCanonical.map((n) => `"${n.name}" (should be "${n.canonical}", fired ${n.count}x)`).join("; ")}`,
        evidence: {
          expected: nonCanonical.map((n) => n.canonical),
          observed: nonCanonical.map((n) => n.name),
        },
        impact: "Non-canonical names won't populate GA4's built-in ecommerce reports. Data will only appear in custom explorations.",
        fix: {
          platformSpecific: {
            shopify: "Update your GTM tags or theme code to use the canonical GA4 event names.",
            woocommerce: "Check plugin settings for event name configuration.",
            custom: "Rename events to their GA4 canonical equivalents in your tracking code.",
          },
          estimatedEffort: "30 minutes - 1 hour",
        },
      }),
    ];
  },
};

export const coverageRules: Rule[] = [
  viewItemListMissing,
  viewItemMissing,
  addToCartMissing,
  viewCartMissing,
  beginCheckoutMissing,
  namingSnakeCase,
  namingCanonical,
];
