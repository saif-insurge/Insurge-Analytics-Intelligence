/**
 * Agent-based funnel walker using Stagehand's agent API.
 * Replaces the brittle step-by-step approach with an autonomous agent
 * that adapts to each site's navigation patterns.
 */

import { Stagehand, tool } from "@browserbasehq/stagehand";
import { z } from "zod";
import { detectAnalyticsPlatforms } from "@ga4-audit/audit-core";
import type { FunnelStepLog } from "./audit-runner.js";

const SYSTEM_PROMPT = `You are an ecommerce GA4 tracking auditor. Your job is to walk through an ecommerce website's shopping funnel, perform interactions, and verify which GA4 events fire.

You have TWO tools:
- logStep: Call after each major step to record what you did
- getEvents: Call after interactions (like clicking Add to Cart) to check which GA4 events fired

═══ YOUR MISSION ═══
Visit every page in the funnel. On pages where product cards or add-to-cart buttons are visible, test the interaction and then call getEvents to see what fired.

═══ STEP 1: HOME PAGE ═══
- You start here. Scroll down to see the page content.
- If you see product cards with add-to-cart/quick-add buttons, click one to test, then call getEvents.
- Call logStep with pageName="home"

═══ STEP 2: CATEGORY PAGE ═══
- Navigate via the TOP NAVIGATION MENU (not footer) — click "Shop", "Shop All", "Collections", etc.
- You should see a grid/list of product cards.
- If quick-add/add-to-cart buttons are visible on product cards, click one to test, then call getEvents.
- Call logStep with pageName="category"

═══ STEP 3: PRODUCT DETAIL PAGE (PDP) ═══
- Click on a PRODUCT NAME or PRODUCT IMAGE (not quick-add) to navigate to the PDP.
- The URL MUST change. You should see one product with full details, images, price, and ATC button.
- Call logStep with pageName="product"

═══ STEP 4: ADD TO CART ON PDP ═══
- If there are size/color/variant selectors, pick the first available option.
- Click the "Add to Cart" or "Add to Bag" button.
- Wait 2 seconds, then call getEvents to check if add_to_cart event fired.
- Note in your observation what the getEvents tool returned.
- Call logStep with pageName="add_to_cart"

═══ STEP 5: VIEW CART ═══
- Click the cart icon/button in the site HEADER (usually top-right corner).
- This will EITHER navigate to a /cart page OR open a cart drawer/sidebar.
- BOTH are valid — a drawer opening IS a successful cart view (success=true).
- If a drawer opens, note cartType="drawer". If navigated to /cart, note cartType="page".
- Cart showing 0 items is an observation, NOT a failure. Mark success=true.
- Call getEvents to check if view_cart event fired.
- Call logStep with pageName="cart"

═══ STEP 6: CHECKOUT ═══
- From the cart (page or drawer), find the CHECKOUT button.
- IMPORTANT: The checkout button is NOT the "Add to Cart" button. Look specifically for text like:
  "Checkout", "Proceed to Checkout", "Go to Checkout", "Secure Checkout", "Check Out"
- The checkout button is typically at the BOTTOM of the cart, below the item list and total.
- Click the checkout button. Then call getEvents to check if begin_checkout fired.
- NOTE: begin_checkout may fire on the button CLICK itself (before any page navigation).
  Some sites don't have a separate checkout page — the begin_checkout event fires when the
  checkout button is clicked, even if it opens a modal or redirects to a third-party payment page.
- If the checkout button takes you to a login page or address form, that counts as reaching checkout.
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
9. On the cart page, do NOT click "Add to Cart" again — find the CHECKOUT button instead`;

const stepLogSchema = z.object({
  pageName: z.string().describe("Which page: home, category, product, cart, or checkout"),
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
    action: z.enum(["variant_select", "add_to_cart", "view_cart", "begin_checkout"]),
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
  /** Live reference to captured GA4 events. */
  capturedEvents?: Array<{ name: string; items: unknown[]; capturedAt: string }>,
  /** Live reference to ALL network request URLs (for ad pixel detection). */
  allRequestUrls?: string[],
): Promise<{ agentResult: FunnelAgentResult | null; stepLogs: FunnelStepLog[] }> {
  const stepLogs: FunnelStepLog[] = [];
  let stepCounter = 0;
  let lastEventCheckCount = 0;
  let lastUrlCheckCount = 0;

  const agent = stagehand.agent({
    model: process.env.STAGEHAND_MODEL || "openai/gpt-4.1-mini",
    systemPrompt: SYSTEM_PROMPT,
    tools: {
      logStep: tool({
        description: "Log a step you just performed. Call this after every major action (navigating to a page, clicking a button, etc.)",
        inputSchema: stepLogSchema,
        execute: async (input) => {
          stepCounter++;
          stepLogs.push({
            step: stepCounter,
            name: input.pageName,
            instruction: input.action,
            observation: input.observation,
            urlBefore: input.currentUrl,
            urlAfter: input.currentUrl,
            success: input.success,
            error: input.error,
            eventsCaptureDuringStep: 0,
            timestamp: new Date().toISOString(),
            durationMs: 0,
          });
          console.log(`  [Agent Step ${stepCounter}] ${input.pageName}: ${input.action} (${input.success ? "✓" : "✗"})`);
          if (input.observation) console.log(`    → ${input.observation}`);
          return { logged: true, stepNumber: stepCounter };
        },
      }),
      getEvents: tool({
        description:
          "Check what tracking events have been captured. Returns GA4 events AND ad pixel activity " +
          "(Meta Pixel, Google Ads, TikTok, Snapchat, etc.). Call this AFTER performing an action " +
          "to verify which platforms received the event. Focus on: GA4 events, Meta Pixel events, and Google Ads conversions.",
        inputSchema: z.object({
          context: z.string().describe("What you just did and what you expect (e.g., 'clicked ATC, expecting add_to_cart in GA4 and AddToCart in Meta Pixel')"),
        }),
        execute: async (input) => {
          // GA4 events
          const events = capturedEvents ?? [];
          const newEvents = events.slice(lastEventCheckCount);
          lastEventCheckCount = events.length;

          const ga4Summary: Record<string, EventSummary> = {};
          for (const e of events) {
            if (!e.name) continue;
            const existing = ga4Summary[e.name];
            if (existing) {
              existing.count++;
              existing.latestTimestamp = e.capturedAt;
              if (e.items.length > 0) existing.hasItems = true;
            } else {
              ga4Summary[e.name] = {
                name: e.name,
                count: 1,
                hasItems: e.items.length > 0,
                latestTimestamp: e.capturedAt,
              };
            }
          }

          // Ad pixels — detect from new network requests since last check
          const urls = allRequestUrls ?? [];
          const newUrls = urls.slice(lastUrlCheckCount);
          lastUrlCheckCount = urls.length;

          const newPlatforms = detectAnalyticsPlatforms(newUrls);
          // Focus on the key platforms
          const focusPlatforms = newPlatforms.filter((p) =>
            ["Meta Pixel", "Google Ads", "TikTok Pixel", "Snapchat Pixel", "Pinterest Tag", "Twitter/X Pixel"].includes(p.name),
          );

          const newGa4Names = newEvents.filter((e) => e.name).map((e) => e.name);
          const newPixelSummary = focusPlatforms.map((p) =>
            `${p.name}: ${p.requestCount} req${p.detectedEvents.length > 0 ? ` (${p.detectedEvents.join(", ")})` : ""}`,
          );

          console.log(`  [Events] "${input.context}"`);
          console.log(`    GA4: ${newGa4Names.join(", ") || "none"}`);
          if (newPixelSummary.length > 0) console.log(`    Pixels: ${newPixelSummary.join(", ")}`);

          return {
            ga4: {
              totalCaptured: events.length,
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
    },
  });

  const page = stagehand.context.pages()[0]!;
  await page.goto(siteUrl, { waitUntil: "networkidle", timeoutMs: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);

  try {
    const result = await agent.execute({
      instruction:
        `You are auditing ${siteUrl}. Complete ALL 6 steps of the ecommerce funnel walkthrough:\n\n` +
        `1. HOME PAGE — observe the homepage (you're already here). Call logStep.\n` +
        `2. CATEGORY PAGE — navigate to a product listing via the top navigation menu. Call logStep.\n` +
        `3. PRODUCT PAGE — click a product name/image to visit the PDP. Call logStep.\n` +
        `4. ADD TO CART — select a variant if needed, then click Add to Cart. Call logStep.\n` +
        `5. VIEW CART — click the cart icon in the header to see the cart. Call logStep.\n` +
        `6. CHECKOUT — click the Checkout button to reach the payment page. Call logStep.\n\n` +
        `You MUST call logStep exactly 6 times, once per step. ` +
        `Do NOT stop early. Even if a step seems to fail, proceed to the next step. ` +
        `If the cart looks empty after ATC, still try to navigate to checkout. ` +
        `NEVER click Place Order or Pay Now — STOP at the checkout page.`,
      maxSteps: 40,
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
