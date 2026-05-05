/** Fixture: well-implemented ecommerce site. Most rules should pass. */
import type { AuditDocument } from "../../types.js";

export const goodAudit: AuditDocument = {
  audit: {
    id: "audit-good",
    version: "1.0.0",
    createdAt: "2024-01-01T00:00:00Z",
    completedAt: "2024-01-01T00:05:00Z",
    operator: "test",
    site: {
      url: "https://good-shop.example.com",
      domain: "good-shop.example.com",
      platform: { detected: "shopify", confidence: "high", signals: ["js_global:Shopify"] },
      stack: {
        tagManager: "gtm",
        containerIds: ["GTM-GOOD1"],
        ga4Properties: ["G-GOOD001"],
        duplicateTrackers: [],
        otherPixels: [],
      },
    },
  },
  pages: [
    {
      id: "p1", url: "https://good-shop.example.com/", visitedAt: "2024-01-01T00:00:00Z",
      classification: { type: "home", confidence: "high", signals: [] },
      performance: { domContentLoaded: 500, load: 1000 },
      dataLayer: { snapshotAt: "after-load", entries: [{ event: "consent", default: { analytics_storage: "granted" } }], consentState: { analytics_storage: "granted" } },
      capturedEventIds: ["e1"], scan: { interactiveElements: [], missingCanonicalElements: [] },
    },
    {
      id: "p2", url: "https://good-shop.example.com/collections/shoes", visitedAt: "2024-01-01T00:01:00Z",
      classification: { type: "category", confidence: "high", signals: [] },
      performance: { domContentLoaded: 600, load: 1200 },
      dataLayer: { snapshotAt: "after-load", entries: [] },
      capturedEventIds: ["e2", "e3"], scan: { interactiveElements: [], missingCanonicalElements: [] },
    },
    {
      id: "p3", url: "https://good-shop.example.com/products/running-shoe", visitedAt: "2024-01-01T00:02:00Z",
      classification: { type: "product", confidence: "high", signals: [] },
      performance: { domContentLoaded: 400, load: 900 },
      dataLayer: { snapshotAt: "after-load", entries: [] },
      capturedEventIds: ["e4"], scan: { interactiveElements: [], missingCanonicalElements: [] },
      productContext: { id: "SKU-001", title: "Running Shoe", price: 89.99, currency: "USD", variants: 3 },
    },
    {
      id: "p4", url: "https://good-shop.example.com/cart", visitedAt: "2024-01-01T00:03:00Z",
      classification: { type: "cart", confidence: "high", signals: [] },
      performance: { domContentLoaded: 300, load: 800 },
      dataLayer: { snapshotAt: "after-load", entries: [] },
      capturedEventIds: ["e6", "e7"], scan: { interactiveElements: [], missingCanonicalElements: [] },
    },
    {
      id: "p5", url: "https://good-shop.example.com/checkout", visitedAt: "2024-01-01T00:04:00Z",
      classification: { type: "checkout", confidence: "high", signals: [] },
      performance: { domContentLoaded: 500, load: 1100 },
      dataLayer: { snapshotAt: "after-load", entries: [] },
      capturedEventIds: ["e8"], scan: { interactiveElements: [], missingCanonicalElements: [] },
    },
  ],
  capturedEvents: [
    { id: "e1", pageId: "p1", timestamp: "2024-01-01T00:00:01Z", transport: "ga4-collect", endpoint: "", tid: "G-GOOD001", name: "page_view", params: {}, items: [], raw: "" },
    { id: "e2", pageId: "p2", timestamp: "2024-01-01T00:01:01Z", transport: "ga4-collect", endpoint: "", tid: "G-GOOD001", name: "view_item_list", params: { currency: "USD" }, items: [{ item_id: "SKU-001", item_name: "Running Shoe", price: 89.99 }, { item_id: "SKU-002", item_name: "Trail Shoe", price: 109.99 }], raw: "" },
    { id: "e3", pageId: "p2", timestamp: "2024-01-01T00:01:02Z", transport: "ga4-collect", endpoint: "", tid: "G-GOOD001", name: "select_item", params: {}, items: [{ item_id: "SKU-001", item_name: "Running Shoe", price: 89.99 }], raw: "" },
    { id: "e4", pageId: "p3", timestamp: "2024-01-01T00:02:01Z", transport: "ga4-collect", endpoint: "", tid: "G-GOOD001", name: "view_item", params: { currency: "USD", value: 89.99 }, items: [{ item_id: "SKU-001", item_name: "Running Shoe", price: 89.99 }], raw: "" },
    { id: "e5", pageId: "p3", timestamp: "2024-01-01T00:02:02Z", transport: "ga4-collect", endpoint: "", tid: "G-GOOD001", name: "add_to_cart", params: { currency: "USD", value: 89.99 }, items: [{ item_id: "SKU-001", item_name: "Running Shoe", price: 89.99, quantity: 1 }], raw: "" },
    { id: "e6", pageId: "p4", timestamp: "2024-01-01T00:03:01Z", transport: "ga4-collect", endpoint: "", tid: "G-GOOD001", name: "view_cart", params: { currency: "USD", value: 89.99 }, items: [{ item_id: "SKU-001", item_name: "Running Shoe", price: 89.99, quantity: 1 }], raw: "" },
    { id: "e7", pageId: "p4", timestamp: "2024-01-01T00:03:02Z", transport: "ga4-collect", endpoint: "", tid: "G-GOOD001", name: "remove_from_cart", params: { currency: "USD", value: 89.99 }, items: [{ item_id: "SKU-001", item_name: "Running Shoe", price: 89.99 }], raw: "" },
    { id: "e8", pageId: "p5", timestamp: "2024-01-01T00:04:01Z", transport: "ga4-collect", endpoint: "", tid: "G-GOOD001", name: "begin_checkout", params: { currency: "USD", value: 89.99 }, items: [{ item_id: "SKU-001", item_name: "Running Shoe", price: 89.99, quantity: 1 }], raw: "" },
  ],
  findings: [],
  scorecard: { overall: { grade: "pass", score: 0, maxScore: 100 }, categories: [] },
  recommendations: { immediate: [], shortTerm: [], strategic: [] },
  artifacts: {},
  operatorNotes: "",
};
