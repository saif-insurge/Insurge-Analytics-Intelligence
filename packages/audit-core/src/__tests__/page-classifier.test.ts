import { describe, it, expect } from "vitest";
import { classifyPage, type PageSignals } from "../page-classifier.js";

function makeSignals(overrides: Partial<PageSignals> = {}): PageSignals {
  return {
    url: "https://example.com/",
    title: "",
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
    ...overrides,
  };
}

describe("classifyPage", () => {
  // ─── Home ──────────────────────────────────────────────────────────
  it("classifies root path as home with high confidence", () => {
    const result = classifyPage(makeSignals({ url: "https://example.com/" }));
    expect(result.type).toBe("home");
    expect(result.confidence).toBe("high");
  });

  it("classifies root without trailing slash as home", () => {
    const result = classifyPage(makeSignals({ url: "https://example.com" }));
    expect(result.type).toBe("home");
    expect(result.confidence).toBe("high");
  });

  // ─── Category ──────────────────────────────────────────────────────
  it("classifies /collections/ as category", () => {
    const result = classifyPage(makeSignals({ url: "https://example.com/collections/shoes" }));
    expect(result.type).toBe("category");
  });

  it("classifies /shop-all as category", () => {
    const result = classifyPage(makeSignals({ url: "https://example.com/shop-all/" }));
    expect(result.type).toBe("category");
  });

  it("boosts category confidence with product cards", () => {
    const result = classifyPage(makeSignals({
      url: "https://example.com/collections/shoes",
      productCardCount: 12,
      jsonLdTypes: ["CollectionPage"],
    }));
    expect(result.type).toBe("category");
    expect(result.confidence).toBe("high");
  });

  // ─── Product ───────────────────────────────────────────────────────
  it("classifies /products/ URL as product", () => {
    const result = classifyPage(makeSignals({ url: "https://example.com/products/blue-widget" }));
    expect(result.type).toBe("product");
  });

  it("classifies page with Product JSON-LD as product with high confidence", () => {
    const result = classifyPage(makeSignals({
      url: "https://example.com/some-page",
      jsonLdTypes: ["Product"],
    }));
    expect(result.type).toBe("product");
    expect(result.confidence).toBe("high");
  });

  it("classifies page with og:type=product as product", () => {
    const result = classifyPage(makeSignals({
      url: "https://example.com/item/123",
      ogType: "product",
    }));
    expect(result.type).toBe("product");
  });

  it("classifies page with ATC button + price as product", () => {
    const result = classifyPage(makeSignals({
      url: "https://example.com/some-slug",
      hasAddToCartButton: true,
      hasProductPrice: true,
    }));
    expect(result.type).toBe("product");
  });

  // ─── Cart ──────────────────────────────────────────────────────────
  it("classifies /cart as cart", () => {
    const result = classifyPage(makeSignals({ url: "https://example.com/cart" }));
    expect(result.type).toBe("cart");
  });

  it("classifies /basket as cart", () => {
    const result = classifyPage(makeSignals({ url: "https://example.com/basket" }));
    expect(result.type).toBe("cart");
  });

  // ─── Checkout ──────────────────────────────────────────────────────
  it("classifies /checkout as checkout", () => {
    const result = classifyPage(makeSignals({ url: "https://example.com/checkout" }));
    expect(result.type).toBe("checkout");
  });

  it("classifies /checkouts/ (Shopify) as checkout", () => {
    const result = classifyPage(makeSignals({ url: "https://example.com/checkouts/abc123" }));
    expect(result.type).toBe("checkout");
  });

  it("boosts checkout confidence with checkout form", () => {
    const result = classifyPage(makeSignals({
      url: "https://example.com/checkout",
      hasCheckoutForm: true,
    }));
    expect(result.type).toBe("checkout");
    // URL pattern (medium) + form (medium) = combined medium
    expect(["medium", "high"]).toContain(result.confidence);
  });

  // ─── Search ────────────────────────────────────────────────────────
  it("classifies /search as search", () => {
    const result = classifyPage(makeSignals({ url: "https://example.com/search?q=shoes" }));
    expect(result.type).toBe("search");
  });

  // ─── Other ─────────────────────────────────────────────────────────
  it("returns other with low confidence for unrecognized pages", () => {
    const result = classifyPage(makeSignals({ url: "https://example.com/about-us" }));
    expect(result.type).toBe("other");
    expect(result.confidence).toBe("low");
  });

  // ─── Conflicting signals ──────────────────────────────────────────
  it("prefers product when URL says product and has JSON-LD Product", () => {
    const result = classifyPage(makeSignals({
      url: "https://example.com/products/widget",
      jsonLdTypes: ["Product"],
      hasAddToCartButton: true,
      hasProductPrice: true,
    }));
    expect(result.type).toBe("product");
    expect(result.confidence).toBe("high");
  });

  it("prefers category over product when many product cards present", () => {
    const result = classifyPage(makeSignals({
      url: "https://example.com/collections/all",
      productCardCount: 20,
    }));
    expect(result.type).toBe("category");
  });
});
