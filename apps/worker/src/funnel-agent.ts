/**
 * Agent-based funnel walker using Stagehand's agent API.
 * Replaces the brittle step-by-step approach with an autonomous agent
 * that adapts to each site's navigation patterns.
 */

import { Stagehand, tool } from "@browserbasehq/stagehand";
import { z } from "zod";
import type { FunnelStepLog } from "./audit-runner.js";

const SYSTEM_PROMPT = `You are an ecommerce GA4 tracking auditor. Your job is to walk through an ecommerce website's shopping funnel to trigger GA4 tracking events. You must be PERSISTENT and NEVER give up — complete ALL steps even if individual actions seem to fail.

You MUST visit these pages in this order and call logStep after EACH page/action:

═══ STEP 1: HOME PAGE ═══
- You start here after page loads
- Scroll down to see product listings and promotions
- Call logStep with pageName="home"

═══ STEP 2: CATEGORY PAGE ═══
- Click a product category link in the TOP NAVIGATION MENU (not footer)
- Look for: "Shop", "Shop All", "Collections", "Men", "Women", "All Products", or any category name
- You should see a grid/list of multiple product cards
- Call logStep with pageName="category"

═══ STEP 3: PRODUCT DETAIL PAGE (PDP) ═══
- From the category page, click on a PRODUCT NAME or PRODUCT IMAGE
- Do NOT click quick-add buttons, wishlist icons, or color swatches
- The URL MUST change to a new page showing one product with full details
- Call logStep with pageName="product"

═══ STEP 4: ADD TO CART ═══
- On the PDP, if there are size/color/variant selectors, pick the first available option
- Click the "Add to Cart" or "Add to Bag" button
- Wait 2 seconds for the site to process
- A cart badge, notification, or drawer may appear — this confirms success
- Even if you don't see visual confirmation, the add-to-cart event may have fired
- Call logStep with pageName="add_to_cart"

═══ STEP 5: VIEW CART ═══
- Click the cart icon/link in the site HEADER (usually top-right, may show item count/badge)
- This will EITHER navigate to a /cart page OR open a cart drawer/sidebar on the current page
- BOTH are valid — a cart drawer opening IS a successful cart view even if the URL doesn't change
- If a drawer opens, note it as cartType="drawer". If you navigated to a /cart URL, note cartType="page"
- If the cart shows 0 items, that's an observation to note, NOT a failure — mark success=true and note "cart showed 0 items" in the observation
- Call logStep with pageName="cart" and success=true as long as the cart was visible (drawer or page)

═══ STEP 6: CHECKOUT ═══
- From the cart page or cart drawer, find and click "Checkout", "Proceed to Checkout", or "Go to Checkout"
- If you can't find a checkout button in the cart, try clicking the cart icon again and look for checkout
- You MUST reach a page where shipping address or payment details are collected
- STOP HERE — do not fill any forms or click any payment buttons
- Call logStep with pageName="checkout"

═══ CRITICAL RULES ═══
1. NEVER click "Place Order", "Complete Purchase", "Pay Now", "Submit Order", "Confirm and Pay"
2. NEVER give up early. Complete ALL 6 steps even if some actions seem to fail.
3. If something doesn't work, try a different approach (different button, scroll more, use navigation)
4. Call logStep after EVERY step — you should have at least 6 logStep calls total
5. If a popup/banner/cookie consent appears, dismiss it before continuing
6. The cart icon in the header may show a badge with the number of items — this confirms ATC worked even if no popup appeared`;

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

/** Run the funnel walk using Stagehand's agent API. */
export async function runFunnelAgent(
  stagehand: Stagehand,
  siteUrl: string,
): Promise<{ agentResult: FunnelAgentResult | null; stepLogs: FunnelStepLog[] }> {
  const stepLogs: FunnelStepLog[] = [];
  let stepCounter = 0;

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
