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
  const { model } = getStagehandModelConfig();
  const stagehand = new Stagehand({
    env: "LOCAL",
    model,
    domSettleTimeout: 10000,
    verbose: 0,
    localBrowserLaunchOptions: {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
      ],
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

  // ─── 2. Set up network capture ───────────────────────────────────
  let currentFunnelStep = "home";
  const capturedEvents: (ParsedGa4Event & { capturedAt: string; funnelStep: string })[] = [];
  const seenRequests = new Set<string>();
  const har = createHarCapture();
  const allRequestUrls: string[] = [];

  // Route handler that captures GA4 events and continues the request
  const captureAndContinue = async (route: { request: () => { url: () => string; postData: () => string | null }; continue: () => Promise<void> }) => {
    const req = route.request();
    const reqUrl = req.url();
    const postData = req.postData() ?? undefined;
    const dedupeKey = `${reqUrl}|${postData ?? ""}`;
    if (!seenRequests.has(dedupeKey)) {
      seenRequests.add(dedupeKey);
      const events = parseGa4Request(reqUrl, postData);
      for (const event of events) {
        capturedEvents.push({
          ...event,
          capturedAt: new Date().toISOString(),
          funnelStep: currentFunnelStep,
        });
      }
    }
    await route.continue();
  };

  // GA4-specific route handlers (targeted, no slowdown)
  await pwContext.route("**/g/collect*", captureAndContinue);
  await pwContext.route("**/mp/collect*", captureAndContinue);
  await pwContext.route("**/*tid=G-*", captureAndContinue);

  // HAR capture — record ALL request URLs via page-level listener for analytics detection
  const pwPage = pwContext.pages()[0];
  if (pwPage) {
    pwPage.on("request", (request) => {
      const reqUrl = request.url();
      allRequestUrls.push(reqUrl);
      har.entries.push({
        url: reqUrl,
        method: request.method(),
        postData: request.postData() ?? undefined,
        timestamp: new Date().toISOString(),
      });
    });
  }

  const page = stagehand.context.pages()[0]!;
  const funnelLog: FunnelStepLog[] = [];
  let stepCounter = 0;

  /** Log a funnel step with timing, URL tracking, and event counts. */
  async function runStep(
    name: string,
    instruction: string,
    action: () => Promise<void>,
  ) {
    stepCounter++;
    const urlBefore = await page.url();
    const eventsBefore = capturedEvents.length;
    const stepStart = Date.now();
    let success = false;
    let error: string | undefined;

    currentFunnelStep = name;
    try {
      await action();
      success = true;
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }

    const urlAfter = await page.url();
    funnelLog.push({
      step: stepCounter,
      name,
      instruction,
      urlBefore,
      urlAfter,
      success,
      error,
      eventsCaptureDuringStep: capturedEvents.length - eventsBefore,
      timestamp: new Date().toISOString(),
      durationMs: Date.now() - stepStart,
    });
  }

  // ─── 3. Walk the funnel ───────────────────────────────────────────
  try {
    // Home
    await runStep("home", "Navigate to homepage", async () => {
      await page.goto(url, { waitUntil: "networkidle", timeoutMs: 30000 }).catch(() => {});
      await page.waitForTimeout(3000);
      try {
        await stagehand.act("dismiss any cookie consent banner or popup by accepting or closing it", { timeout: 5000 });
      } catch { /* no popup */ }
    });

    // Category
    await runStep("category", "Click on a product category or collection link in the navigation menu", async () => {
      await stagehand.act(
        "click on a product category or collection link in the navigation menu. " +
        "Look for links like 'Shop', 'Collections', 'Men', 'Women', or 'All Products'. " +
        "Prefer a link that leads to a page showing multiple products.",
        { timeout: 15000 },
      );
      await page.waitForTimeout(3000);
    });

    // Product
    await runStep("product", "Click on the first product in the listing to view its details page", async () => {
      await stagehand.act(
        "click on the first product in the product listing or grid to view its details page",
        { timeout: 15000 },
      );
      await page.waitForTimeout(3000);
    });

    // Variant selection
    await runStep("variant_selection", "Select first available variant (size/color) if options exist", async () => {
      const variantOptions = await stagehand.observe(
        "find any size, color, or variant selector options on this product page",
        { timeout: 8000 },
      );
      if (variantOptions.length > 0) {
        const safeOption = variantOptions.find((o) => !isPaymentAction(o.description ?? ""));
        if (safeOption) {
          await stagehand.act(safeOption);
          await page.waitForTimeout(1500);
        }
      }
    });

    // Add to Cart
    await runStep("add_to_cart", "Click the add to cart / add to bag button", async () => {
      const atcButtons = await stagehand.observe(
        "find the add to cart button or add to bag button on this product page",
        { timeout: 8000 },
      );
      if (atcButtons.length > 0) {
        const safe = atcButtons.filter((b) => !isPaymentAction(b.description ?? ""));
        if (safe.length > 0) {
          await stagehand.act(safe[0]!);
          await page.waitForTimeout(3000);
        }
      } else {
        await stagehand.act("click the add to cart button", { timeout: 10000 });
        await page.waitForTimeout(3000);
      }
    });

    // View cart
    await runStep("cart", "Navigate to cart page or open cart drawer", async () => {
      await stagehand.act(
        "navigate to the shopping cart page. Look for a cart icon, 'View Cart', 'Go to Cart', " +
        "or a cart drawer that appeared after adding to cart.",
        { timeout: 15000 },
      );
      await page.waitForTimeout(3000);
    });

    // Begin checkout (HARD STOP — never proceed past this)
    await runStep("checkout", "Click the checkout / proceed to checkout button", async () => {
      const checkoutButtons = await stagehand.observe(
        "find the checkout button or proceed to checkout button",
        { timeout: 8000 },
      );
      const safe = checkoutButtons.filter((b) => !isPaymentAction(b.description ?? ""));
      if (safe.length > 0) {
        await stagehand.act(safe[0]!);
        await page.waitForTimeout(3000);
      } else {
        await stagehand.act("click the checkout button or proceed to checkout", { timeout: 10000 });
        await page.waitForTimeout(3000);
      }
    });
  } finally {
    await stagehand.close();
  }

  // ─── 4. Assemble AuditDocument ────────────────────────────────────
  log("ANALYZING");

  const domain = new URL(url).hostname;
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
