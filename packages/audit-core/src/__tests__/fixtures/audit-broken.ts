/** Fixture: poorly implemented ecommerce site. Most rules should fail. */
import type { AuditDocument } from "../../types.js";

export const brokenAudit: AuditDocument = {
  audit: {
    id: "audit-broken",
    version: "1.0.0",
    createdAt: "2024-01-01T00:00:00Z",
    completedAt: "2024-01-01T00:05:00Z",
    operator: "test",
    site: {
      url: "https://broken-shop.example.com",
      domain: "broken-shop.example.com",
      platform: { detected: "custom", confidence: "low", signals: [] },
      stack: {
        tagManager: "gtag",
        containerIds: [],
        ga4Properties: ["G-BROKEN1", "G-BROKEN2"],
        duplicateTrackers: ["UA-12345-1"],
        otherPixels: [],
      },
    },
  },
  pages: [
    {
      id: "p1", url: "https://broken-shop.example.com/", visitedAt: "2024-01-01T00:00:00Z",
      classification: { type: "home", confidence: "high", signals: [] },
      performance: { domContentLoaded: 2000, load: 4000 },
      dataLayer: { snapshotAt: "after-load", entries: [] },
      capturedEventIds: ["e1"], scan: {
        interactiveElements: [
          { id: "el1", selector: "input.search", text: "Search products", role: "input", hasListener: false, tracked: false, context: "search" },
          { id: "el2", selector: "button.wishlist", text: "Add to Wishlist", role: "button", hasListener: true, tracked: false, context: "product" },
          { id: "el3", selector: "form.newsletter", text: "Subscribe to newsletter", role: "form", hasListener: true, tracked: false, context: "footer" },
        ],
        missingCanonicalElements: [],
      },
    },
    {
      id: "p2", url: "https://broken-shop.example.com/category/shoes", visitedAt: "2024-01-01T00:01:00Z",
      classification: { type: "category", confidence: "high", signals: [] },
      performance: { domContentLoaded: 1500, load: 3000 },
      dataLayer: { snapshotAt: "after-load", entries: [] },
      capturedEventIds: [], scan: { interactiveElements: [], missingCanonicalElements: [] },
    },
    {
      id: "p3", url: "https://broken-shop.example.com/product/widget", visitedAt: "2024-01-01T00:02:00Z",
      classification: { type: "product", confidence: "high", signals: [] },
      performance: { domContentLoaded: 1000, load: 2500 },
      dataLayer: { snapshotAt: "after-load", entries: [] },
      capturedEventIds: ["e2", "e3"], scan: { interactiveElements: [], missingCanonicalElements: [] },
    },
    {
      id: "p4", url: "https://broken-shop.example.com/cart", visitedAt: "2024-01-01T00:03:00Z",
      classification: { type: "cart", confidence: "high", signals: [] },
      performance: { domContentLoaded: 800, load: 2000 },
      dataLayer: { snapshotAt: "after-load", entries: [] },
      capturedEventIds: [], scan: { interactiveElements: [], missingCanonicalElements: [] },
    },
    {
      id: "p5", url: "https://broken-shop.example.com/checkout", visitedAt: "2024-01-01T00:04:00Z",
      classification: { type: "checkout", confidence: "high", signals: [] },
      performance: { domContentLoaded: 1200, load: 3000 },
      dataLayer: { snapshotAt: "after-load", entries: [] },
      capturedEventIds: [], scan: { interactiveElements: [], missingCanonicalElements: [] },
    },
  ],
  capturedEvents: [
    // page_view fires but with wrong naming
    { id: "e1", pageId: "p1", timestamp: "2024-01-01T00:00:01Z", transport: "ga4-collect", endpoint: "", tid: "G-BROKEN1", name: "PageView", params: {}, items: [], raw: "" },
    // Same event on second property
    { id: "e1b", pageId: "p1", timestamp: "2024-01-01T00:00:01Z", transport: "ga4-collect", endpoint: "", tid: "G-BROKEN2", name: "PageView", params: {}, items: [], raw: "" },
    // UA event
    { id: "e1c", pageId: "p1", timestamp: "2024-01-01T00:00:01Z", transport: "ga4-collect", endpoint: "", tid: "UA-12345-1", name: "pageview", params: {}, items: [], raw: "" },
    // view_item but without currency, value, and items have no item_name
    { id: "e2", pageId: "p3", timestamp: "2024-01-01T00:02:01Z", transport: "ga4-collect", endpoint: "", tid: "G-BROKEN1", name: "view_item", params: {}, items: [{ item_id: "W-001", price: 0 }], raw: "" },
    // AddToCart — wrong naming, no currency, inconsistent ID
    { id: "e3", pageId: "p3", timestamp: "2024-01-01T00:02:02Z", transport: "ga4-collect", endpoint: "", tid: "G-BROKEN1", name: "AddToCart", params: {}, items: [{ item_id: "WIDGET-001", item_name: "Widget", price: 29.99 }], raw: "" },
  ],
  findings: [],
  scorecard: { overall: { grade: "pass", score: 0, maxScore: 100 }, categories: [] },
  recommendations: { immediate: [], shortTerm: [], strategic: [] },
  artifacts: {},
  operatorNotes: "",
};
