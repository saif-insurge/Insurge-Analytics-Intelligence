/**
 * AI-powered analysis of captured network requests.
 * Uses OpenAI gpt-4.1-mini to analyze analytics requests and produce
 * structured findings about tracking implementation.
 */

import OpenAI from "openai";
import { detectAnalyticsPlatforms, type DetectedPlatform } from "@ga4-audit/audit-core";
import { detectAiProviderError } from "./errors.js";

export type AiAnalysisResult = {
  /** Summary of the site's tracking implementation. */
  summary: string;
  /** All detected analytics platforms. */
  detectedPlatforms: DetectedPlatform[];
  /** Whether GA4 events were found. */
  ga4Present: boolean;
  /** AI-generated insights about the tracking setup. */
  insights: {
    category: "observation" | "issue" | "recommendation";
    text: string;
  }[];
  /** Token usage for cost tracking. */
  tokensUsed: number;
  /** Input tokens. */
  inputTokens: number;
  /** Output tokens. */
  outputTokens: number;
  /** Estimated cost in USD (computed at audit time with then-current rates). */
  estimatedCostUsd: number;
  /** Model used for analysis (e.g. "gpt-4.1-mini"); null when AI was skipped. */
  model: string | null;
};

/** Analyze captured network requests using platform detection + AI. */
export async function analyzeNetworkRequests(
  allUrls: string[],
  ga4EventCount: number,
  domain: string,
  /** Optional: names of GA4 events that were captured. */
  capturedEventNames?: string[],
): Promise<AiAnalysisResult> {
  // 1. Detect platforms from URL patterns (free, instant)
  const detectedPlatforms = detectAnalyticsPlatforms(allUrls);
  const ga4Present = ga4EventCount > 0;

  // 2. Build a condensed summary for the AI
  const analyticsUrls = allUrls.filter((url) =>
    /analytics|collect|track|pixel|tag|segment|rudder|mixpanel|amplitude|facebook|tiktok|pinterest|doubleclick|googleads|hotjar|clarity|heap|posthog/i.test(url),
  );

  // Deduplicate by domain+path (keep unique patterns, not every request)
  const urlPatterns = new Set<string>();
  for (const url of analyticsUrls) {
    try {
      const parsed = new URL(url);
      urlPatterns.add(`${parsed.hostname}${parsed.pathname}`);
    } catch {
      // skip invalid
    }
  }

  // 3. Run AI analysis if we have an API key
  let insights: AiAnalysisResult["insights"] = [];
  let summary = "";
  let tokensUsed = 0;
  let inputTokens = 0;
  let outputTokens = 0;
  let estimatedCostUsd = 0;
  // Hoisted so it's in scope at the return statement; only meaningful when the
  // OpenAI branch below actually runs. Otherwise stays null.
  let modelUsed: string | null = null;

  // GPT-5.4 pricing (per token) — configurable via env vars
  const INPUT_COST_PER_TOKEN = parseFloat(process.env.AI_INPUT_COST_PER_MTOK ?? "2.5") / 1_000_000;
  const OUTPUT_COST_PER_TOKEN = parseFloat(process.env.AI_OUTPUT_COST_PER_MTOK ?? "15") / 1_000_000;

  if (process.env.OPENAI_API_KEY && urlPatterns.size > 0) {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const platformSummary = detectedPlatforms
      .map((p) => `- ${p.name} (${p.category}): ${p.requestCount} requests${p.detectedEvents.length > 0 ? `, events: ${p.detectedEvents.join(", ")}` : ""}`)
      .join("\n");

    // Build GA4 event summary
    const eventNameCounts = new Map<string, number>();
    if (capturedEventNames) {
      for (const name of capturedEventNames) {
        if (name) eventNameCounts.set(name, (eventNameCounts.get(name) ?? 0) + 1);
      }
    }
    const ga4EventSummary = eventNameCounts.size > 0
      ? [...eventNameCounts.entries()].map(([name, count]) => `  ${name}: ${count}x`).join("\n")
      : "  None captured";

    // Separate CDPs from other platforms
    const cdps = detectedPlatforms.filter((p) => p.category === "cdp");
    const adPixels = detectedPlatforms.filter((p) => p.category === "pixel" || p.category === "ads");
    const analytics = detectedPlatforms.filter((p) => p.category === "analytics");
    const tagManagers = detectedPlatforms.filter((p) => p.category === "tag_manager");

    const prompt = `You are a tracking and analytics expert. Analyze this ecommerce website's tracking implementation.

SITE: ${domain}

═══ GA4 STATUS ═══
GA4 events captured from browser: ${ga4EventCount}
GA4 events breakdown:
${ga4EventSummary}

═══ CDPs (Customer Data Platforms) DETECTED ═══
${cdps.length > 0 ? cdps.map((p) => `- ${p.name}: ${p.requestCount} requests${p.detectedEvents.length > 0 ? ` (events: ${p.detectedEvents.join(", ")})` : ""}`).join("\n") : "None detected"}

═══ AD PIXELS DETECTED ═══
${adPixels.length > 0 ? adPixels.map((p) => `- ${p.name}: ${p.requestCount} requests${p.detectedEvents.length > 0 ? ` (events: ${p.detectedEvents.join(", ")})` : ""}`).join("\n") : "None detected"}

═══ ANALYTICS PLATFORMS DETECTED ═══
${analytics.length > 0 ? analytics.map((p) => `- ${p.name}: ${p.requestCount} requests`).join("\n") : "None detected"}

═══ TAG MANAGERS ═══
${tagManagers.length > 0 ? tagManagers.map((p) => `- ${p.name}: ${p.requestCount} requests`).join("\n") : "None detected"}

═══ ALL ANALYTICS-RELATED URL PATTERNS (${urlPatterns.size} unique) ═══
${[...urlPatterns].slice(0, 60).join("\n")}

═══ YOUR TASK ═══
Analyze the above data and answer these SPECIFIC questions:

1. CDP ROUTING: Is a CDP (Rudderstack, Segment, mParticle, etc.) being used? If yes, is it likely routing events to GA4 server-side? Look for patterns like:
   - Rudderstack dataplane URLs (indicates events flow through Rudderstack first)
   - Server-side GTM containers (gtm-*.appspot.com suggests server-side tagging)
   - If GA4 events ARE present + a CDP is present, the CDP may be forwarding to GA4
   - If GA4 events are NOT present but a CDP IS present, GA4 may only receive data server-side through the CDP

2. GA4 IMPLEMENTATION: Is GA4 properly implemented? Are ecommerce events (view_item, add_to_cart, begin_checkout) firing? Are they firing client-side or potentially server-side only?

3. TRACKING STACK: What is the complete tracking stack? (e.g., "GTM client-side → Rudderstack CDP → GA4 server-side + Meta Pixel client-side")

4. AD PIXEL COVERAGE: Which ad platforms are receiving conversion data? Are they getting it client-side or possibly through the CDP?

5. ISSUES & RECOMMENDATIONS: What's broken, missing, or could be improved?

Be SPECIFIC and DEFINITIVE. Say "Rudderstack IS being used as the CDP" not "URLs suggest server-side tracking." If you see gtm-*.appspot.com, say "Server-side GTM container detected at [hostname]." Name the specific platforms and how they connect.`;

    const aiModel = process.env.AI_ANALYSIS_MODEL ?? "gpt-4.1-mini";
    modelUsed = aiModel;
    try {
      // ─── Call 1: Analysis with web search (free-text response) ─────
      const researchCompletion = await openai.responses.create({
        model: aiModel,
        input: [{ role: "user", content: prompt + "\n\nProvide your analysis as detailed text. Use web search if needed to verify platform-specific details." }],
        tools: [{ type: "web_search_preview" }],
        max_output_tokens: 1000,
        temperature: 0.3,
      });

      const rawAnalysis = researchCompletion.output_text ?? "";
      const call1Input = researchCompletion.usage?.input_tokens ?? 0;
      const call1Output = researchCompletion.usage?.output_tokens ?? 0;

      // ─── Call 2: Structure into JSON (no web search) ──────────────
      const structureCompletion = await openai.responses.create({
        model: aiModel,
        input: [
          {
            role: "user",
            content: `Structure this tracking analysis into JSON.

Analysis:
${rawAnalysis}

Return this exact JSON structure:
{
  "summary": "2-3 sentence overview of the tracking architecture — mention specific platforms by name",
  "insights": [
    {"category": "observation|issue|recommendation", "text": "specific, definitive finding — name platforms, not vague descriptions"}
  ]
}

Rules for insights:
- 4-8 items, ordered by importance
- "observation": factual findings (e.g., "Rudderstack CDP is active and routing events to GA4 via server-side GTM at gtm-pd9n79b-ywuxn.uc.r.appspot.com")
- "issue": concrete problems (e.g., "GA4 add_to_cart event is missing — not fired client-side or through the CDP")
- "recommendation": actionable fixes (e.g., "Configure Rudderstack GA4 destination to forward ecommerce events if not already active")
- Be SPECIFIC — name the actual platforms, hostnames, and events. Never say "suggests" or "possibly" when the data clearly shows it.`,
          },
        ],
        text: { format: { type: "json_object" } },
        max_output_tokens: 800,
        temperature: 0.2,
      });

      const call2Input = structureCompletion.usage?.input_tokens ?? 0;
      const call2Output = structureCompletion.usage?.output_tokens ?? 0;

      inputTokens = call1Input + call2Input;
      outputTokens = call1Output + call2Output;
      tokensUsed = inputTokens + outputTokens;
      estimatedCostUsd = (inputTokens * INPUT_COST_PER_TOKEN) + (outputTokens * OUTPUT_COST_PER_TOKEN);

      const content = structureCompletion.output_text;
      if (content) {
        const parsed = JSON.parse(content) as {
          summary?: string;
          insights?: { category: string; text: string }[];
        };
        summary = parsed.summary ?? "";
        insights = (parsed.insights ?? []).map((i) => ({
          category: (["observation", "issue", "recommendation"].includes(i.category)
            ? i.category
            : "observation") as "observation" | "issue" | "recommendation",
          text: i.text,
        }));
      }
    } catch (err) {
      // Billing/quota/auth/rate-limit failures from the AI provider mean we
      // can't reliably produce analysis — fail the audit instead of silently
      // returning "AI analysis unavailable" while completing as success.
      const aiErr = detectAiProviderError(err);
      if (aiErr) throw aiErr;
      console.error(`AI analysis failed with ${aiModel} (non-fatal):`, err instanceof Error ? err.message : err);
      summary = "AI analysis unavailable";
    }
  } else {
    summary = ga4Present
      ? `${domain} has GA4 implemented with ${ga4EventCount} events captured.`
      : `No GA4 events were captured from ${domain}. ${detectedPlatforms.length > 0 ? `However, ${detectedPlatforms.map((p) => p.name).join(", ")} tracking was detected.` : "No analytics platforms detected."}`;
  }

  return {
    summary,
    detectedPlatforms,
    ga4Present,
    insights,
    tokensUsed,
    inputTokens,
    outputTokens,
    estimatedCostUsd,
    model: modelUsed,
  };
}
