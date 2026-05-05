import { describe, it, expect } from "vitest";
import { assembleAuditDocument, type RawAuditCapture } from "../assembler.js";

function makeCapture(overrides: Partial<RawAuditCapture> = {}): RawAuditCapture {
  return {
    auditId: "test-audit-1",
    url: "https://test-shop.com",
    domain: "test-shop.com",
    operator: "test@example.com",
    pages: [
      {
        id: "p1",
        url: "https://test-shop.com/",
        visitedAt: "2024-01-01T00:00:00Z",
        funnelStep: "home",
        pageSignals: {
          url: "https://test-shop.com/",
          title: "Test Shop",
          jsonLdTypes: [],
          ogType: "",
          hasAddToCartButton: false,
          hasProductPrice: false,
          hasQuantitySelector: false,
          hasCheckoutForm: false,
          hasCartItems: false,
          productCardCount: 0,
          metaDescription: "",
          canonicalUrl: "",
        },
        dataLayerEntries: [],
        domContentLoaded: 500,
        load: 1000,
        interactiveElements: [],
      },
      {
        id: "p2",
        url: "https://test-shop.com/collections/all",
        visitedAt: "2024-01-01T00:01:00Z",
        funnelStep: "category",
        pageSignals: {
          url: "https://test-shop.com/collections/all",
          title: "All Products",
          jsonLdTypes: [],
          ogType: "",
          hasAddToCartButton: false,
          hasProductPrice: false,
          hasQuantitySelector: false,
          hasCheckoutForm: false,
          hasCartItems: false,
          productCardCount: 12,
          metaDescription: "",
          canonicalUrl: "",
        },
        dataLayerEntries: [],
        domContentLoaded: 600,
        load: 1200,
        interactiveElements: [],
      },
      {
        id: "p3",
        url: "https://test-shop.com/products/widget",
        visitedAt: "2024-01-01T00:02:00Z",
        funnelStep: "product",
        pageSignals: {
          url: "https://test-shop.com/products/widget",
          title: "Widget - Test Shop",
          jsonLdTypes: ["Product"],
          ogType: "product",
          hasAddToCartButton: true,
          hasProductPrice: true,
          hasQuantitySelector: true,
          hasCheckoutForm: false,
          hasCartItems: false,
          productCardCount: 0,
          metaDescription: "",
          canonicalUrl: "",
        },
        dataLayerEntries: [],
        domContentLoaded: 400,
        load: 900,
        interactiveElements: [],
        productContext: { id: "W-001", title: "Widget", price: 29.99, currency: "USD", variants: 2 },
      },
    ],
    events: [
      {
        transport: "ga4-collect", endpoint: "", tid: "G-TEST001", name: "page_view",
        params: { cid: "123.456" }, items: [], raw: "",
        capturedAt: "2024-01-01T00:00:01Z", funnelStep: "home",
      },
      {
        transport: "ga4-collect", endpoint: "", tid: "G-TEST001", name: "view_item_list",
        params: { currency: "USD" }, items: [{ item_id: "W-001", item_name: "Widget", price: 29.99 }], raw: "",
        capturedAt: "2024-01-01T00:01:01Z", funnelStep: "category",
      },
      {
        transport: "ga4-collect", endpoint: "", tid: "G-TEST001", name: "view_item",
        params: { currency: "USD", value: 29.99 }, items: [{ item_id: "W-001", item_name: "Widget", price: 29.99 }], raw: "",
        capturedAt: "2024-01-01T00:02:01Z", funnelStep: "product",
      },
      {
        transport: "ga4-collect", endpoint: "", tid: "G-TEST001", name: "add_to_cart",
        params: { currency: "USD", value: 29.99 }, items: [{ item_id: "W-001", item_name: "Widget", price: 29.99, quantity: 1 }], raw: "",
        capturedAt: "2024-01-01T00:02:02Z", funnelStep: "product",
      },
    ],
    platformSignals: {
      jsGlobals: ["Shopify", "ShopifyAnalytics"],
      metaGenerator: "Shopify",
      cookieNames: ["_shopify_y"],
      bodyClasses: [],
      scriptSrcs: ["https://cdn.shopify.com/s/files/1/theme.js"],
      linkHrefs: [],
      htmlHints: ["shopify"],
    },
    stack: {
      tagManager: "gtm",
      containerIds: ["GTM-TEST01"],
      ga4Properties: ["G-TEST001"],
      duplicateTrackers: [],
      otherPixels: [],
    },
    ...overrides,
  };
}

describe("assembleAuditDocument", () => {
  it("produces a valid AuditDocument", () => {
    const doc = assembleAuditDocument(makeCapture());
    expect(doc.audit.id).toBe("test-audit-1");
    expect(doc.audit.version).toBe("1.0.0");
    expect(doc.audit.site.domain).toBe("test-shop.com");
  });

  it("classifies pages correctly", () => {
    const doc = assembleAuditDocument(makeCapture());
    expect(doc.pages[0]!.classification.type).toBe("home");
    expect(doc.pages[1]!.classification.type).toBe("category");
    expect(doc.pages[2]!.classification.type).toBe("product");
    expect(doc.pages[2]!.classification.confidence).toBe("high");
  });

  it("detects Shopify platform", () => {
    const doc = assembleAuditDocument(makeCapture());
    expect(doc.audit.site.platform.detected).toBe("shopify");
    expect(doc.audit.site.platform.confidence).toBe("high");
  });

  it("maps events to CapturedEvent format", () => {
    const doc = assembleAuditDocument(makeCapture());
    expect(doc.capturedEvents).toHaveLength(4);
    expect(doc.capturedEvents[0]!.name).toBe("page_view");
    expect(doc.capturedEvents[1]!.name).toBe("view_item_list");
    expect(doc.capturedEvents[2]!.name).toBe("view_item");
    expect(doc.capturedEvents[3]!.name).toBe("add_to_cart");
  });

  it("runs rule engine and produces findings", () => {
    const doc = assembleAuditDocument(makeCapture());
    expect(doc.findings.length).toBeGreaterThan(0);
    // Should have passing findings for the events we included
    const viewItemPass = doc.findings.find((f) => f.ruleId === "ga4.ecommerce.view_item.missing");
    expect(viewItemPass?.status).toBe("pass");
  });

  it("computes scorecard", () => {
    const doc = assembleAuditDocument(makeCapture());
    expect(doc.scorecard.overall.maxScore).toBe(100);
    expect(doc.scorecard.overall.score).toBeGreaterThan(0);
    expect(doc.scorecard.categories).toHaveLength(4);
  });

  it("builds recommendations from findings", () => {
    const doc = assembleAuditDocument(makeCapture());
    // Should have some recommendations since not all events are present (no view_cart, begin_checkout)
    const totalRecs = doc.recommendations.immediate.length +
      doc.recommendations.shortTerm.length +
      doc.recommendations.strategic.length;
    expect(totalRecs).toBeGreaterThan(0);
  });

  it("preserves product context on product pages", () => {
    const doc = assembleAuditDocument(makeCapture());
    const productPage = doc.pages.find((p) => p.classification.type === "product");
    expect(productPage?.productContext?.id).toBe("W-001");
    expect(productPage?.productContext?.price).toBe(29.99);
  });

  it("preserves stack info", () => {
    const doc = assembleAuditDocument(makeCapture());
    expect(doc.audit.site.stack.tagManager).toBe("gtm");
    expect(doc.audit.site.stack.containerIds).toEqual(["GTM-TEST01"]);
  });
});
