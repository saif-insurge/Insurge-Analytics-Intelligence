/**
 * Platform detector — identifies the ecommerce platform from page signals.
 * Pure function, no AI needed. Checks JS globals, meta tags, CSS classes,
 * cookies, and URL patterns.
 */

import type { SiteInfo } from "./types.js";

type PlatformType = SiteInfo["platform"]["detected"];

export type PlatformResult = {
  detected: PlatformType;
  confidence: "high" | "medium" | "low";
  signals: string[];
  version?: string;
  theme?: string;
};

/** Signals extracted from the page for platform detection. */
export type PlatformSignals = {
  /** Global JS variables found (e.g., "Shopify", "wc_add_to_cart_params"). */
  jsGlobals: string[];
  /** Meta tag generator content (e.g., "Shopify", "WooCommerce"). */
  metaGenerator: string;
  /** Cookie names present. */
  cookieNames: string[];
  /** CSS class names found on body or key elements. */
  bodyClasses: string[];
  /** Script src URLs loaded on the page. */
  scriptSrcs: string[];
  /** Link href patterns (stylesheets, preloads). */
  linkHrefs: string[];
  /** HTML comments or data attributes with platform hints. */
  htmlHints: string[];
  /** Detected Shopify theme name if applicable. */
  shopifyTheme?: string;
  /** Detected Shopify version if applicable. */
  shopifyVersion?: string;
};

type PlatformMatcher = {
  platform: PlatformType;
  match: (signals: PlatformSignals) => { matched: boolean; confidence: "high" | "medium" | "low"; signals: string[]; version?: string; theme?: string };
};

const MATCHERS: PlatformMatcher[] = [
  // ─── Shopify ─────────────────────────────────────────────────────
  {
    platform: "shopify",
    match: (s) => {
      const signals: string[] = [];
      let score = 0;

      if (s.jsGlobals.includes("Shopify")) { signals.push("js_global:Shopify"); score += 3; }
      if (s.jsGlobals.includes("ShopifyAnalytics")) { signals.push("js_global:ShopifyAnalytics"); score += 2; }
      if (s.metaGenerator.toLowerCase().includes("shopify")) { signals.push("meta_generator:shopify"); score += 3; }
      if (s.scriptSrcs.some((src) => src.includes("cdn.shopify.com"))) { signals.push("script:cdn.shopify.com"); score += 3; }
      if (s.linkHrefs.some((h) => h.includes("cdn.shopify.com"))) { signals.push("link:cdn.shopify.com"); score += 2; }
      if (s.cookieNames.some((c) => c.startsWith("_shopify") || c === "cart_currency")) { signals.push("cookie:shopify"); score += 2; }
      if (s.scriptSrcs.some((src) => src.includes("/shopify_pay"))) { signals.push("script:shopify_pay"); score += 1; }

      const confidence = score >= 5 ? "high" : score >= 3 ? "medium" : "low";
      return { matched: score >= 2, confidence, signals, version: s.shopifyVersion, theme: s.shopifyTheme };
    },
  },

  // ─── WooCommerce ─────────────────────────────────────────────────
  {
    platform: "woocommerce",
    match: (s) => {
      const signals: string[] = [];
      let score = 0;

      if (s.jsGlobals.includes("wc_add_to_cart_params")) { signals.push("js_global:wc_add_to_cart_params"); score += 3; }
      if (s.jsGlobals.includes("woocommerce_params")) { signals.push("js_global:woocommerce_params"); score += 3; }
      if (s.metaGenerator.toLowerCase().includes("woocommerce")) { signals.push("meta_generator:woocommerce"); score += 3; }
      if (s.bodyClasses.some((c) => c.startsWith("woocommerce"))) { signals.push("body_class:woocommerce"); score += 3; }
      if (s.scriptSrcs.some((src) => src.includes("/woocommerce/") || src.includes("/wc-"))) { signals.push("script:woocommerce"); score += 2; }
      if (s.linkHrefs.some((h) => h.includes("/woocommerce/"))) { signals.push("link:woocommerce"); score += 2; }
      if (s.htmlHints.some((h) => h.includes("woocommerce"))) { signals.push("html_hint:woocommerce"); score += 1; }

      const confidence = score >= 5 ? "high" : score >= 3 ? "medium" : "low";
      return { matched: score >= 2, confidence, signals };
    },
  },

  // ─── BigCommerce ─────────────────────────────────────────────────
  {
    platform: "bigcommerce",
    match: (s) => {
      const signals: string[] = [];
      let score = 0;

      if (s.jsGlobals.includes("BCData")) { signals.push("js_global:BCData"); score += 3; }
      if (s.jsGlobals.includes("stencilUtils")) { signals.push("js_global:stencilUtils"); score += 3; }
      if (s.metaGenerator.toLowerCase().includes("bigcommerce")) { signals.push("meta_generator:bigcommerce"); score += 3; }
      if (s.scriptSrcs.some((src) => src.includes("bigcommerce.com"))) { signals.push("script:bigcommerce.com"); score += 2; }
      if (s.cookieNames.some((c) => c === "SHOP_SESSION_TOKEN" || c.startsWith("bc_"))) { signals.push("cookie:bigcommerce"); score += 2; }
      if (s.htmlHints.some((h) => h.includes("bigcommerce"))) { signals.push("html_hint:bigcommerce"); score += 1; }

      const confidence = score >= 5 ? "high" : score >= 3 ? "medium" : "low";
      return { matched: score >= 2, confidence, signals };
    },
  },

  // ─── Magento ─────────────────────────────────────────────────────
  {
    platform: "magento",
    match: (s) => {
      const signals: string[] = [];
      let score = 0;

      if (s.jsGlobals.includes("Mage")) { signals.push("js_global:Mage"); score += 3; }
      if (s.jsGlobals.includes("require") && s.scriptSrcs.some((src) => src.includes("mage/"))) { signals.push("script:mage"); score += 2; }
      if (s.metaGenerator.toLowerCase().includes("magento")) { signals.push("meta_generator:magento"); score += 3; }
      if (s.bodyClasses.some((c) => c.includes("cms-") || c.includes("catalog-"))) { signals.push("body_class:magento"); score += 1; }
      if (s.scriptSrcs.some((src) => src.includes("/static/frontend/"))) { signals.push("script:static_frontend"); score += 2; }
      if (s.cookieNames.includes("form_key")) { signals.push("cookie:form_key"); score += 1; }
      if (s.linkHrefs.some((h) => h.includes("/static/frontend/"))) { signals.push("link:static_frontend"); score += 2; }

      const confidence = score >= 5 ? "high" : score >= 3 ? "medium" : "low";
      return { matched: score >= 2, confidence, signals };
    },
  },

  // ─── Wix ─────────────────────────────────────────────────────────
  {
    platform: "wix",
    match: (s) => {
      const signals: string[] = [];
      let score = 0;

      if (s.metaGenerator.toLowerCase().includes("wix")) { signals.push("meta_generator:wix"); score += 3; }
      if (s.scriptSrcs.some((src) => src.includes("static.parastorage.com") || src.includes("static.wixstatic.com"))) { signals.push("script:wix_cdn"); score += 3; }
      if (s.htmlHints.some((h) => h.includes("wix") || h.includes("corvid"))) { signals.push("html_hint:wix"); score += 2; }
      if (s.jsGlobals.includes("wixBiSession")) { signals.push("js_global:wixBiSession"); score += 3; }

      const confidence = score >= 5 ? "high" : score >= 3 ? "medium" : "low";
      return { matched: score >= 2, confidence, signals };
    },
  },

  // ─── Squarespace ─────────────────────────────────────────────────
  {
    platform: "squarespace",
    match: (s) => {
      const signals: string[] = [];
      let score = 0;

      if (s.metaGenerator.toLowerCase().includes("squarespace")) { signals.push("meta_generator:squarespace"); score += 3; }
      if (s.jsGlobals.includes("Static") && s.jsGlobals.includes("Squarespace")) { signals.push("js_global:Squarespace"); score += 3; }
      if (s.scriptSrcs.some((src) => src.includes("squarespace.com") || src.includes("sqsp.net"))) { signals.push("script:squarespace"); score += 2; }
      if (s.bodyClasses.some((c) => c.includes("sqs-"))) { signals.push("body_class:sqs"); score += 2; }

      const confidence = score >= 5 ? "high" : score >= 3 ? "medium" : "low";
      return { matched: score >= 2, confidence, signals };
    },
  },
];

/** Detects the ecommerce platform from page signals. */
export function detectPlatform(signals: PlatformSignals): PlatformResult {
  let bestMatch: PlatformResult | null = null;
  let bestScore = 0;

  for (const matcher of MATCHERS) {
    const result = matcher.match(signals);
    if (!result.matched) continue;

    const score = result.confidence === "high" ? 3 : result.confidence === "medium" ? 2 : 1;
    if (score > bestScore) {
      bestScore = score;
      bestMatch = {
        detected: matcher.platform,
        confidence: result.confidence,
        signals: result.signals,
        version: result.version,
        theme: result.theme,
      };
    }
  }

  return bestMatch ?? { detected: "custom", confidence: "low", signals: ["no_platform_matched"] };
}

/** Script to inject into the browser to extract platform signals. */
export function extractPlatformSignalsScript(): string {
  return `(() => {
    const signals = {
      jsGlobals: [],
      metaGenerator: '',
      cookieNames: [],
      bodyClasses: [],
      scriptSrcs: [],
      linkHrefs: [],
      htmlHints: [],
      shopifyTheme: undefined,
      shopifyVersion: undefined,
    };

    // JS globals
    const globalsToCheck = [
      'Shopify', 'ShopifyAnalytics', 'ShopifyPay',
      'wc_add_to_cart_params', 'woocommerce_params', 'wp',
      'BCData', 'stencilUtils',
      'Mage',
      'wixBiSession',
      'Squarespace', 'Static',
    ];
    for (const g of globalsToCheck) {
      if (typeof window[g] !== 'undefined') signals.jsGlobals.push(g);
    }

    // Meta generator
    const gen = document.querySelector('meta[name="generator"]');
    signals.metaGenerator = gen ? gen.getAttribute('content') || '' : '';

    // Cookies
    signals.cookieNames = document.cookie.split(';').map(c => c.trim().split('=')[0]).filter(Boolean);

    // Body classes
    signals.bodyClasses = Array.from(document.body.classList);

    // Script srcs (first 50)
    const scripts = document.querySelectorAll('script[src]');
    for (let i = 0; i < Math.min(scripts.length, 50); i++) {
      signals.scriptSrcs.push(scripts[i].getAttribute('src') || '');
    }

    // Link hrefs (stylesheets, first 30)
    const links = document.querySelectorAll('link[href]');
    for (let i = 0; i < Math.min(links.length, 30); i++) {
      signals.linkHrefs.push(links[i].getAttribute('href') || '');
    }

    // HTML hints (comments and data attributes)
    const html = document.documentElement.outerHTML.slice(0, 5000).toLowerCase();
    const hintPatterns = ['woocommerce', 'bigcommerce', 'magento', 'shopify', 'wix', 'squarespace'];
    for (const hint of hintPatterns) {
      if (html.includes(hint)) signals.htmlHints.push(hint);
    }

    // Shopify-specific
    if (typeof window.Shopify !== 'undefined') {
      try {
        signals.shopifyTheme = window.Shopify.theme?.name;
        signals.shopifyVersion = window.Shopify.version;
      } catch {}
    }

    return signals;
  })()`;
}
