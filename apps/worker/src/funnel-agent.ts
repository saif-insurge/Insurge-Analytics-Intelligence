/**
 * Agent-based funnel walker using Stagehand's agent API.
 * Replaces the brittle step-by-step approach with an autonomous agent
 * that adapts to each site's navigation patterns.
 */

import { Stagehand, tool } from "@browserbasehq/stagehand";
import { z } from "zod";
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
- From the cart (page or drawer), click "Checkout", "Proceed to Checkout", or "Go to Checkout".
- If no checkout button visible, try scrolling or clicking the cart icon again.
- You should reach a page collecting shipping/payment info.
- Call getEvents to check if begin_checkout event fired.
- STOP HERE. Do NOT fill forms or click payment buttons.
- Call logStep with pageName="checkout"

═══ CRITICAL RULES ═══
1. NEVER click "Place Order", "Complete Purchase", "Pay Now", "Submit Order", "Confirm and Pay"
2. NEVER give up early — complete ALL 6 steps even if some seem to fail
3. Call logStep at least 6 times (once per step)
4. Call getEvents after EVERY interaction (ATC clicks, cart open, checkout) to verify events
5. In your observation, mention which GA4 events you saw fire (from getEvents)
6. If a popup/banner appears, dismiss it first
7. A cart drawer opening is a SUCCESS even if the URL doesn't change
8. If something fails, try a different approach before moving on`;

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
  /** Live reference to captured events — agent can read these via getEvents tool. */
  capturedEvents?: Array<{ name: string; items: unknown[]; capturedAt: string }>,
): Promise<{ agentResult: FunnelAgentResult | null; stepLogs: FunnelStepLog[] }> {
  const stepLogs: FunnelStepLog[] = [];
  let stepCounter = 0;
  let lastEventCheckCount = 0;

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
          "Check what GA4 events have been captured so far. Call this AFTER performing an action " +
          "(like clicking Add to Cart) to verify whether the expected GA4 event actually fired. " +
          "Returns events captured since your last check, plus a summary of all events.",
        inputSchema: z.object({
          context: z.string().describe("What you just did and what event you expect (e.g., 'clicked ATC, expecting add_to_cart event')"),
        }),
        execute: async (input) => {
          const events = capturedEvents ?? [];
          const newEvents = events.slice(lastEventCheckCount);
          lastEventCheckCount = events.length;

          // Summarize by event name
          const summary: Record<string, EventSummary> = {};
          for (const e of events) {
            if (!e.name) continue;
            const existing = summary[e.name];
            if (existing) {
              existing.count++;
              existing.latestTimestamp = e.capturedAt;
              if (e.items.length > 0) existing.hasItems = true;
            } else {
              summary[e.name] = {
                name: e.name,
                count: 1,
                hasItems: e.items.length > 0,
                latestTimestamp: e.capturedAt,
              };
            }
          }

          const newEventNames = newEvents.filter((e) => e.name).map((e) => e.name);
          console.log(`  [Events] Check after: "${input.context}" — ${newEvents.length} new events: ${newEventNames.join(", ") || "none"}`);

          return {
            totalEventsCaptured: events.length,
            newSinceLastCheck: newEvents.length,
            newEventNames,
            allEventsSummary: Object.values(summary),
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
