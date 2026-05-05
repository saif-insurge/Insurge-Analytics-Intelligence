/**
 * Page classifier — determines page type from URL, meta tags, and DOM signals.
 * Returns a classification with confidence. If confidence is "low", the caller
 * should fall back to AI classification.
 */

export type PageType =
  | "home"
  | "category"
  | "product"
  | "cart"
  | "checkout"
  | "search"
  | "account"
  | "other";

export type PageClassification = {
  type: PageType;
  confidence: "high" | "medium" | "low";
  signals: string[];
};

/** Signals extracted from the page for classification. */
export type PageSignals = {
  url: string;
  title: string;
  /** JSON-LD structured data types found (e.g., "Product", "BreadcrumbList"). */
  jsonLdTypes: string[];
  /** Open Graph type (e.g., "og:type" = "product"). */
  ogType: string;
  /** Whether an add-to-cart button/form is present. */
  hasAddToCartButton: boolean;
  /** Whether a product price element is visible. */
  hasProductPrice: boolean;
  /** Whether a quantity selector is present. */
  hasQuantitySelector: boolean;
  /** Whether a cart/checkout form is present. */
  hasCheckoutForm: boolean;
  /** Whether a cart items list is present. */
  hasCartItems: boolean;
  /** Number of product cards visible (for category/listing pages). */
  productCardCount: number;
  /** Meta description content. */
  metaDescription: string;
  /** Canonical URL if different from current URL. */
  canonicalUrl: string;
};

/** URL path patterns for each page type. */
const URL_PATTERNS: Record<PageType, RegExp[]> = {
  home: [/^\/$/, /^\/index/, /^\/home/],
  category: [
    /\/collections?\//i,
    /\/categor(y|ies)\//i,
    /\/shop\//i,
    /\/shop-all/i,
    /\/product-category\//i,
    /\/c\//i,
    /\/department\//i,
    /\/browse\//i,
  ],
  product: [
    /\/products?\//i,
    /\/p\//i,
    /\/item\//i,
    /\/dp\//i, // Amazon-style
    /\/product-page\//i,
    /\/-p-\d+/i, // Some platforms use -p-{id}
  ],
  cart: [/\/cart/i, /\/basket/i, /\/bag/i, /\/shopping-cart/i],
  checkout: [
    /\/checkout/i,
    /\/checkouts\//i,
    /\/order/i,
    /\/payment/i,
    /\/pay\b/i,
  ],
  search: [/\/search/i, /[?&]q=/i, /[?&]query=/i, /[?&]search=/i],
  account: [
    /\/account/i,
    /\/my-account/i,
    /\/profile/i,
    /\/login/i,
    /\/signin/i,
    /\/register/i,
  ],
  other: [],
};

/** Classifies a page based on URL patterns and DOM signals. */
export function classifyPage(signals: PageSignals): PageClassification {
  const url = signals.url;
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return { type: "other", confidence: "low", signals: ["invalid_url"] };
  }

  const matched: { type: PageType; confidence: "high" | "medium" | "low"; signals: string[] }[] = [];

  // ─── Home page ───────────────────────────────────────────────────
  if (pathname === "/" || pathname === "") {
    matched.push({ type: "home", confidence: "high", signals: ["url_root_path"] });
  }

  // ─── URL pattern matching ────────────────────────────────────────
  for (const [pageType, patterns] of Object.entries(URL_PATTERNS) as [PageType, RegExp[]][]) {
    if (pageType === "other" || pageType === "home") continue;
    for (const pattern of patterns) {
      if (pattern.test(pathname) || pattern.test(url)) {
        matched.push({
          type: pageType,
          confidence: "medium",
          signals: [`url_pattern:${pattern.source}`],
        });
        break;
      }
    }
  }

  // ─── DOM signal boosting ─────────────────────────────────────────

  // Product page signals
  if (signals.jsonLdTypes.includes("Product")) {
    matched.push({ type: "product", confidence: "high", signals: ["jsonld_product"] });
  }
  if (signals.ogType === "product" || signals.ogType === "og:product") {
    matched.push({ type: "product", confidence: "high", signals: ["og_type_product"] });
  }
  if (signals.hasAddToCartButton && signals.hasProductPrice) {
    matched.push({ type: "product", confidence: "medium", signals: ["has_atc_and_price"] });
  }
  if (signals.hasQuantitySelector && signals.hasAddToCartButton) {
    matched.push({ type: "product", confidence: "medium", signals: ["has_qty_and_atc"] });
  }

  // Category/listing page signals
  if (signals.productCardCount >= 4) {
    matched.push({ type: "category", confidence: "medium", signals: [`product_cards:${signals.productCardCount}`] });
  }
  if (signals.jsonLdTypes.includes("CollectionPage") || signals.jsonLdTypes.includes("SearchResultsPage")) {
    matched.push({ type: "category", confidence: "high", signals: ["jsonld_collection"] });
  }

  // Cart signals
  if (signals.hasCartItems && !signals.hasCheckoutForm) {
    matched.push({ type: "cart", confidence: "medium", signals: ["has_cart_items_no_checkout_form"] });
  }

  // Checkout signals
  if (signals.hasCheckoutForm) {
    matched.push({ type: "checkout", confidence: "medium", signals: ["has_checkout_form"] });
  }

  // Search signals
  if (signals.jsonLdTypes.includes("SearchResultsPage")) {
    matched.push({ type: "search", confidence: "high", signals: ["jsonld_search_results"] });
  }

  // ─── Resolve best match ──────────────────────────────────────────
  if (matched.length === 0) {
    return { type: "other", confidence: "low", signals: ["no_signals_matched"] };
  }

  // Score each match: high=3, medium=2, low=1. Group by type and sum.
  const scores = new Map<PageType, { score: number; signals: string[]; bestConfidence: "high" | "medium" | "low" }>();
  for (const m of matched) {
    const existing = scores.get(m.type) ?? { score: 0, signals: [], bestConfidence: "low" as const };
    const points = m.confidence === "high" ? 3 : m.confidence === "medium" ? 2 : 1;
    existing.score += points;
    existing.signals.push(...m.signals);
    if (points > (existing.bestConfidence === "high" ? 3 : existing.bestConfidence === "medium" ? 2 : 1)) {
      existing.bestConfidence = m.confidence;
    }
    scores.set(m.type, existing);
  }

  // Pick the type with the highest score
  let best: { type: PageType; score: number; signals: string[]; bestConfidence: "high" | "medium" | "low" } | null = null;
  for (const [type, data] of scores.entries()) {
    if (!best || data.score > best.score) {
      best = { type, ...data };
    }
  }

  if (!best) {
    return { type: "other", confidence: "low", signals: ["no_signals_matched"] };
  }

  // Determine overall confidence
  let confidence: "high" | "medium" | "low";
  if (best.score >= 5) {
    confidence = "high";
  } else if (best.score >= 3 || best.bestConfidence === "high") {
    confidence = best.bestConfidence;
  } else {
    confidence = "medium";
  }

  return { type: best.type, confidence, signals: best.signals };
}

/**
 * Extracts page signals from raw DOM data.
 * This is a helper to build PageSignals from data you can get via page.evaluate().
 */
export function extractPageSignalsScript(): string {
  return `(() => {
    const signals = {
      url: window.location.href,
      title: document.title || '',
      jsonLdTypes: [],
      ogType: '',
      hasAddToCartButton: false,
      hasProductPrice: false,
      hasQuantitySelector: false,
      hasCheckoutForm: false,
      hasCartItems: false,
      productCardCount: 0,
      metaDescription: '',
      canonicalUrl: '',
    };

    // JSON-LD
    const ldScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const s of ldScripts) {
      try {
        const data = JSON.parse(s.textContent || '');
        const types = Array.isArray(data) ? data.map(d => d['@type']) : [data['@type']];
        signals.jsonLdTypes.push(...types.filter(Boolean));
      } catch {}
    }

    // OG type
    const ogMeta = document.querySelector('meta[property="og:type"]');
    signals.ogType = ogMeta ? ogMeta.getAttribute('content') || '' : '';

    // Meta description
    const descMeta = document.querySelector('meta[name="description"]');
    signals.metaDescription = descMeta ? descMeta.getAttribute('content') || '' : '';

    // Canonical
    const canonical = document.querySelector('link[rel="canonical"]');
    signals.canonicalUrl = canonical ? canonical.getAttribute('href') || '' : '';

    // Add to cart button
    const atcSelectors = [
      'button[name="add"], button[type="submit"][class*="cart"]',
      '[data-action="add-to-cart"], [data-add-to-cart]',
      'button:has(> span)', // General button check
    ];
    const allButtons = document.querySelectorAll('button, [role="button"], input[type="submit"]');
    for (const btn of allButtons) {
      const text = (btn.textContent || '').toLowerCase();
      if (text.match(/add.to.(cart|bag|basket)/i) || text.match(/buy.now/i)) {
        signals.hasAddToCartButton = true;
        break;
      }
    }
    if (!signals.hasAddToCartButton) {
      signals.hasAddToCartButton = !!document.querySelector('[data-action="add-to-cart"], [data-add-to-cart], form[action*="/cart/add"]');
    }

    // Product price
    signals.hasProductPrice = !!(
      document.querySelector('[class*="price"]:not([class*="prices"]):not(style)') ||
      document.querySelector('[data-price], [itemprop="price"]')
    );

    // Quantity selector
    signals.hasQuantitySelector = !!(
      document.querySelector('input[name="quantity"], input[type="number"][class*="qty"]') ||
      document.querySelector('[class*="quantity"] input')
    );

    // Checkout form
    signals.hasCheckoutForm = !!(
      document.querySelector('form[action*="checkout"], form[action*="payment"]') ||
      document.querySelector('[data-checkout], [class*="checkout-form"]')
    );

    // Cart items
    signals.hasCartItems = !!(
      document.querySelector('[class*="cart-item"], [class*="cart_item"], [class*="line-item"]') ||
      document.querySelector('[data-cart-items], table[class*="cart"]')
    );

    // Product cards count
    const cardSelectors = [
      '[class*="product-card"]', '[class*="product_card"]', '[class*="productCard"]',
      '[data-product-card]', '[class*="product-item"]', '[class*="product_item"]',
      '.product-grid > *', '.products-grid > *', '[class*="product-list"] > *',
    ];
    let maxCards = 0;
    for (const sel of cardSelectors) {
      const count = document.querySelectorAll(sel).length;
      if (count > maxCards) maxCards = count;
    }
    signals.productCardCount = maxCards;

    return signals;
  })()`;
}
