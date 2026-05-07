/**
 * Agent-based funnel walker using Stagehand's agent API.
 * Replaces the brittle step-by-step approach with an autonomous agent
 * that adapts to each site's navigation patterns.
 */

import { Stagehand, tool } from "@browserbasehq/stagehand";
import { z } from "zod";
import type { FunnelStepLog } from "./audit-runner.js";

const SYSTEM_PROMPT = `You are an ecommerce GA4 tracking auditor. Your job is to walk through an ecommerce website's shopping funnel to trigger GA4 tracking events.

You MUST visit these pages in this order, and perform specific actions on each:

1. HOME PAGE - You start here. Scroll down to see product listings. Note what's on the page.

2. CATEGORY/COLLECTION PAGE - Navigate using the site's main navigation menu. Click on a link like "Shop", "Collections", "Shop All", "Men", "Women", or any product category. You should see a grid/list of multiple products.

3. PRODUCT DETAIL PAGE (PDP) - From the category page, click on a PRODUCT NAME or PRODUCT IMAGE (not a quick-add button) to navigate to the product's detail page. You MUST see the URL change to a new page. The PDP should show one product with its full description, images, price, variant options, and an Add to Cart button.

4. On the PDP:
   a. If there are size/color/variant selectors, select the first available option
   b. Click the "Add to Cart" or "Add to Bag" button
   c. Wait for the cart confirmation

5. VIEW CART - Click the cart icon in the site header (usually top-right corner). This might:
   - Navigate to a /cart page, OR
   - Open a cart drawer/sidebar
   Either way, you should see the item you added with quantity and price.

6. CHECKOUT - From the cart (page or drawer), find and click the "Checkout", "Proceed to Checkout", or "Go to Checkout" button. You should reach a page where shipping address or payment information is collected.

CRITICAL SAFETY RULES:
- NEVER click "Place Order", "Complete Purchase", "Pay Now", "Submit Order", "Confirm and Pay", or "Process Payment"
- STOP immediately once you reach the checkout page. Do not fill in any forms.
- You are only auditing, not purchasing.

After each major action, call the logStep tool to record what you did.

IMPORTANT NAVIGATION TIPS:
- If a popup, banner, or cookie consent appears, dismiss it first
- If a cart drawer opens after adding to cart, look for "View Cart" or the cart icon to see the full cart
- If you can't find something, scroll the page or look in the footer navigation
- Always verify you actually navigated to a new page by checking if the content changed`;

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
            urlBefore: input.currentUrl,
            urlAfter: input.currentUrl,
            success: input.success,
            error: input.error,
            eventsCaptureDuringStep: 0, // Will be enriched later
            timestamp: new Date().toISOString(),
            durationMs: 0,
          });
          console.log(`  [Agent Step ${stepCounter}] ${input.pageName}: ${input.action} (${input.success ? "✓" : "✗"})`);
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
        `Walk through the ecommerce funnel on this website (${siteUrl}). ` +
        `Visit each page (home → category → product → cart → checkout), ` +
        `perform the required actions (select variant, add to cart, view cart, begin checkout), ` +
        `and log each step using the logStep tool. ` +
        `After completing the walkthrough, report what you found.`,
      maxSteps: 35,
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
