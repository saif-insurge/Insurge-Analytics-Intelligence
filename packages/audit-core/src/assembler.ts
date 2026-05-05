/**
 * Audit document assembler — takes raw captured data from the CLI/worker
 * and produces a complete AuditDocument with findings and scorecard.
 */

import type {
  AuditDocument,
  CapturedEvent,
  PageRecord,
  SiteInfo,
  Scorecard,
} from "./types.js";
import type { ParsedGa4Event } from "./ga4-parser.js";
import type { PageSignals } from "./page-classifier.js";
import type { PlatformSignals } from "./platform-detector.js";
import { classifyPage } from "./page-classifier.js";
import { detectPlatform } from "./platform-detector.js";
import { runRules, computeScorecard } from "./rules/index.js";

/** Raw data captured during the audit funnel walk. */
export type RawAuditCapture = {
  /** Audit metadata. */
  auditId: string;
  url: string;
  domain: string;
  operator: string;

  /** Pages visited with their signals. */
  pages: {
    id: string;
    url: string;
    visitedAt: string;
    funnelStep: string;
    pageSignals: PageSignals;
    /** DataLayer snapshot. */
    dataLayerEntries: unknown[];
    consentState?: Record<string, "granted" | "denied">;
    /** Performance timing. */
    domContentLoaded: number;
    load: number;
    ga4TagLoaded?: number;
    /** Interactive elements found on the page. */
    interactiveElements: PageRecord["scan"]["interactiveElements"];
    /** Product context if on a PDP. */
    productContext?: PageRecord["productContext"];
  }[];

  /** All parsed GA4 events captured during the audit. */
  events: (ParsedGa4Event & {
    capturedAt: string;
    funnelStep: string;
  })[];

  /** Platform detection signals from the first page. */
  platformSignals: PlatformSignals;

  /** Tag manager and stack info detected. */
  stack: SiteInfo["stack"];
};

/** Assembles a complete AuditDocument from raw captured data. */
export function assembleAuditDocument(capture: RawAuditCapture): AuditDocument {
  const startTime = capture.pages[0]?.visitedAt ?? new Date().toISOString();
  const endTime = new Date().toISOString();

  // 1. Detect platform
  const platform = detectPlatform(capture.platformSignals);

  // 2. Build site info
  const site: SiteInfo = {
    url: capture.url,
    domain: capture.domain,
    platform: {
      detected: platform.detected,
      confidence: platform.confidence,
      signals: platform.signals,
      version: platform.version,
      theme: platform.theme,
    },
    stack: capture.stack,
  };

  // 3. Build page records with classification
  const validPageTypes = new Set(["home", "category", "product", "cart", "checkout", "other"] as const);
  type ValidPageType = "home" | "category" | "product" | "cart" | "checkout" | "other";

  const pages: PageRecord[] = capture.pages.map((rawPage) => {
    const rawClassification = classifyPage(rawPage.pageSignals);
    // Map extended page types (search, account) to "other" for spec compatibility
    const classification = {
      ...rawClassification,
      type: (validPageTypes.has(rawClassification.type as ValidPageType)
        ? rawClassification.type
        : "other") as ValidPageType,
    };
    return {
      id: rawPage.id,
      url: rawPage.url,
      visitedAt: rawPage.visitedAt,
      classification,
      performance: {
        domContentLoaded: rawPage.domContentLoaded,
        load: rawPage.load,
        ga4TagLoaded: rawPage.ga4TagLoaded,
      },
      dataLayer: {
        snapshotAt: "after-load" as const,
        entries: rawPage.dataLayerEntries,
        consentState: rawPage.consentState,
      },
      capturedEventIds: capture.events
        .filter((e) => e.funnelStep === rawPage.funnelStep)
        .map((_, i) => `evt_${rawPage.id}_${i}`),
      scan: {
        interactiveElements: rawPage.interactiveElements,
        missingCanonicalElements: [],
      },
      productContext: rawPage.productContext,
    };
  });

  // 4. Build captured events with proper IDs
  const capturedEvents: CapturedEvent[] = capture.events.map((rawEvent, i) => {
    // Find the page this event belongs to by funnel step
    const page = pages.find((p) => {
      const rawPage = capture.pages.find((rp) => rp.id === p.id);
      return rawPage?.funnelStep === rawEvent.funnelStep;
    });

    return {
      id: `evt_${i}`,
      pageId: page?.id ?? "unknown",
      timestamp: rawEvent.capturedAt,
      transport: rawEvent.transport,
      endpoint: rawEvent.endpoint,
      tid: rawEvent.tid,
      name: rawEvent.name,
      params: rawEvent.params,
      items: rawEvent.items,
      raw: rawEvent.raw,
    };
  });

  // 5. Assemble initial document (without findings/scorecard)
  const auditDoc: AuditDocument = {
    audit: {
      id: capture.auditId,
      version: "1.0.0",
      createdAt: startTime,
      completedAt: endTime,
      operator: capture.operator,
      site,
    },
    pages,
    capturedEvents,
    findings: [],
    scorecard: { overall: { grade: "pass", score: 0, maxScore: 100 }, categories: [] },
    recommendations: { immediate: [], shortTerm: [], strategic: [] },
    artifacts: {},
    operatorNotes: "",
  };

  // 6. Run rule engine
  const findings = runRules(auditDoc);
  auditDoc.findings = findings;

  // 7. Compute scorecard
  auditDoc.scorecard = computeScorecard(findings);

  // 8. Build recommendations from findings
  auditDoc.recommendations = buildRecommendations(findings);

  return auditDoc;
}

/** Categorize finding IDs into immediate/short-term/strategic based on severity. */
function buildRecommendations(findings: import("./types.js").Finding[]) {
  const immediate: string[] = [];
  const shortTerm: string[] = [];
  const strategic: string[] = [];

  for (const f of findings) {
    if (f.status === "pass") continue;

    if (f.severity === "critical" || f.severity === "high") {
      immediate.push(f.id);
    } else if (f.severity === "medium") {
      shortTerm.push(f.id);
    } else {
      strategic.push(f.id);
    }
  }

  return { immediate, shortTerm, strategic };
}
