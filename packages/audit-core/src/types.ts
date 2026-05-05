/** The top-level audit document — contract between the worker (produces) and report renderer (consumes). */
export type AuditDocument = {
  audit: {
    id: string;
    version: "1.0.0";
    createdAt: string;
    completedAt: string;
    operator: string;
    site: SiteInfo;
  };
  pages: PageRecord[];
  capturedEvents: CapturedEvent[];
  findings: Finding[];
  scorecard: Scorecard;
  recommendations: {
    immediate: string[];
    shortTerm: string[];
    strategic: string[];
  };
  artifacts: {
    harUrl?: string;
    screenshotsBaseUrl?: string;
  };
  operatorNotes: string;
};

/** Metadata about the audited site's platform and tracking stack. */
export type SiteInfo = {
  url: string;
  domain: string;
  platform: {
    detected:
      | "shopify"
      | "woocommerce"
      | "bigcommerce"
      | "magento"
      | "wix"
      | "squarespace"
      | "custom";
    confidence: "high" | "medium" | "low";
    signals: string[];
    version?: string;
    theme?: string;
  };
  stack: {
    tagManager: "gtm" | "gtag" | "none" | "custom";
    containerIds: string[];
    ga4Properties: string[];
    duplicateTrackers: string[];
    otherPixels: string[];
    consentManager?: string;
  };
};

/** A single page visited during the synthetic shopper funnel walk. */
export type PageRecord = {
  id: string;
  url: string;
  visitedAt: string;
  classification: {
    type: "home" | "category" | "product" | "cart" | "checkout" | "other";
    confidence: "high" | "medium" | "low";
    signals: string[];
  };
  performance: {
    domContentLoaded: number;
    load: number;
    ga4TagLoaded?: number;
  };
  dataLayer: {
    snapshotAt: "after-load" | "after-interaction";
    entries: unknown[];
    consentState?: Record<string, "granted" | "denied">;
  };
  capturedEventIds: string[];
  scan: {
    canonicalElements?: Record<string, CanonicalElement>;
    interactiveElements: InteractiveElement[];
    missingCanonicalElements: string[];
  };
  productContext?: {
    id: string;
    title: string;
    price: number;
    currency: string;
    variants: number;
  };
};

/** A single GA4 event captured from network interception. */
export type CapturedEvent = {
  id: string;
  pageId: string;
  timestamp: string;
  transport: "ga4-collect" | "ga4-mp" | "gtm" | "first-party";
  endpoint: string;
  tid: string;
  name: string;
  params: Record<string, unknown>;
  items: Record<string, unknown>[];
  raw: string;
};

/** An expected canonical element on the page. */
export type CanonicalElement = {
  found: boolean;
  selector?: string;
  text?: string;
  tracked?: boolean;
};

/** An interactive element detected on the page. */
export type InteractiveElement = {
  id: string;
  selector: string;
  text: string;
  role: "button" | "link" | "form" | "input" | "custom";
  hasListener: boolean;
  tracked: boolean;
  context: string;
  recommendation?: {
    event: string;
    params?: string[];
    priority: "low" | "medium" | "high";
    rationale: string;
  };
};

/** A rule-engine output describing something to fix or note. */
export type Finding = {
  id: string;
  ruleId: string;
  category: FindingCategory;
  severity: FindingSeverity;
  status: FindingStatus;
  title: string;
  summary: string;
  evidence: {
    expected?: unknown;
    observed?: unknown;
    pageIds?: string[];
    elementIds?: string[];
    eventIds?: string[];
    sampleEvents?: unknown[];
  };
  impact?: string;
  fix?: {
    platformSpecific: Partial<
      Record<"shopify" | "woocommerce" | "bigcommerce" | "custom", string>
    >;
    estimatedEffort?: string;
  };
};

export type FindingCategory =
  | "implementation_coverage"
  | "data_quality"
  | "platform_infrastructure"
  | "feature_adoption";

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";

export type FindingStatus = "pass" | "evaluate" | "fail";

/** Overall and per-category scoring. */
export type Scorecard = {
  overall: { grade: FindingStatus; score: number; maxScore: 100 };
  categories: {
    name: string;
    label: string;
    score: number;
    maxScore: number;
    grade: FindingStatus;
    summary: string;
  }[];
};
