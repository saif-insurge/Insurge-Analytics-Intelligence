/**
 * Local CLI runner for GA4 audit.
 *
 * Phase A (passive): Just loads the URL and captures events on page load.
 * Phase B (AI):      Walks the ecommerce funnel using Stagehand AI navigation.
 *
 * Usage:
 *   npx tsx src/cli.ts <URL> [--headed] [--passive]
 *
 * --passive  Phase A only (no AI, no API key needed)
 * --headed   Show browser window
 */

import dotenv from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

// Load .env from monorepo root
const __dirname = fileURLToPath(new URL(".", import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../.env") });
import { Stagehand } from "@browserbasehq/stagehand";
import { chromium, type Page } from "playwright";
import { chromium as playwrightCore } from "playwright-core";
import {
  isGa4Endpoint,
  parseGa4Request,
  GA4_ECOMMERCE_EVENTS,
  isEcommerceEvent,
} from "@ga4-audit/audit-core";
import type { ParsedGa4Event } from "@ga4-audit/audit-core";
import { getStagehandModelConfig } from "./stagehand-config.js";
import { isPaymentAction } from "./stop-list.js";

const url = process.argv[2];
const headed = process.argv.includes("--headed");
const passive = process.argv.includes("--passive");

if (!url) {
  console.error("Usage: npx tsx src/cli.ts <URL> [--headed] [--passive]");
  console.error("Example: npx tsx src/cli.ts https://allbirds.com");
  console.error("         npx tsx src/cli.ts https://allbirds.com --headed");
  console.error("         npx tsx src/cli.ts https://allbirds.com --passive");
  process.exit(1);
}

// Validate URL
try {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("URL must be http or https");
  }
} catch {
  console.error(`Invalid URL: ${url}`);
  process.exit(1);
}

interface FunnelStep {
  name: string;
  pageType: string;
  eventsBefore: number;
}

const capturedEvents: (ParsedGa4Event & { capturedAt: string; funnelStep: string })[] = [];
let ga4RequestCount = 0;

/** Current funnel step label — mutated as we progress through the funnel. */
let currentFunnelStep = "page_load";

/** Sets up GA4 network interception on a Playwright page via page.on("request"). */
function setupPageInterception(page: Page) {
  page.on("request", (request) => {
    handleRequest(request.url(), request.postData() ?? undefined);
  });
}

/** Track seen request URLs to deduplicate across CDP + page listeners. */
const seenRequests = new Set<string>();

/** Common handler for intercepted requests. */
function handleRequest(reqUrl: string, postData: string | undefined) {
  if (!isGa4Endpoint(reqUrl)) return;

  // Deduplicate: use URL + postData hash as key
  const dedupeKey = `${reqUrl}|${postData ?? ""}`;
  if (seenRequests.has(dedupeKey)) return;
  seenRequests.add(dedupeKey);

  ga4RequestCount++;
  const events = parseGa4Request(reqUrl, postData);
  for (const event of events) {
    capturedEvents.push({
      ...event,
      capturedAt: new Date().toISOString(),
      funnelStep: currentFunnelStep,
    });
  }
}

/** Runs Phase A — passive capture on page load. */
async function runPassive() {
  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  currentFunnelStep = "page_load";
  setupPageInterception(page);

  try {
    await page.goto(url!, { waitUntil: "networkidle", timeout: 30000 });
  } catch {
    console.warn(`⚠️  Navigation didn't reach networkidle. Continuing.`);
  }

  await page.waitForTimeout(3000);

  // Scroll to trigger lazy events
  await page.evaluate("window.scrollTo(0, document.body.scrollHeight / 2)");
  await page.waitForTimeout(2000);
  await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
  await page.waitForTimeout(2000);

  await browser.close();
}

/** Runs Phase B — AI-powered funnel walk using Stagehand. */
async function runFunnel() {
  const { model } = getStagehandModelConfig();

  const stagehand = new Stagehand({
    env: "LOCAL",
    model,
    domSettleTimeout: 10000,
    verbose: 1,
  });

  await stagehand.init();

  // Connect Playwright to Stagehand's browser via CDP for network interception.
  // We use a CDP session with Network.requestWillBeSent — this captures EVERY
  // network request (fetch, XHR, sendBeacon, img pixel) at the Chrome level.
  const browser = await playwrightCore.connectOverCDP({
    wsEndpoint: stagehand.connectURL(),
  });
  const pwContext = browser.contexts()[0]!;
  const pwPage = pwContext.pages()[0]!;

  // Intercept only GA4 collect endpoints — NOT all requests (which causes massive slowdown).
  currentFunnelStep = "home";
  const interceptRoute = async (route: { request: () => { url: () => string; postData: () => string | null }; continue: () => Promise<void> }) => {
    handleRequest(route.request().url(), route.request().postData() ?? undefined);
    await route.continue();
  };
  await pwContext.route("**/g/collect*", interceptRoute);
  await pwContext.route("**/mp/collect*", interceptRoute);
  await pwContext.route("**/*tid=G-*", interceptRoute);

  // Use Stagehand's page for AI navigation
  const page = stagehand.context.pages()[0]!;


  const steps: FunnelStep[] = [];

  // ─── Step 1: Home page ─────────────────────────────────────────────
  console.log(`\n📍 Step 1: Home page`);
  try {
    await page.goto(url!, { waitUntil: "networkidle", timeoutMs: 30000 });
  } catch {
    console.warn(`⚠️  Navigation didn't reach networkidle. Continuing.`);
  }
  await page.waitForTimeout(3000);


  // Dismiss cookie banners / popups
  try {
    await stagehand.act("dismiss any cookie consent banner or popup by accepting or closing it", {
      timeout: 5000,
    });
  } catch {
    // No popup to dismiss
  }

  steps.push({ name: "home", pageType: "home", eventsBefore: capturedEvents.length });
  console.log(`   ✅ Home loaded. Events so far: ${capturedEvents.length}`);

  // ─── Step 2: Category page ─────────────────────────────────────────
  console.log(`\n📍 Step 2: Navigate to a category/collection page`);
  updateFunnelStep("category");
  try {
    await stagehand.act(
      "click on a product category or collection link in the navigation menu. " +
      "Look for links like 'Shop', 'Collections', 'Men', 'Women', or 'All Products'. " +
      "Prefer a link that leads to a page showing multiple products.",
      { timeout: 15000 },
    );
    await page.waitForTimeout(3000);
    steps.push({ name: "category", pageType: "category", eventsBefore: capturedEvents.length });
    console.log(`   ✅ Category page. Events so far: ${capturedEvents.length}`);
  } catch (err) {
    console.warn(`   ⚠️  Could not navigate to category page: ${err instanceof Error ? err.message : err}`);
  }

  // ─── Step 3: Product page ──────────────────────────────────────────
  console.log(`\n📍 Step 3: Click on a product`);
  updateFunnelStep("product");
  try {
    await stagehand.act(
      "click on the first product in the product listing or grid to view its details page",
      { timeout: 15000 },
    );
    await page.waitForTimeout(3000);
    steps.push({ name: "product", pageType: "product", eventsBefore: capturedEvents.length });
    console.log(`   ✅ Product page. Events so far: ${capturedEvents.length}`);
  } catch (err) {
    console.warn(`   ⚠️  Could not navigate to product page: ${err instanceof Error ? err.message : err}`);
  }

  // ─── Step 4: Select variant (if any) and Add to Cart ───────────────
  console.log(`\n📍 Step 4: Select variant (if needed) and add to cart`);
  updateFunnelStep("add_to_cart");

  // First check if there are variant selectors
  try {
    const variantOptions = await stagehand.observe(
      "find any size, color, or variant selector options on this product page",
      { timeout: 8000 },
    );
    if (variantOptions.length > 0) {
      console.log(`   📐 Found variant options. Selecting first available...`);
      // Filter through stop-list (shouldn't trigger but be safe)
      const safeOption = variantOptions.find((o) => !isPaymentAction(o.description ?? ""));
      if (safeOption) {
        await stagehand.act(safeOption);
        await page.waitForTimeout(1500);
      }
    }
  } catch {
    // No variants to select
  }

  try {
    // Observe the add to cart button first, then act on it
    const atcButtons = await stagehand.observe(
      "find the add to cart button or add to bag button on this product page",
      { timeout: 8000 },
    );

    if (atcButtons.length > 0) {
      const safeButtons = atcButtons.filter((b) => !isPaymentAction(b.description ?? ""));
      if (safeButtons.length > 0) {
        await stagehand.act(safeButtons[0]!);
        await page.waitForTimeout(3000);
        console.log(`   ✅ Added to cart. Events so far: ${capturedEvents.length}`);
      }
    } else {
      // Fallback: direct act
      await stagehand.act("click the add to cart button", { timeout: 10000 });
      await page.waitForTimeout(3000);
          console.log(`   ✅ Added to cart. Events so far: ${capturedEvents.length}`);
    }
    steps.push({ name: "add_to_cart", pageType: "product", eventsBefore: capturedEvents.length });
  } catch (err) {
    console.warn(`   ⚠️  Could not add to cart: ${err instanceof Error ? err.message : err}`);
  }

  // ─── Step 5: View cart ─────────────────────────────────────────────
  console.log(`\n📍 Step 5: View cart`);
  updateFunnelStep("cart");
  try {
    await stagehand.act(
      "navigate to the shopping cart page. Look for a cart icon, 'View Cart', 'Go to Cart', " +
      "or a cart drawer that appeared after adding to cart.",
      { timeout: 15000 },
    );
    await page.waitForTimeout(3000);
    steps.push({ name: "cart", pageType: "cart", eventsBefore: capturedEvents.length });
    console.log(`   ✅ Cart page. Events so far: ${capturedEvents.length}`);
  } catch (err) {
    console.warn(`   ⚠️  Could not view cart: ${err instanceof Error ? err.message : err}`);
  }

  // ─── Step 6: Begin checkout ────────────────────────────────────────
  console.log(`\n📍 Step 6: Begin checkout`);
  updateFunnelStep("checkout");
  try {
    // Observe checkout buttons and filter through stop-list
    const checkoutButtons = await stagehand.observe(
      "find the checkout button or proceed to checkout button",
      { timeout: 8000 },
    );

    const safeCheckoutButtons = checkoutButtons.filter(
      (b) => !isPaymentAction(b.description ?? ""),
    );

    if (safeCheckoutButtons.length > 0) {
      await stagehand.act(safeCheckoutButtons[0]!);
      await page.waitForTimeout(3000);
          steps.push({ name: "checkout", pageType: "checkout", eventsBefore: capturedEvents.length });
      console.log(`   ✅ Checkout page. Events so far: ${capturedEvents.length}`);
    } else if (checkoutButtons.length > 0) {
      console.warn(`   🚫 All checkout buttons matched payment stop-list. Stopping here.`);
    } else {
      // Fallback
      await stagehand.act("click the checkout button or proceed to checkout", { timeout: 10000 });
      await page.waitForTimeout(3000);
          steps.push({ name: "checkout", pageType: "checkout", eventsBefore: capturedEvents.length });
      console.log(`   ✅ Checkout page. Events so far: ${capturedEvents.length}`);
    }
  } catch (err) {
    console.warn(`   ⚠️  Could not begin checkout: ${err instanceof Error ? err.message : err}`);
  }

  // ─── HARD STOP — Do not proceed past begin_checkout ────────────────
  // Final drain of any pending browser captures
  console.log(`\n🛑 HARD STOP: Not proceeding past checkout. Payment stop-list active.\n`);

  await stagehand.close();

  return steps;

  function updateFunnelStep(step: string) {
    currentFunnelStep = step;
  }
}

// ─── Print results ──────────────────────────────────────────────────

function printResults(steps?: FunnelStep[]) {
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`📊 CAPTURE RESULTS`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  console.log(`Total GA4 requests intercepted: ${ga4RequestCount}`);
  console.log(`Total events parsed: ${capturedEvents.length}\n`);

  if (capturedEvents.length === 0) {
    console.log(`❌ No GA4 events captured. Possible reasons:`);
    console.log(`   - Site doesn't use GA4`);
    console.log(`   - GA4 is loaded via consent manager (not granted in headless)`);
    console.log(`   - Events fire via a first-party proxy we didn't detect`);
    console.log(`   - Site blocked automated browser\n`);
    return;
  }

  // Group by event name
  const byName = new Map<string, typeof capturedEvents>();
  for (const event of capturedEvents) {
    const existing = byName.get(event.name) ?? [];
    existing.push(event);
    byName.set(event.name, existing);
  }

  console.log(`Events by type:`);
  console.log(`───────────────────────────────────────────────────────────`);
  for (const [name, events] of byName.entries()) {
    if (!name) continue;
    console.log(`  ${name}: ${events.length} event(s)`);
  }

  // GA4 properties
  const tids = new Set(capturedEvents.map((e) => e.tid).filter(Boolean));
  console.log(`\nGA4 Properties detected:`);
  for (const tid of tids) {
    console.log(`  ${tid}`);
  }

  // Transport types
  const transports = new Set(capturedEvents.map((e) => e.transport));
  console.log(`\nTransport types:`);
  for (const t of transports) {
    console.log(`  ${t}`);
  }

  // Funnel step breakdown (Phase B only)
  if (steps && steps.length > 0) {
    console.log(`\n═══════════════════════════════════════════════════════════`);
    console.log(`📈 FUNNEL STEP BREAKDOWN`);
    console.log(`═══════════════════════════════════════════════════════════\n`);

    for (const step of steps) {
      const stepEvents = capturedEvents.filter((e) => e.funnelStep === step.name);
      console.log(`  ${step.name} (${step.pageType}): ${stepEvents.length} events captured`);
      const ecomEvents = stepEvents.filter((e) => isEcommerceEvent(e.name));
      for (const e of ecomEvents) {
        console.log(`    ✅ ${e.name} — ${e.items.length} items`);
      }
    }
  }

  // Detailed events (first 20 to keep output manageable)
  console.log(`\n═══════════════════════════════════════════════════════════`);
  console.log(`📋 DETAILED EVENTS (showing up to 20)`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  const toShow = capturedEvents.filter((e) => e.name).slice(0, 20);
  for (const event of toShow) {
    console.log(`┌─ ${event.name} (${event.tid}) [${event.funnelStep}]`);
    console.log(`│  transport: ${event.transport}`);
    if (event.items.length > 0) {
      console.log(`│  items (${event.items.length}):`);
      for (const item of event.items) {
        const id = item["item_id"] ?? "?";
        const name = item["item_name"] ?? "?";
        const price = item["price"] ?? "?";
        console.log(`│    - ${name} (${id}) $${price}`);
      }
    }
    console.log(`└──────────────────────────────────────────────────────\n`);
  }

  // Ecommerce checklist
  console.log(`═══════════════════════════════════════════════════════════`);
  console.log(`📝 ECOMMERCE EVENT CHECKLIST`);
  console.log(`═══════════════════════════════════════════════════════════\n`);

  // Show all GA4 ecommerce events in funnel order + supplementary events
  const inScopeEvents = GA4_ECOMMERCE_EVENTS.filter((e) => e.inAuditScope);
  const funnelEvents = inScopeEvents
    .filter((e) => e.funnelOrder > 0)
    .sort((a, b) => a.funnelOrder - b.funnelOrder);
  const supplementaryEvents = inScopeEvents.filter((e) => e.funnelOrder === 0);

  console.log(`  Funnel events:`);
  for (const eventDef of funnelEvents) {
    const found = capturedEvents.filter((e) => e.name === eventDef.name);
    const status = found.length > 0 ? "✅" : "⬜";
    const scope = eventDef.inAuditScope ? "" : " (out of scope)";
    console.log(`  ${status} ${eventDef.name} (${found.length})${scope}`);
  }

  console.log(`\n  Supplementary events:`);
  for (const eventDef of supplementaryEvents) {
    const found = capturedEvents.filter((e) => e.name === eventDef.name);
    if (found.length > 0) {
      console.log(`  ✅ ${eventDef.name} (${found.length})`);
    }
  }

  // Show any non-standard ecommerce-like events we captured
  const allCapturedNames = new Set(capturedEvents.map((e) => e.name).filter(Boolean));
  const knownNames = new Set(GA4_ECOMMERCE_EVENTS.map((e) => e.name));
  const nonStandard = [...allCapturedNames].filter(
    (n) => !knownNames.has(n) && n !== "page_view" && n !== "scroll" && n !== "user_engagement",
  );
  if (nonStandard.length > 0) {
    console.log(`\n  Non-standard/custom events detected:`);
    for (const name of nonStandard) {
      const count = capturedEvents.filter((e) => e.name === name).length;
      console.log(`  ⚠️  ${name} (${count})`);
    }
  }
  console.log("");
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  const { model } = getStagehandModelConfig();
  const mode = passive ? "Phase A (passive)" : "Phase B (AI funnel walk)";

  console.log(`\n🔍 GA4 Audit CLI`);
  console.log(`📍 Target: ${url}`);
  console.log(`🖥️  Mode: ${headed ? "headed" : "headless"}`);
  console.log(`🤖 AI model: ${model}`);
  console.log(`🔧 Phase: ${mode}\n`);

  if (passive) {
    await runPassive();
    printResults();
  } else {
    if (!process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY && !process.env.GEMINI_API_KEY && !process.env.OPENROUTER_API_KEY) {
      console.error("❌ Phase B requires an API key. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY, or OPENROUTER_API_KEY.");
      console.error("   Or run with --passive for Phase A (no API key needed).");
      process.exit(1);
    }
    const steps = await runFunnel();
    printResults(steps);
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
