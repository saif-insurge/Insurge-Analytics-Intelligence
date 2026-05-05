import { describe, it, expect } from "vitest";
import { detectPlatform, type PlatformSignals } from "../platform-detector.js";

function makeSignals(overrides: Partial<PlatformSignals> = {}): PlatformSignals {
  return {
    jsGlobals: [],
    metaGenerator: "",
    cookieNames: [],
    bodyClasses: [],
    scriptSrcs: [],
    linkHrefs: [],
    htmlHints: [],
    ...overrides,
  };
}

describe("detectPlatform", () => {
  it("detects Shopify with high confidence from JS global + CDN", () => {
    const result = detectPlatform(makeSignals({
      jsGlobals: ["Shopify", "ShopifyAnalytics"],
      scriptSrcs: ["https://cdn.shopify.com/s/files/1/theme.js"],
    }));
    expect(result.detected).toBe("shopify");
    expect(result.confidence).toBe("high");
  });

  it("detects Shopify from meta generator alone", () => {
    const result = detectPlatform(makeSignals({
      metaGenerator: "Shopify",
    }));
    expect(result.detected).toBe("shopify");
    expect(result.confidence).toBe("medium");
  });

  it("detects WooCommerce from JS globals", () => {
    const result = detectPlatform(makeSignals({
      jsGlobals: ["wc_add_to_cart_params", "woocommerce_params"],
      bodyClasses: ["woocommerce", "woocommerce-page"],
    }));
    expect(result.detected).toBe("woocommerce");
    expect(result.confidence).toBe("high");
  });

  it("detects WooCommerce from meta generator", () => {
    const result = detectPlatform(makeSignals({
      metaGenerator: "WooCommerce 8.5.1",
      bodyClasses: ["woocommerce"],
    }));
    expect(result.detected).toBe("woocommerce");
    expect(result.confidence).toBe("high");
  });

  it("detects BigCommerce from BCData global", () => {
    const result = detectPlatform(makeSignals({
      jsGlobals: ["BCData", "stencilUtils"],
    }));
    expect(result.detected).toBe("bigcommerce");
    expect(result.confidence).toBe("high");
  });

  it("detects Magento from Mage global + static frontend", () => {
    const result = detectPlatform(makeSignals({
      jsGlobals: ["Mage"],
      scriptSrcs: ["https://example.com/static/frontend/theme/script.js"],
    }));
    expect(result.detected).toBe("magento");
    expect(result.confidence).toBe("high");
  });

  it("detects Wix from meta generator + CDN", () => {
    const result = detectPlatform(makeSignals({
      metaGenerator: "Wix.com Website Builder",
      scriptSrcs: ["https://static.parastorage.com/services/wix-thunderbolt/app.js"],
    }));
    expect(result.detected).toBe("wix");
    expect(result.confidence).toBe("high");
  });

  it("detects Squarespace from meta generator + body class", () => {
    const result = detectPlatform(makeSignals({
      metaGenerator: "Squarespace",
      bodyClasses: ["sqs-block"],
    }));
    expect(result.detected).toBe("squarespace");
    expect(result.confidence).toBe("high");
  });

  it("returns custom with low confidence when no platform matches", () => {
    const result = detectPlatform(makeSignals({
      jsGlobals: ["React", "Next"],
      scriptSrcs: ["https://example.com/app.js"],
    }));
    expect(result.detected).toBe("custom");
    expect(result.confidence).toBe("low");
  });

  it("returns custom for a headless commerce site (no platform signals)", () => {
    const result = detectPlatform(makeSignals());
    expect(result.detected).toBe("custom");
  });

  it("includes Shopify theme and version when available", () => {
    const result = detectPlatform(makeSignals({
      jsGlobals: ["Shopify"],
      scriptSrcs: ["https://cdn.shopify.com/s/theme.js"],
      shopifyTheme: "Dawn",
      shopifyVersion: "2024.01",
    }));
    expect(result.detected).toBe("shopify");
    expect(result.theme).toBe("Dawn");
    expect(result.version).toBe("2024.01");
  });
});
