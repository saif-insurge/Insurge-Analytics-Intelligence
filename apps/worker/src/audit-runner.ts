/**
 * Core audit runner — executes the full audit pipeline:
 * 1. Launches browser via Stagehand
 * 2. Walks the ecommerce funnel (home → category → product → ATC → cart → checkout)
 * 3. Captures all GA4 events via network interception
 * 4. Assembles the AuditDocument (classifier + detector + rule engine)
 * 5. Persists to database
 *
 * Used by both the CLI (local dev) and the HTTP worker (production).
 */

import { Stagehand } from "@browserbasehq/stagehand";
import { chromium as playwrightCore } from "playwright-core";
import { runFunnelAgent } from "./funnel-agent.js";
import {
  isGa4Endpoint,
  parseGa4Request,
  assembleAuditDocument,
  type ParsedGa4Event,
  type RawAuditCapture,
  type AuditDocument,
} from "@ga4-audit/audit-core";
import { getStagehandModelConfig } from "./stagehand-config.js";
import { isPaymentAction } from "./stop-list.js";
import { persistAudit } from "./db.js";
import { sendAuditReadyEmail } from "./email.js";
import { createHarCapture, finalizeHar, sanitizeHar, type HarCapture } from "./har-capture.js";
import { analyzeNetworkRequests, type AiAnalysisResult } from "./ai-analysis.js";

export type AuditRunnerOptions = {
  auditId: string;
  url: string;
  operator: string;
  organizationId: string;
  userId: string;
  /** Called on status changes. */
  onStatus?: (status: string) => void;
  /** If true, persist results to DB. Default true. */
  persistToDb?: boolean;
  /** Email to notify when audit is complete. */
  notifyEmail?: string;
};

export type FunnelStepLog = {
  step: number;
  name: string;
  instruction: string;
  observation?: string;
  urlBefore: string;
  urlAfter: string;
  success: boolean;
  error?: string;
  eventsCaptureDuringStep: number;
  timestamp: string;
  durationMs: number;
};

export type AuditRunnerResult = {
  auditDoc: AuditDocument;
  eventCount: number;
  duration: number;
  har: HarCapture;
  aiAnalysis: AiAnalysisResult | null;
  funnelLog: FunnelStepLog[];
};

/** Runs the full audit pipeline for a given URL. */
export async function runAuditPipeline(
  options: AuditRunnerOptions,
): Promise<AuditRunnerResult> {
  const { auditId, url, operator, organizationId, userId, onStatus, persistToDb = true } = options;
  const startTime = Date.now();

  const log = (msg: string) => onStatus?.(msg);
  log("RUNNING");

  // ─── 1. Initialize Stagehand ──────────────────────────────────────
  const stagehandConfig = getStagehandModelConfig();
  const headless = process.env.HEADLESS !== "false";
  console.log(`Browser config: model=${stagehandConfig.model}, provider=${stagehandConfig.provider}, headless=${headless} (HEADLESS env="${process.env.HEADLESS ?? "unset"}")`);

  const stagehand = new Stagehand({
    env: "LOCAL",
    model: stagehandConfig.clientOptions
      ? { modelName: stagehandConfig.model, ...stagehandConfig.clientOptions }
      : stagehandConfig.model,
    domSettleTimeout: 15000,
    verbose: 1,
    experimental: true,
    localBrowserLaunchOptions: {
      headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        // Force CDP to bind on IPv4 loopback. Cloud Run gen2 default networking
        // can leave Chromium binding only to IPv6 (::1), causing ECONNREFUSED
        // when Stagehand connects to ws://127.0.0.1:PORT. (Playwright #21022)
        "--remote-debugging-address=127.0.0.1",
        // Stealth — hides Chrome's automation flags from JS detection
        "--disable-blink-features=AutomationControlled",
        "--disable-features=IsolateOrigins,site-per-process",
        "--disable-site-isolation-trials",
      ],
      viewport: { width: 1440, height: 900 },
      locale: "en-US",
      // Proxy can be disabled for debugging by setting DISABLE_PROXY=true
      ...(process.env.PROXY_SERVER && process.env.DISABLE_PROXY !== "true" ? {
        proxy: {
          server: process.env.PROXY_SERVER.startsWith("http") ? process.env.PROXY_SERVER : `http://${process.env.PROXY_SERVER}`,
          username: process.env.PROXY_USERNAME,
          password: process.env.PROXY_PASSWORD,
        },
      } : {}),
    },
  });

  try {
    await stagehand.init();
  } catch (initErr) {
    // Clean up and rethrow with a clearer message
    try { await stagehand.close(); } catch { /* ignore */ }
    throw new Error(`Failed to launch browser: ${initErr instanceof Error ? initErr.message : String(initErr)}`);
  }

  // Connect Playwright for network interception via route()
  const browser = await playwrightCore.connectOverCDP({
    wsEndpoint: stagehand.connectURL(),
  });
  const pwContext = browser.contexts()[0]!;

  // Authenticate proxy at the CDP page level (handles cases where
  // Stagehand doesn't pass proxy credentials to the browser correctly)
  const proxyEnabled = process.env.PROXY_SERVER && process.env.DISABLE_PROXY !== "true";
  if (proxyEnabled && process.env.PROXY_USERNAME && process.env.PROXY_PASSWORD) {
    const pwPage = pwContext.pages()[0];
    if (pwPage) {
      await pwPage.context().setHTTPCredentials({
        username: process.env.PROXY_USERNAME,
        password: process.env.PROXY_PASSWORD,
      });
    }
  }
  console.log(`[Proxy] ${proxyEnabled ? `Enabled (${process.env.PROXY_SERVER})` : "Disabled"}`);

  // Stealth init script — masks the most common bot-detection signals.
  // Runs in every page (existing + new) before any site JS executes.
  // Defeats Cloudflare/Akamai JS challenges and the navigator.webdriver check
  // that suppresses analytics on flagged sessions.
  // Passed as a string because the code runs in the browser, not Node.
  const STEALTH_SCRIPT = `
    // 1. Hide webdriver flag
    Object.defineProperty(Navigator.prototype, "webdriver", { get: () => undefined });
    // 2. Mock plugins (real browsers have non-empty plugin arrays)
    Object.defineProperty(navigator, "plugins", {
      get: () => [
        { name: "PDF Viewer", filename: "internal-pdf-viewer", description: "Portable Document Format" },
        { name: "Chrome PDF Viewer", filename: "internal-pdf-viewer", description: "" },
        { name: "Chromium PDF Viewer", filename: "internal-pdf-viewer", description: "" },
      ],
    });
    // 3. Mock languages
    Object.defineProperty(navigator, "languages", { get: () => ["en-US", "en"] });
    // 4. Add chrome runtime stub (real Chrome has window.chrome)
    if (!window.chrome) {
      window.chrome = { runtime: {}, loadTimes: () => ({}), csi: () => ({}) };
    }
    // 5. Patch permissions.query to not reveal headless state
    const originalQuery = window.navigator.permissions && window.navigator.permissions.query;
    if (originalQuery) {
      window.navigator.permissions.query = (parameters) =>
        parameters.name === "notifications"
          ? Promise.resolve({ state: Notification.permission })
          : originalQuery.call(window.navigator.permissions, parameters);
    }
    // 6. Strip Playwright-injected globals if any leak through
    delete window.__playwright;
    delete window.__pw_manual;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
  `;
  await pwContext.addInitScript(STEALTH_SCRIPT);
  console.log("[Stealth] Init script attached to context — will run on all pages");

  // ─── 2. Set up network capture ───────────────────────────────────
  // Combined approach: listen at CONTEXT level (catches main page, new tabs)
  // AND attach page-level listeners (catches cross-origin iframes which CDP-attached
  // context-level events can miss for OOPIFs).
  const har = createHarCapture();
  const allRequestUrls: string[] = [];
  const seen = new Set<string>(); // dedupe key: url + postData hash

  const captureRequest = (request: { url: () => string; method: () => string; postData: () => string | null }) => {
    const reqUrl = request.url();
    const postData = request.postData() ?? undefined;
    // Dedupe — same URL + postData arriving from both context and page listeners
    const key = `${reqUrl}|${postData ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    allRequestUrls.push(reqUrl);
    har.entries.push({
      url: reqUrl,
      method: request.method(),
      postData,
      timestamp: new Date().toISOString(),
    });
  };

  console.log(`[Capture] Listener attached at CONTEXT level. Initial pages: ${pwContext.pages().length}`);

  // Context-level listener
  pwContext.on("request", captureRequest);

  // Page-level listener — attach to existing pages and any new ones
  // This catches requests from cross-origin iframes (OOPIFs) that context-level
  // events sometimes miss when connected via CDP.
  const attachPageListeners = (page: { on: (event: string, handler: (r: unknown) => void) => void; url: () => string; }) => {
    page.on("request", captureRequest as (r: unknown) => void);
    console.log(`[Capture] Attached page-level listener to: ${page.url()}`);
  };
  for (const existing of pwContext.pages()) {
    attachPageListeners(existing as unknown as Parameters<typeof attachPageListeners>[0]);
  }
  pwContext.on("page", (newPage) => {
    console.log(`[Capture] New page detected: ${newPage.url()}`);
    attachPageListeners(newPage as unknown as Parameters<typeof attachPageListeners>[0]);
  });

  let funnelLog: FunnelStepLog[] = [];

  // ─── 3. Walk the funnel using autonomous agent ─────────────────────
  try {
    console.log("Starting funnel agent...");
    const { agentResult, stepLogs } = await runFunnelAgent(stagehand, url, har.entries, allRequestUrls);
    funnelLog = stepLogs;

    if (agentResult) {
      console.log(`Agent completed. Pages visited: ${agentResult.pagesVisited.filter(p => p.visited).map(p => p.page).join(", ")}`);
      console.log(`Cart type: ${agentResult.cartType}, Reached checkout: ${agentResult.reachedCheckout}`);
      if (agentResult.issues.length > 0) {
        console.log(`Issues: ${agentResult.issues.join("; ")}`);
      }
    }

  } finally {
    await stagehand.close();
  }

  // ─── 4. Parse GA4 events from HAR & assemble AuditDocument ────────
  log("ANALYZING");

  const domain = new URL(url).hostname;

  // Parse all GA4 events from the complete HAR — deterministic, no race conditions
  const capturedEvents: (ParsedGa4Event & { capturedAt: string; funnelStep: string })[] = [];
  for (const entry of har.entries) {
    if (!isGa4Endpoint(entry.url)) continue;
    const parsed = parseGa4Request(entry.url, entry.postData);
    for (const evt of parsed) {
      capturedEvents.push({
        ...evt,
        capturedAt: entry.timestamp,
        funnelStep: "unknown", // HAR doesn't track funnel step context
      });
    }
  }
  console.log(`Parsed ${capturedEvents.length} GA4 events from ${har.entries.length} HAR entries`);

  // Diagnostic: how many HAR entries hit GA4-shaped URLs (helps tell if events were missed by capture vs parser)
  const ga4UrlCount = har.entries.filter((e) => isGa4Endpoint(e.url)).length;
  const uniqueDomains = new Set(har.entries.map((e) => { try { return new URL(e.url).hostname; } catch { return "invalid"; } }));
  console.log(`[Capture diagnostic] GA4-shaped URLs in HAR: ${ga4UrlCount}, unique domains: ${uniqueDomains.size}`);

  // Count requests to known analytics domains (regardless of whether our parser matched them)
  const analyticsHosts = ["google-analytics.com", "analytics.google.com", "doubleclick.net", "facebook.com", "facebook.net", "googletagmanager.com", "merchant-center-analytics.goog"];
  const hitsByHost: Record<string, number> = {};
  for (const entry of har.entries) {
    try {
      const host = new URL(entry.url).hostname;
      for (const target of analyticsHosts) {
        if (host.endsWith(target)) {
          hitsByHost[target] = (hitsByHost[target] ?? 0) + 1;
          break;
        }
      }
    } catch { /* skip */ }
  }
  console.log(`[Capture diagnostic] Analytics domain hits:`, hitsByHost);

  // Show a few sample GA-collect URLs (or absence thereof)
  const gaUrls = har.entries.filter((e) => /analytics\.google\.com|google-analytics\.com/.test(e.url)).slice(0, 5);
  console.log(`[Capture diagnostic] Sample GA URLs (${gaUrls.length} of ${har.entries.filter((e) => /analytics\.google\.com|google-analytics\.com/.test(e.url)).length}):`);
  for (const e of gaUrls) {
    console.log(`  ${e.method} ${e.url.slice(0, 200)}...`);
  }

  if (har.entries.length > 0) {
    const firstUrls = har.entries.slice(0, 3).map((e) => e.url);
    const lastUrls = har.entries.slice(-3).map((e) => e.url);
    console.log(`  First 3 URLs: ${firstUrls.join(", ")}`);
    console.log(`  Last 3 URLs:  ${lastUrls.join(", ")}`);
  }

  const tids = [...new Set(capturedEvents.map((e) => e.tid).filter(Boolean))];

  const rawCapture: RawAuditCapture = {
    auditId,
    url,
    domain,
    operator,
    pages: [
      { id: "p_home", url, visitedAt: new Date(startTime).toISOString(), funnelStep: "home", pageSignals: { url, title: "", jsonLdTypes: [], ogType: "", hasAddToCartButton: false, hasProductPrice: false, hasQuantitySelector: false, hasCheckoutForm: false, hasCartItems: false, productCardCount: 0, metaDescription: "", canonicalUrl: "" }, dataLayerEntries: [], domContentLoaded: 0, load: 0, interactiveElements: [] },
      { id: "p_category", url: `${url}#category`, visitedAt: new Date(startTime + 10000).toISOString(), funnelStep: "category", pageSignals: { url: `${url}/collections`, title: "", jsonLdTypes: [], ogType: "", hasAddToCartButton: false, hasProductPrice: false, hasQuantitySelector: false, hasCheckoutForm: false, hasCartItems: false, productCardCount: 8, metaDescription: "", canonicalUrl: "" }, dataLayerEntries: [], domContentLoaded: 0, load: 0, interactiveElements: [] },
      { id: "p_product", url: `${url}#product`, visitedAt: new Date(startTime + 20000).toISOString(), funnelStep: "product", pageSignals: { url: `${url}/products/item`, title: "", jsonLdTypes: ["Product"], ogType: "product", hasAddToCartButton: true, hasProductPrice: true, hasQuantitySelector: false, hasCheckoutForm: false, hasCartItems: false, productCardCount: 0, metaDescription: "", canonicalUrl: "" }, dataLayerEntries: [], domContentLoaded: 0, load: 0, interactiveElements: [] },
      { id: "p_cart", url: `${url}#cart`, visitedAt: new Date(startTime + 30000).toISOString(), funnelStep: "cart", pageSignals: { url: `${url}/cart`, title: "", jsonLdTypes: [], ogType: "", hasAddToCartButton: false, hasProductPrice: false, hasQuantitySelector: false, hasCheckoutForm: false, hasCartItems: true, productCardCount: 0, metaDescription: "", canonicalUrl: "" }, dataLayerEntries: [], domContentLoaded: 0, load: 0, interactiveElements: [] },
      { id: "p_checkout", url: `${url}#checkout`, visitedAt: new Date(startTime + 40000).toISOString(), funnelStep: "checkout", pageSignals: { url: `${url}/checkout`, title: "", jsonLdTypes: [], ogType: "", hasAddToCartButton: false, hasProductPrice: false, hasQuantitySelector: false, hasCheckoutForm: true, hasCartItems: false, productCardCount: 0, metaDescription: "", canonicalUrl: "" }, dataLayerEntries: [], domContentLoaded: 0, load: 0, interactiveElements: [] },
    ],
    events: capturedEvents,
    platformSignals: { jsGlobals: [], metaGenerator: "", cookieNames: [], bodyClasses: [], scriptSrcs: [], linkHrefs: [], htmlHints: [] },
    stack: {
      tagManager: "gtm",
      containerIds: [],
      ga4Properties: tids,
      duplicateTrackers: [],
      otherPixels: [],
    },
  };

  const auditDoc = assembleAuditDocument(rawCapture);

  // ─── 5. AI analysis on captured network requests ───────────────────
  let aiAnalysis: AiAnalysisResult | null = null;
  try {
    aiAnalysis = await analyzeNetworkRequests(
      allRequestUrls,
      capturedEvents.length,
      domain,
      capturedEvents.map((e) => e.name),
    );
  } catch (err) {
    console.error("AI analysis failed:", err);
  }

  // Finalize and sanitize HAR
  const finalHar = sanitizeHar(finalizeHar(har));

  // ─── 6. Persist to database ───────────────────────────────────────
  if (persistToDb) {
    log("RENDERING");
    try {
      await persistAudit(auditDoc, {
        organizationId,
        createdById: userId,
        aiAnalysis: aiAnalysis ? { summary: aiAnalysis.summary, insights: aiAnalysis.insights, ga4Present: aiAnalysis.ga4Present, tokensUsed: aiAnalysis.tokensUsed, inputTokens: aiAnalysis.inputTokens, outputTokens: aiAnalysis.outputTokens, estimatedCostUsd: aiAnalysis.estimatedCostUsd } : null,
        detectedPlatforms: aiAnalysis?.detectedPlatforms ?? null,
        funnelLog,
      });
    } catch (err) {
      console.error("Failed to persist audit:", err);
    }
  }

  log("COMPLETE");

  // Send notification email
  if (options.notifyEmail) {
    const webBase = process.env.WEB_BASE_URL ?? "http://localhost:3000";
    try {
      await sendAuditReadyEmail({
        to: options.notifyEmail,
        domain: new URL(url).hostname,
        score: auditDoc.scorecard.overall.score,
        grade: auditDoc.scorecard.overall.grade,
        reportUrl: `${webBase}/report/${auditId}`,
        auditId,
      });
    } catch (err) {
      console.error("Failed to send notification email:", err);
    }
  }

  return {
    auditDoc,
    eventCount: capturedEvents.length,
    duration: Date.now() - startTime,
    har: finalHar,
    aiAnalysis,
    funnelLog,
  };
}
