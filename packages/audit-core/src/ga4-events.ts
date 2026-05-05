/**
 * GA4 Ecommerce event definitions.
 * Reference: https://developers.google.com/analytics/devguides/collection/ga4/ecommerce
 *
 * Events are categorized by trigger type:
 * - "page_load": fires when a page/view renders (e.g., view_item on PDP)
 * - "interaction": fires on user action (e.g., add_to_cart on button click)
 * - "display": fires when content is shown (e.g., view_promotion for a banner)
 * - "server": fires server-side or post-purchase (e.g., refund)
 */

export type TriggerType = "page_load" | "interaction" | "display" | "server";

export type EcommerceEventDef = {
  /** Canonical GA4 event name. */
  name: string;
  /** Human-readable label. */
  label: string;
  /** What causes this event to fire. */
  triggerType: TriggerType;
  /** Description of the trigger. */
  trigger: string;
  /** Whether items array is required for this event. */
  itemsRequired: boolean;
  /** Event-level params that are required. */
  requiredParams: string[];
  /** Event-level params that are recommended. */
  recommendedParams: string[];
  /** Which funnel step(s) we expect this event at. Empty = can fire anywhere. */
  expectedFunnelSteps: string[];
  /** Can this event fire on any page (not tied to a specific page type)? */
  canFireAnywhere: boolean;
  /** Position in the standard ecommerce funnel (0 = not in linear funnel). */
  funnelOrder: number;
  /** Is this event within our audit scope? (false = post-purchase or server-only) */
  inAuditScope: boolean;
};

/** Complete list of GA4 ecommerce events with their characteristics. */
export const GA4_ECOMMERCE_EVENTS: EcommerceEventDef[] = [
  // ─── Discovery ─────────────────────────────────────────────────────
  {
    name: "view_item_list",
    label: "View Item List",
    triggerType: "page_load",
    trigger:
      "A list of products is displayed — category page, search results, homepage featured products, related products section, etc.",
    itemsRequired: true,
    requiredParams: [],
    recommendedParams: ["item_list_id", "item_list_name"],
    expectedFunnelSteps: ["home", "category"],
    canFireAnywhere: true,
    funnelOrder: 1,
    inAuditScope: true,
  },
  {
    name: "select_item",
    label: "Select Item",
    triggerType: "interaction",
    trigger:
      "User clicks/selects a product from a list (product card click on category page, homepage, search results, etc.).",
    itemsRequired: true,
    requiredParams: [],
    recommendedParams: ["item_list_id", "item_list_name"],
    expectedFunnelSteps: ["home", "category"],
    canFireAnywhere: true,
    funnelOrder: 2,
    inAuditScope: true,
  },
  {
    name: "view_item",
    label: "View Item",
    triggerType: "page_load",
    trigger:
      "User views a product detail page (PDP) or a quick-view modal displaying product details.",
    itemsRequired: true,
    requiredParams: ["currency", "value"],
    recommendedParams: [],
    expectedFunnelSteps: ["product"],
    canFireAnywhere: false,
    funnelOrder: 3,
    inAuditScope: true,
  },

  // ─── Cart management ───────────────────────────────────────────────
  {
    name: "add_to_wishlist",
    label: "Add to Wishlist",
    triggerType: "interaction",
    trigger:
      "User saves/bookmarks an item for later — wishlist button on PDP, listing page, or quick-view.",
    itemsRequired: true,
    requiredParams: ["currency", "value"],
    recommendedParams: [],
    expectedFunnelSteps: ["product"],
    canFireAnywhere: true,
    funnelOrder: 0,
    inAuditScope: true,
  },
  {
    name: "add_to_cart",
    label: "Add to Cart",
    triggerType: "interaction",
    trigger:
      "User adds an item to the cart — ATC button on PDP, quick-add on listing page, recommended products, or wishlist.",
    itemsRequired: true,
    requiredParams: ["currency", "value"],
    recommendedParams: [],
    expectedFunnelSteps: ["product", "add_to_cart"],
    canFireAnywhere: true,
    funnelOrder: 4,
    inAuditScope: true,
  },
  {
    name: "remove_from_cart",
    label: "Remove from Cart",
    triggerType: "interaction",
    trigger:
      "User removes an item from the cart — remove button in cart page, cart drawer, or mini-cart on any page.",
    itemsRequired: true,
    requiredParams: ["currency", "value"],
    recommendedParams: [],
    expectedFunnelSteps: ["cart"],
    canFireAnywhere: true,
    funnelOrder: 0,
    inAuditScope: true,
  },
  {
    name: "view_cart",
    label: "View Cart",
    triggerType: "page_load",
    trigger:
      "User views their cart — navigating to cart page, or opening a cart drawer/slide-out on any page.",
    itemsRequired: true,
    requiredParams: ["currency", "value"],
    recommendedParams: [],
    expectedFunnelSteps: ["cart"],
    canFireAnywhere: true,
    funnelOrder: 5,
    inAuditScope: true,
  },

  // ─── Checkout ──────────────────────────────────────────────────────
  {
    name: "begin_checkout",
    label: "Begin Checkout",
    triggerType: "interaction",
    trigger:
      "User initiates checkout — clicking 'Checkout', 'Proceed to checkout', or similar button from cart.",
    itemsRequired: true,
    requiredParams: ["currency", "value"],
    recommendedParams: ["coupon"],
    expectedFunnelSteps: ["checkout"],
    canFireAnywhere: false,
    funnelOrder: 6,
    inAuditScope: true,
  },
  {
    name: "add_shipping_info",
    label: "Add Shipping Info",
    triggerType: "interaction",
    trigger:
      "User submits shipping information — selecting shipping method or entering address during checkout.",
    itemsRequired: true,
    requiredParams: ["currency", "value"],
    recommendedParams: ["coupon", "shipping_tier"],
    expectedFunnelSteps: ["checkout"],
    canFireAnywhere: false,
    funnelOrder: 7,
    inAuditScope: true,
  },
  {
    name: "add_payment_info",
    label: "Add Payment Info",
    triggerType: "interaction",
    trigger:
      "User submits payment details — entering credit card, selecting payment method during checkout.",
    itemsRequired: true,
    requiredParams: ["currency", "value"],
    recommendedParams: ["coupon", "payment_type"],
    expectedFunnelSteps: ["checkout"],
    canFireAnywhere: false,
    funnelOrder: 8,
    inAuditScope: true,
  },

  // ─── Purchase (out of audit scope — we stop before payment) ────────
  {
    name: "purchase",
    label: "Purchase",
    triggerType: "page_load",
    trigger:
      "Transaction completed — order confirmation page loads after successful payment.",
    itemsRequired: true,
    requiredParams: ["currency", "value", "transaction_id"],
    recommendedParams: ["coupon", "shipping", "tax"],
    expectedFunnelSteps: [],
    canFireAnywhere: false,
    funnelOrder: 9,
    inAuditScope: false,
  },
  {
    name: "refund",
    label: "Refund",
    triggerType: "server",
    trigger:
      "Refund processed — typically server-side after return is approved. Can be full or partial.",
    itemsRequired: false,
    requiredParams: ["currency", "value", "transaction_id"],
    recommendedParams: [],
    expectedFunnelSteps: [],
    canFireAnywhere: false,
    funnelOrder: 10,
    inAuditScope: false,
  },

  // ─── Promotions (can fire on any page) ─────────────────────────────
  {
    name: "view_promotion",
    label: "View Promotion",
    triggerType: "display",
    trigger:
      "Promotional content is displayed — banner, hero image, promotional section, or ad slot visible on any page.",
    itemsRequired: false,
    requiredParams: [],
    recommendedParams: [
      "creative_name",
      "creative_slot",
      "promotion_id",
      "promotion_name",
    ],
    expectedFunnelSteps: [],
    canFireAnywhere: true,
    funnelOrder: 0,
    inAuditScope: true,
  },
  {
    name: "select_promotion",
    label: "Select Promotion",
    triggerType: "interaction",
    trigger:
      "User clicks on a promotion — clicks promotional banner, hero CTA, or ad slot on any page.",
    itemsRequired: false,
    requiredParams: [],
    recommendedParams: [
      "creative_name",
      "creative_slot",
      "promotion_id",
      "promotion_name",
    ],
    expectedFunnelSteps: [],
    canFireAnywhere: true,
    funnelOrder: 0,
    inAuditScope: true,
  },
];

/** Standard funnel events in order (the core ecommerce flow we audit). */
export const FUNNEL_EVENTS = GA4_ECOMMERCE_EVENTS.filter(
  (e) => e.funnelOrder > 0 && e.inAuditScope,
).sort((a, b) => a.funnelOrder - b.funnelOrder);

/** All ecommerce event names for quick lookup. */
export const ECOMMERCE_EVENT_NAMES = new Set(
  GA4_ECOMMERCE_EVENTS.map((e) => e.name),
);

/** Check if an event name is a recognized GA4 ecommerce event. */
export function isEcommerceEvent(name: string): boolean {
  return ECOMMERCE_EVENT_NAMES.has(name);
}

/** Get the event definition by name, or undefined if not found. */
export function getEventDef(name: string): EcommerceEventDef | undefined {
  return GA4_ECOMMERCE_EVENTS.find((e) => e.name === name);
}
