/**
 * Agent-based funnel walker using Stagehand's agent API.
 * Replaces the brittle step-by-step approach with an autonomous agent
 * that adapts to each site's navigation patterns.
 */

import { Stagehand, tool } from "@browserbasehq/stagehand";
import { z } from "zod";
import { detectAnalyticsPlatforms, isGa4Endpoint, parseGa4Request } from "@ga4-audit/audit-core";
import type { FunnelStepLog } from "./audit-runner.js";
import type { HarEntry } from "./har-capture.js";
import { getStagehandModelConfig } from "./stagehand-config.js";

const SYSTEM_PROMPT = `You are an ecommerce GA4 tracking auditor. Your job is to walk through an ecommerce website's shopping funnel, perform interactions, and verify which GA4 events fire.

You have FOUR tools:
- logStep: Call after each major step to record what you did
- getEvents: Call after interactions (like clicking Add to Cart) to check which GA4 events fired
- checkUrl: Call after clicking a product link to verify you actually navigated to a new page
- verifyCartChange: Call AFTER clicking Add to Cart to verify the item was actually added. Returns cart badge count and whether a cart drawer is visible. If it shows no change, your click missed — try again.

═══ YOUR MISSION ═══
Visit every page in the funnel. On pages where product cards or add-to-cart buttons are visible, test the interaction and then call getEvents to see what fired.

═══ STEP 1: HOME PAGE ═══
- You start here. Scroll down to see the page content.
- If you see product cards with add-to-cart/quick-add buttons, click one to test, then call getEvents.
- Call logStep with pageName="home"

═══ STEP 2: CATEGORY PAGE ═══
- Navigate via the TOP NAVIGATION MENU (not footer) — click "Shop", "Shop All", "Collections", etc.
- Wait for the page to load. You should see a grid/list of product cards.
- IMPORTANT: Call logStep IMMEDIATELY after landing on the category page, BEFORE clicking any product.
- Call logStep with pageName="category"

═══ STEP 3: PRODUCT DETAIL PAGE (PDP) ═══
- From the category page, click on a PRODUCT NAME or PRODUCT IMAGE to navigate to the PDP.
- WARNING: Do NOT click color swatches, variant radio buttons, or quick-add buttons on the product CARD.
  These look like product links but they don't navigate — they just change the selected variant.
  Click the actual PRODUCT NAME TEXT or the main PRODUCT IMAGE.
- After clicking, call checkUrl to verify the URL actually changed. If the URL is still the
  collections/category page, your click hit a variant selector — try again with a different element.
- The PDP URL usually contains /products/ or /product/ or the product name in the path.
- You should see one product with full details, images, price, and an Add to Cart button.
- IMPORTANT: Call logStep IMMEDIATELY after landing on the PDP, BEFORE any interactions.
- Call logStep with pageName="product"

═══ STEP 4: ADD TO CART ON PDP ═══
- If there are size/color/variant selectors, pick the first available option.
- Click the "Add to Cart" or "Add to Bag" button.
- IMMEDIATELY call verifyCartChange to confirm the click actually worked.
  The tool checks for cart badge changes and cart drawer visibility.
- If verifyCartChange shows cartChanged=false:
  → Your click MISSED. The button may need a variant selected first, or you clicked the wrong element.
  → Try selecting a size/color/variant first, then click ATC again, then call verifyCartChange again.
  → Retry up to 3 times with different approaches before giving up.
- Once verifyCartChange confirms cartChanged=true:
  → Call getEvents with waitForNewEvents=true to check if add_to_cart event fired.
- Call logStep with pageName="add_to_cart" — set success based on verifyCartChange, not your assumption.

═══ STEP 4B: BUY NOW TEST ON PDP ═══
- After the ATC test, check if there is a "Buy Now", "Order Now", or "Buy It Now" button on the PDP.
- If such a button exists, click it. This button may:
  a) Navigate directly to a checkout page
  b) Open a payment modal/drawer (Razorpay, Stripe, etc.)
  c) Fire begin_checkout or InitiateCheckout events
- Call getEvents with waitForNewEvents=true to check if begin_checkout fired in GA4 and
  InitiateCheckout in Meta Pixel. The tool will automatically wait and retry for slow GTM events.
- Note what happened in your observation.
- If a payment modal opened, close it or press back/escape before continuing.
- Call logStep with pageName="buy_now_test"

═══ STEP 5: VIEW CART ═══
- If a cart drawer already opened after Step 4 (ATC), you are already viewing the cart.
  In that case, call getEvents with waitForNewEvents=true to check for view_cart event
  (this also catches delayed add_to_cart events from Step 4). Note cartType="drawer", and call logStep.
- If no cart drawer opened:
  1. First, SCROLL TO THE TOP of the page so the header navigation is visible.
  2. Look for the cart element in the header. It may be labeled as:
     - "Cart", "Bag", "Basket", or just a bag/shopping cart icon
     - It might show a number badge (e.g., "1" or "2") indicating items
     - It could be an SVG icon, a link, or a button — try all of these
  3. If you can't find it by label, try scrolling to top and reading the full aria tree
  4. Do NOT navigate directly to /cart — use the site's own cart button
- After opening the cart (page or drawer):
  - Note cartType="page" if URL changed, cartType="drawer" if it opened on the same page
  - Cart showing 0 items is an observation, NOT a failure. Mark success=true.
  - Call getEvents with waitForNewEvents=true to check if view_cart event fired.
- Call logStep with pageName="cart"

═══ STEP 6: CHECKOUT ═══
- From the cart (page or drawer), find the CHECKOUT button.
- IMPORTANT: The checkout button is NOT the "Add to Cart" button. Look specifically for text like:
  "Checkout", "Proceed to Checkout", "Go to Checkout", "Secure Checkout", "Check Out"
- The checkout button is typically at the BOTTOM of the cart, below the item list and total.
- Click the checkout button. Call getEvents with waitForNewEvents=true to check if begin_checkout fired.
  The tool will automatically wait and retry for slow GTM events.
- NOTE: begin_checkout may fire on the button CLICK itself (before any page navigation).
  After clicking checkout, ANY of these outcomes is valid — mark success=true for all:
  a) Navigated to a /checkout page with shipping/payment forms
  b) A checkout modal or payment drawer opened on the same page (e.g., Razorpay, Stripe, PayPal)
  c) Redirected to a login/signup page before checkout
  d) Redirected to a third-party payment page (e.g., Shopify checkout, PayU, etc.)
  e) The page stayed the same but begin_checkout event fired (check getEvents)
  All of these count as "reached checkout" — the key is that begin_checkout event fires.
- STOP HERE. Do NOT fill forms or click payment buttons.
- Call logStep with pageName="checkout"

═══ CRITICAL RULES ═══
1. NEVER click "Place Order", "Complete Purchase", "Pay Now", "Submit Order", "Confirm and Pay"
2. NEVER give up early — complete ALL 6 steps even if some seem to fail
3. Call logStep at least 6 times (once per step)
4. Call getEvents after EVERY interaction (ATC clicks, cart open, checkout) to verify events
5. In your observation, mention which GA4 events AND ad pixel events you saw fire (from getEvents)
6. If a popup/banner appears, dismiss it first
7. A cart drawer opening is a SUCCESS even if the URL doesn't change
8. If something fails, try a different approach before moving on
9. On the cart page, do NOT click "Add to Cart" again — find the CHECKOUT button instead
10. Do NOT navigate directly to URLs like /cart or /checkout — always use the site's own buttons and links
11. If you can't find the cart icon, scroll to the very TOP of the page first — the header may be out of view`;

const stepLogSchema = z.object({
  pageName: z.string().describe("Which page: home, category, product, add_to_cart, buy_now_test, cart, or checkout"),
  action: z.string().describe("What you did on this page"),
  observation: z.string().describe("What you observed (page content, buttons found, events expected)"),
  currentUrl: z.string().describe("The current page URL"),
  success: z.boolean().describe("Whether the action succeeded"),
  error: z.string().optional().describe("Error description if the action failed"),
});

const auditResultSchema = z.object({
  pagesVisited: z.array(z.object({
    page: z.enum(["home", "category", "product", "cart", "checkout"]),
    url: z.string().describe("URL of this page"),
    visited: z.boolean().describe("Whether this page was successfully visited"),
    observations: z.string().describe("What was observed on this page"),
  })),
  actionsPerformed: z.array(z.object({
    action: z.enum(["variant_select", "add_to_cart", "buy_now", "view_cart", "begin_checkout"]),
    success: z.boolean(),
    page: z.string().describe("Which page this action was performed on"),
    details: z.string().describe("Details about the action"),
  })),
  cartType: z.enum(["page", "drawer", "unknown"]).describe("Whether the cart is a separate page or a slide-out drawer"),
  reachedCheckout: z.boolean().describe("Whether the checkout page was reached"),
  issues: z.array(z.string()).describe("Any issues encountered during the walkthrough"),
});

export type FunnelAgentResult = z.infer<typeof auditResultSchema>;

/** Captured event summary for the agent to inspect. */
type EventSummary = {
  name: string;
  count: number;
  hasItems: boolean;
  latestTimestamp: string;
};

/** Run the funnel walk using Stagehand's agent API. */
export async function runFunnelAgent(
  stagehand: Stagehand,
  siteUrl: string,
  /** Live reference to HAR entries — parsed for GA4 events on demand. */
  harEntries?: HarEntry[],
  /** Live reference to ALL network request URLs (for ad pixel detection). */
  allRequestUrls?: string[],
): Promise<{ agentResult: FunnelAgentResult | null; stepLogs: FunnelStepLog[] }> {
  const stepLogs: FunnelStepLog[] = [];
  let stepCounter = 0;
  let lastHarCheckIndex = 0;
  let lastUrlCheckCount = 0;

  const { model, clientOptions } = getStagehandModelConfig();

  const agent = stagehand.agent({
    model: clientOptions ? { modelName: model, ...clientOptions } : model,
    mode: "hybrid",
    systemPrompt: SYSTEM_PROMPT,
    tools: {
      logStep: tool({
        description: "Log a step you just performed. Call this after every major action (navigating to a page, clicking a button, etc.)",
        inputSchema: stepLogSchema,
        execute: async (input) => {
          stepCounter++;
          // Read the REAL URL from the browser, not the agent's self-reported one
          const page = stagehand.context.pages()[0];
          const actualUrl = page ? await page.url() : input.currentUrl;

          stepLogs.push({
            step: stepCounter,
            name: input.pageName,
            instruction: input.action,
            observation: input.observation,
            urlBefore: actualUrl,
            urlAfter: actualUrl,
            success: input.success,
            error: input.error,
            eventsCaptureDuringStep: 0,
            timestamp: new Date().toISOString(),
            durationMs: 0,
          });
          console.log(`  [Agent Step ${stepCounter}] ${input.pageName}: ${input.action} (${input.success ? "✓" : "✗"}) [${actualUrl}]`);
          if (input.observation) console.log(`    → ${input.observation}`);
          return { logged: true, stepNumber: stepCounter, actualUrl };
        },
      }),
      getEvents: tool({
        description:
          "Check what tracking events have been captured. Returns GA4 events AND ad pixel activity " +
          "(Meta Pixel, Google Ads, TikTok, Snapchat, etc.). Call this AFTER performing an action " +
          "to verify which platforms received the event. Set waitForNewEvents=true after ATC, " +
          "Buy Now, cart open, and checkout clicks — the tool will automatically retry if no " +
          "new events appear (GTM events can take several seconds to fire).",
        inputSchema: z.object({
          context: z.string().describe("What you just did and what you expect (e.g., 'clicked ATC, expecting add_to_cart in GA4 and AddToCart in Meta Pixel')"),
          waitForNewEvents: z.boolean().optional().describe("If true, automatically waits and retries (up to 6s) when no new GA4 events are found. Use after ATC, Buy Now, cart open, and checkout clicks."),
        }),
        execute: async (input) => {
          const checkpointHarIndex = lastHarCheckIndex;
          const checkpointUrlCount = lastUrlCheckCount;

          /** Parse GA4 events from HAR entries on demand — no route interception needed. */
          const collectResults = () => {
            const entries = harEntries ?? [];
            // Parse GA4 events from ALL HAR entries (cumulative)
            const allParsed: { name: string; hasItems: boolean; timestamp: string }[] = [];
            for (const entry of entries) {
              if (!isGa4Endpoint(entry.url)) continue;
              const parsed = parseGa4Request(entry.url, entry.postData);
              for (const evt of parsed) {
                allParsed.push({
                  name: evt.name,
                  hasItems: (evt.items?.length ?? 0) > 0,
                  timestamp: entry.timestamp,
                });
              }
            }

            // New events = those from HAR entries added since last check
            const newEntries = entries.slice(checkpointHarIndex);
            const newParsed: { name: string; hasItems: boolean; timestamp: string }[] = [];
            for (const entry of newEntries) {
              if (!isGa4Endpoint(entry.url)) continue;
              const parsed = parseGa4Request(entry.url, entry.postData);
              for (const evt of parsed) {
                newParsed.push({
                  name: evt.name,
                  hasItems: (evt.items?.length ?? 0) > 0,
                  timestamp: entry.timestamp,
                });
              }
            }
            lastHarCheckIndex = entries.length;

            // Build summary from all events
            const ga4Summary: Record<string, EventSummary> = {};
            for (const e of allParsed) {
              if (!e.name) continue;
              const existing = ga4Summary[e.name];
              if (existing) {
                existing.count++;
                existing.latestTimestamp = e.timestamp;
                if (e.hasItems) existing.hasItems = true;
              } else {
                ga4Summary[e.name] = {
                  name: e.name,
                  count: 1,
                  hasItems: e.hasItems,
                  latestTimestamp: e.timestamp,
                };
              }
            }

            // Ad pixels from new network requests
            const urls = allRequestUrls ?? [];
            const newUrls = urls.slice(checkpointUrlCount);
            lastUrlCheckCount = urls.length;

            const newPlatforms = detectAnalyticsPlatforms(newUrls);
            const focusPlatforms = newPlatforms.filter((p) =>
              ["Meta Pixel", "Google Ads", "TikTok Pixel", "Snapchat Pixel", "Pinterest Tag", "Twitter/X Pixel"].includes(p.name),
            );

            return { totalEvents: allParsed.length, newEvents: newParsed, ga4Summary, focusPlatforms };
          };

          let { totalEvents, newEvents, ga4Summary, focusPlatforms } = collectResults();

          // Auto-retry: if waitForNewEvents is set and no new GA4 events found, wait and recheck
          if (input.waitForNewEvents && newEvents.length === 0) {
            for (let retry = 1; retry <= 2; retry++) {
              console.log(`  [Events] No new events yet, waiting 3s (retry ${retry}/2)...`);
              await new Promise((r) => setTimeout(r, 3000));
              const retryResult = collectResults();
              totalEvents = retryResult.totalEvents;
              newEvents = retryResult.newEvents;
              ga4Summary = retryResult.ga4Summary;
              focusPlatforms = retryResult.focusPlatforms;
              if (newEvents.length > 0) break;
            }
          }

          const newGa4Names = newEvents.filter((e) => e.name).map((e) => e.name);
          const newPixelSummary = focusPlatforms.map((p) =>
            `${p.name}: ${p.requestCount} req${p.detectedEvents.length > 0 ? ` (${p.detectedEvents.join(", ")})` : ""}`,
          );

          console.log(`  [Events] "${input.context}"`);
          console.log(`    GA4: ${newGa4Names.join(", ") || "none"}`);
          if (newPixelSummary.length > 0) console.log(`    Pixels: ${newPixelSummary.join(", ")}`);

          return {
            ga4: {
              totalCaptured: totalEvents,
              newSinceLastCheck: newEvents.length,
              newEventNames: newGa4Names,
              allEvents: Object.values(ga4Summary),
            },
            adPixels: {
              newActivity: focusPlatforms.map((p) => ({
                platform: p.name,
                requests: p.requestCount,
                events: p.detectedEvents,
              })),
            },
          };
        },
      }),
      checkUrl: tool({
        description:
          "Check the ACTUAL current browser URL. Call this after clicking a product link " +
          "to verify you actually navigated to a new page. If the URL didn't change, " +
          "your click probably hit a variant selector instead of the product link.",
        inputSchema: z.object({
          expectedChange: z.string().describe("What you expected to happen, e.g., 'navigate to product detail page'"),
        }),
        execute: async (input) => {
          const pg = stagehand.context.pages()[0];
          const currentUrl = pg ? await pg.url() : "unknown";
          console.log(`  [URL Check] Expected: ${input.expectedChange} → Actual: ${currentUrl}`);
          return { currentUrl };
        },
      }),
      verifyCartChange: tool({
        description:
          "Verify that an Add to Cart click actually worked. Checks the page for concrete " +
          "evidence: cart badge/icon count, cart drawer visibility, and cart-related text. " +
          "Call this IMMEDIATELY after clicking ATC. If cartChanged is false, your click missed — retry.",
        inputSchema: z.object({
          attemptNumber: z.number().describe("Which ATC attempt this is (1, 2, or 3)"),
        }),
        execute: async (input) => {
          const pg = stagehand.context.pages()[0];
          if (!pg) return { cartChanged: false, evidence: "no page found" };

          // Wait a moment for cart UI to update
          await new Promise((r) => setTimeout(r, 2000));

          // Run JS in the browser page to check for cart evidence
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const evidence = await (pg as any).evaluate(`(() => {
            const results = [];

            const badgeSelectors = [
              '[data-cart-count]', '.cart-count', '.cart-badge', '.cart-quantity',
              '.header-cart-count', '.cart-item-count', '.cart-number',
              '.mini-cart-count', '.bag-count', '.basket-count',
              '[class*="cart"] [class*="count"]', '[class*="cart"] [class*="badge"]',
              '[class*="bag"] [class*="count"]', '[class*="bag"] [class*="badge"]',
              '[aria-label*="cart" i] span', '[aria-label*="bag" i] span',
            ];
            for (const sel of badgeSelectors) {
              const els = document.querySelectorAll(sel);
              els.forEach(el => {
                const text = el.textContent?.trim();
                if (text && /^\\d+$/.test(text) && parseInt(text) > 0) {
                  results.push('badge: "' + text + '" (' + sel + ')');
                }
              });
            }

            const drawerSelectors = [
              '[class*="cart-drawer"]', '[class*="cart-sidebar"]', '[class*="cart-slide"]',
              '[class*="mini-cart"]', '[class*="minicart"]', '[class*="side-cart"]',
              '[class*="drawer"][class*="cart"]', '[class*="drawer"][class*="open"]',
              '[id*="cart-drawer"]', '[id*="mini-cart"]', '[id*="minicart"]',
              '[data-cart-drawer]', '[data-mini-cart]',
            ];
            for (const sel of drawerSelectors) {
              const els = document.querySelectorAll(sel);
              els.forEach(el => {
                const style = window.getComputedStyle(el);
                const isVisible = style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity) > 0;
                if (isVisible && el.offsetHeight > 50) {
                  results.push('drawer visible (' + sel + ')');
                }
              });
            }

            const bodyText = document.body.innerText.toLowerCase();
            const confirmPhrases = ['added to cart', 'added to bag', 'item added', 'added to basket', 'added successfully'];
            for (const phrase of confirmPhrases) {
              if (bodyText.includes(phrase)) {
                results.push('confirmation text: "' + phrase + '"');
              }
            }

            return results;
          })()`) as string[];

          const cartChanged = evidence.length > 0;
          const summary = cartChanged ? evidence.join('; ') : 'no cart change detected';

          console.log(`  [Cart Verify] Attempt ${input.attemptNumber}: ${cartChanged ? '✓' : '✗'} — ${summary}`);

          return { cartChanged, evidence: summary, attemptNumber: input.attemptNumber };
        },
      }),
    },
  });

  const page = stagehand.context.pages()[0]!;
  await page.goto(siteUrl, { waitUntil: "networkidle", timeoutMs: 30000 }).catch(() => {});
  // Give Web Pixels sandbox iframe + GTM time to bootstrap and fire initial events.
  // Shopify Web Pixels in particular needs ~5-8s before view_item/page_view fire from sandbox.
  await page.waitForTimeout(5000);

  try {
    const result = await agent.execute({
      instruction:
        `You are auditing ${siteUrl}. Complete ALL steps of the ecommerce funnel walkthrough:\n\n` +
        `1. HOME PAGE — observe the homepage (you're already here). Call logStep.\n` +
        `2. CATEGORY PAGE — navigate to a product listing via the top nav. Call logStep.\n` +
        `3. PRODUCT PAGE — click a product name/image to visit the PDP. Call logStep.\n` +
        `4. ADD TO CART — select a variant if needed, click ATC, call getEvents(waitForNewEvents=true). Call logStep.\n` +
        `4B. BUY NOW TEST — if a "Buy Now" button exists on PDP, click it, call getEvents(waitForNewEvents=true), then go back. Call logStep.\n` +
        `5. VIEW CART — if cart drawer opened after ATC use that, otherwise click cart icon. Call getEvents(waitForNewEvents=true). Call logStep.\n` +
        `6. CHECKOUT — from cart, click Checkout button (NOT ATC), call getEvents(waitForNewEvents=true). Call logStep.\n\n` +
        `Call logStep after each step. Call getEvents(waitForNewEvents=true) after every interaction (ATC, Buy Now, cart open, checkout).\n` +
        `Do NOT stop early. If a step fails, try another approach.\n` +
        `NEVER click Place Order or Pay Now — STOP at the checkout page.`,
      maxSteps: 45,
      output: auditResultSchema,
    });

    return {
      agentResult: (result.output as FunnelAgentResult) ?? null,
      stepLogs,
    };
  } catch (err) {
    console.error("Agent execution failed:", err);
    return {
      agentResult: null,
      stepLogs,
    };
  }
}
