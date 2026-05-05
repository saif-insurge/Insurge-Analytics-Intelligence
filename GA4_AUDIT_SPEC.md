# GA4 Ecommerce Tracking Audit System — Build Spec

This document is the complete specification for an automated GA4 ecommerce tracking audit tool. It is written for Claude Code as the implementer. Read it end-to-end before writing any code.

---

## 1. What we're building and why

A web tool that audits the GA4 ecommerce tracking implementation of a given website. The operator (one user, you) submits a URL. The system spins up a real browser, walks through the site as a synthetic shopper (home → category → product → add to cart → cart → begin checkout), captures every GA4 event that fires during the walk, analyzes the captured events against the GA4 ecommerce schema, and produces a PDF audit report with findings, severity, and platform-specific fix recommendations.

The audit is a lead magnet for a paid GA4 ecommerce tracking implementation service ($500-$1500). The report's job is to surface specific, evidenced problems that make the paid fix obvious.

The audit is **synthetic-capture-based**, not API-based. It requires zero access to the prospect's GA4 property. It runs Playwright (via Stagehand) against the public-facing site, intercepts network requests to Google Analytics endpoints, and parses the GA4 measurement protocol to reconstruct what events fired with what parameters.

**Out of scope for v1:** OAuth-based GA4 Admin API access, configuration audit (data retention, attribution settings, BigQuery linkage), purchase event validation (we stop before payment submission), purchase-flow audits for prepaid-only stores beyond `add_payment_info`.

---

## 2. Tech stack (locked decisions)

- **Frontend:** Next.js 14+ App Router, TypeScript, Tailwind, deployed to Vercel
- **Auth:** Clerk (single-user/single-org for now, but model data with `organizationId` for future multi-tenant)
- **Database:** Postgres + Prisma. Use Neon or Supabase Postgres for hosting; Prisma migrations.
- **Queue:** Upstash QStash for job enqueueing (HTTP-based, no Redis to manage). QStash calls a webhook on the worker service when a job is ready.
- **Worker (browser execution):** Cloud Run service running a Docker container with Node + Stagehand + Playwright + Chromium. Triggered by QStash webhooks. Local dev mode runs the same code outside the container for debugging.
- **AI for navigation:** Anthropic Claude Sonnet via Stagehand (`act`, `observe`, `extract`). Use Haiku for cheap obstacle dismissal where reasoning is simple.
- **PDF generation:** React-PDF (`@react-pdf/renderer`) in a Vercel serverless function. Stored in Cloudflare R2.
- **Storage:** Cloudflare R2 for PDFs, HAR files, and screenshots. R2 because zero egress.
- **Email:** Resend for "your audit is ready" notifications.
- **Observability:** Vercel logs for frontend/API, Cloud Run logs for worker, Sentry for error tracking across both.

**Repo structure:** Turborepo monorepo. Reasons: shared Prisma schema between Next.js app and Cloud Run worker, shared TypeScript types for the audit JSON shape, shared parser code (the GA4 measurement protocol parser is used by both the worker capturing events and the report renderer).

```
ga4-audit/
├── apps/
│   ├── web/              # Next.js app (frontend + API routes)
│   └── worker/           # Cloud Run worker (Stagehand runner)
├── packages/
│   ├── db/               # Prisma schema + client
│   ├── audit-core/       # Shared types, GA4 parser, rule engine
│   ├── pdf/              # React-PDF report components
│   └── tsconfig/
├── turbo.json
└── package.json
```

---

## 3. Data model (Prisma schema)

```prisma
// packages/db/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Organization {
  id        String   @id // Clerk org ID
  name      String
  createdAt DateTime @default(now())
  audits    Audit[]
}

model User {
  id             String   @id // Clerk user ID
  email          String   @unique
  organizationId String
  createdAt      DateTime @default(now())
  audits         Audit[]
}

model Audit {
  id             String       @id @default(cuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id])
  createdById    String
  createdBy      User         @relation(fields: [createdById], references: [id])

  url            String
  domain         String
  status         AuditStatus  @default(PENDING)

  // Lifecycle
  queuedAt       DateTime     @default(now())
  startedAt      DateTime?
  completedAt    DateTime?
  failedAt       DateTime?
  failureReason  String?

  // Detected metadata (filled during audit)
  platform       String?      // "shopify" | "woocommerce" | "bigcommerce" | "custom" | null
  platformConfidence String?  // "high" | "medium" | "low"

  // Output artifacts (R2 keys)
  rawJsonKey     String?      // The full structured audit JSON
  harFileKey     String?      // The HAR capture
  screenshotsKey String?      // Folder of per-step screenshots
  pdfReportKey   String?      // The final PDF

  // Scoring (denormalized for list views)
  overallScore   Int?
  overallGrade   String?      // "pass" | "evaluate" | "fail"

  // Findings stored separately for queryability
  findings       Finding[]
  events         Json?        // Captured GA4 events array (also in rawJsonKey, denormalized for fast queries)
  pages          Json?        // Pages visited array (also in rawJsonKey)

  operatorNotes  String?      @default("")

  @@index([organizationId, createdAt])
  @@index([status])
}

enum AuditStatus {
  PENDING       // Queued, not started
  RUNNING       // Worker has picked it up
  ANALYZING     // Browser walk done, running rules
  RENDERING     // Generating PDF
  COMPLETE
  FAILED
}

model Finding {
  id          String   @id @default(cuid())
  auditId     String
  audit       Audit    @relation(fields: [auditId], references: [id], onDelete: Cascade)

  ruleId      String   // e.g. "ga4.ecommerce.add_to_cart.missing"
  category    String   // "implementation_coverage" | "data_quality" | "platform_infrastructure" | "feature_adoption"
  severity    String   // "critical" | "high" | "medium" | "low" | "info"
  status      String   // "pass" | "evaluate" | "fail"

  title       String
  summary     String   @db.Text
  evidence    Json     // { expected, observed, pageIds, elementIds, ... }
  impact      String?  @db.Text
  fix         Json?    // { platformSpecific: { shopify, woocommerce, custom }, estimatedEffort }

  @@index([auditId])
}
```

**Key design notes for Claude Code:**

- The full audit JSON is stored as a file in R2 (`rawJsonKey`). The `Audit` row holds denormalized fields for the list view (status, score, etc) plus the captured events as JSON for queryability. `Finding` rows are also derived from the JSON but stored separately so we can query "show me all audits with a critical add_to_cart finding" without parsing JSON blobs.
- `organizationId` is on every audit even though there's one org for now. Don't skip this — adding multi-tenancy later is much harder if you don't.
- Use cuid IDs everywhere except Clerk-owned models.

---

## 4. The audit JSON schema

This is the contract between the worker (produces it) and the report renderer (consumes it). Define it as TypeScript types in `packages/audit-core/src/types.ts`. The schema is versioned — bump `version` on breaking changes.

```typescript
// packages/audit-core/src/types.ts

export type AuditDocument = {
  audit: {
    id: string;
    version: "1.0.0";
    createdAt: string; // ISO
    completedAt: string;
    operator: string; // email
    site: SiteInfo;
  };
  pages: PageRecord[];
  capturedEvents: CapturedEvent[]; // flat list, also referenced from pages
  findings: Finding[];
  scorecard: Scorecard;
  recommendations: {
    immediate: string[];   // finding IDs
    shortTerm: string[];
    strategic: string[];
  };
  artifacts: {
    harUrl?: string;       // R2 URL
    screenshotsBaseUrl?: string;
  };
  operatorNotes: string;
};

export type SiteInfo = {
  url: string;
  domain: string;
  platform: {
    detected: "shopify" | "woocommerce" | "bigcommerce" | "magento" | "wix" | "squarespace" | "custom";
    confidence: "high" | "medium" | "low";
    signals: string[];
    version?: string;
    theme?: string;
  };
  stack: {
    tagManager: "gtm" | "gtag" | "none" | "custom";
    containerIds: string[];      // GTM containers
    ga4Properties: string[];     // measurement IDs
    duplicateTrackers: string[]; // UA, multiple GA4, etc
    otherPixels: string[];       // facebook, tiktok, pinterest, etc
    consentManager?: string;
  };
};

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
    entries: any[];
    consentState?: Record<string, "granted" | "denied">;
  };
  capturedEventIds: string[]; // refs to capturedEvents
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

export type CapturedEvent = {
  id: string;
  pageId: string;
  timestamp: string;
  transport: "ga4-collect" | "ga4-mp" | "gtm" | "first-party";
  endpoint: string;
  tid: string;          // GA4 measurement ID
  name: string;         // event name (en parameter)
  params: Record<string, any>;     // ep.* and standard params
  items: Record<string, any>[];    // pr1, pr2, ... parsed
  raw: string;          // original query string or body
};

export type CanonicalElement = {
  found: boolean;
  selector?: string;
  text?: string;
  tracked?: boolean;
};

export type InteractiveElement = {
  id: string;
  selector: string;
  text: string;
  role: "button" | "link" | "form" | "input" | "custom";
  hasListener: boolean;
  tracked: boolean;
  context: string; // "header" | "hero-cta" | "product-form" | etc
  recommendation?: {
    event: string;
    params?: string[];
    priority: "low" | "medium" | "high";
    rationale: string;
  };
};

export type Finding = {
  id: string;
  ruleId: string;
  category: "implementation_coverage" | "data_quality" | "platform_infrastructure" | "feature_adoption";
  severity: "critical" | "high" | "medium" | "low" | "info";
  status: "pass" | "evaluate" | "fail";
  title: string;
  summary: string;
  evidence: {
    expected?: any;
    observed?: any;
    pageIds?: string[];
    elementIds?: string[];
    eventIds?: string[];
    sampleEvents?: any[];
  };
  impact?: string;
  fix?: {
    platformSpecific: Partial<Record<"shopify" | "woocommerce" | "bigcommerce" | "custom", string>>;
    estimatedEffort?: string;
  };
};

export type Scorecard = {
  overall: { grade: "pass" | "evaluate" | "fail"; score: number; maxScore: 100 };
  categories: {
    name: string;
    label: string;
    score: number;
    maxScore: number;
    grade: "pass" | "evaluate" | "fail";
    summary: string;
  }[];
};
```

---

## 5. End-to-end audit lifecycle

```
[User submits URL]
   ↓
[Next.js API route: POST /api/audits]
   ↓ creates Audit row (status=PENDING)
[Enqueue to QStash with payload {auditId}]
   ↓
[QStash calls Cloud Run worker webhook]
   ↓
[Worker: marks status=RUNNING, runs Stagehand audit]
   ↓
[Worker: marks status=ANALYZING, runs rule engine on captured data]
   ↓
[Worker: writes audit JSON + HAR + screenshots to R2]
   ↓
[Worker: writes denormalized fields and findings to Postgres]
   ↓
[Worker: triggers PDF render via Vercel API route]
   ↓
[Vercel function: reads audit JSON from R2, renders React-PDF, writes PDF to R2]
   ↓
[Worker: marks status=COMPLETE]
   ↓
[Send email via Resend with link to /audits/{id}]
```

Why this split: Stagehand needs a beefy container with Chromium (Cloud Run is right). React-PDF rendering is CPU-light and stateless (Vercel function is right). Don't render PDFs inside the Cloud Run worker; it makes the container heavier and couples concerns.

---

## 6. The worker (Cloud Run + Stagehand)

### 6.1 Container

```dockerfile
# apps/worker/Dockerfile
FROM node:20-slim

# Install Chromium dependencies
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libnss3 \
    libatk-bridge2.0-0 \
    libdrm2 \
    libxkbcommon0 \
    libxcomposite1 \
    libxdamage1 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libasound2 \
    && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app
COPY package*.json ./
COPY apps/worker/package.json ./apps/worker/
COPY packages ./packages
RUN npm install

COPY . .
RUN npm run build --workspace=worker

EXPOSE 8080
CMD ["node", "apps/worker/dist/server.js"]
```

Cloud Run config: 4GB memory, 2 vCPU, concurrency=1 (one audit per container instance), max instances=10, request timeout=900s (15 min, generous safety margin), min instances=0.

### 6.2 Worker server

The worker is a Hono HTTP server with one route: `POST /audit` that QStash calls with `{auditId}`. Verify the request signature using QStash's signing key.

```typescript
// apps/worker/src/server.ts
import { Hono } from "hono";
import { Receiver } from "@upstash/qstash";
import { runAudit } from "./audit-runner";

const app = new Hono();
const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey: process.env.QSTASH_NEXT_SIGNING_KEY!,
});

app.post("/audit", async (c) => {
  const signature = c.req.header("upstash-signature");
  const body = await c.req.text();
  const isValid = await receiver.verify({ signature: signature!, body });
  if (!isValid) return c.text("Invalid signature", 401);

  const { auditId } = JSON.parse(body);
  // Fire and forget; respond to QStash quickly
  runAudit(auditId).catch((err) => console.error("Audit failed:", err));
  return c.json({ accepted: true });
});

export default {
  port: 8080,
  fetch: app.fetch,
};
```

Note: QStash retries failed jobs automatically. Worker should be idempotent (check audit status before running; skip if already complete).

### 6.3 The audit runner

This is the meat of the system. Step-by-step in `apps/worker/src/audit-runner.ts`:

```typescript
import { Stagehand } from "@browserbasehq/stagehand";
import { prisma } from "@ga4-audit/db";
import { parseGa4Event, classifyPage, detectPlatform, scanPage, runRules } from "@ga4-audit/audit-core";
import { uploadToR2 } from "./storage";

export async function runAudit(auditId: string) {
  const audit = await prisma.audit.findUnique({ where: { id: auditId }});
  if (!audit || audit.status === "COMPLETE") return;

  await prisma.audit.update({
    where: { id: auditId },
    data: { status: "RUNNING", startedAt: new Date() },
  });

  // 1. Initialize Stagehand
  const stagehand = new Stagehand({
    env: process.env.NODE_ENV === "production" ? "LOCAL" : "LOCAL", // Always LOCAL for self-hosted
    modelName: "claude-3-5-sonnet-20241022",
    modelClientOptions: { apiKey: process.env.ANTHROPIC_API_KEY },
    headless: true,
    enableCaching: false,
    domSettleTimeoutMs: 5000,
  });
  await stagehand.init();

  const page = stagehand.page;
  const capturedEvents: CapturedEvent[] = [];
  const harEvents: any[] = [];

  // 2. Set up network interception BEFORE navigating
  page.on("request", (request) => {
    const url = request.url();
    if (isGa4Endpoint(url)) {
      const event = parseGa4Event(request);
      if (event) capturedEvents.push({ ...event, pageId: currentPageId });
    }
    harEvents.push({ /* HAR entry */ });
  });

  // 3. Navigate the synthetic shopper through the funnel
  const pages: PageRecord[] = [];

  // -- Home page
  let currentPageId = "page_01";
  await page.goto(audit.url, { waitUntil: "networkidle" });
  await dismissObstacles(page);
  pages.push(await analyzePage(page, currentPageId, "home"));

  // -- Find and visit a category page
  currentPageId = "page_02";
  const categoryUrl = await findCategoryUrl(page);
  if (categoryUrl) {
    await page.goto(categoryUrl, { waitUntil: "networkidle" });
    pages.push(await analyzePage(page, currentPageId, "category"));
  }

  // -- Visit a product page (click first product card via AI)
  currentPageId = "page_03";
  await page.act("click on the first product in the listing");
  await page.waitForLoadState("networkidle");
  pages.push(await analyzePage(page, currentPageId, "product"));

  // -- Select variant if needed and add to cart
  await page.act("select the first available variant if there are size/color options");
  await page.act("click the add to cart button");
  await page.waitForTimeout(2000); // let events fire

  // -- View cart
  currentPageId = "page_04";
  await page.act("open the cart drawer or navigate to the cart page");
  await page.waitForLoadState("networkidle");
  pages.push(await analyzePage(page, currentPageId, "cart"));

  // -- Begin checkout
  currentPageId = "page_05";
  await page.act("click the checkout button to begin checkout");
  await page.waitForLoadState("networkidle");
  pages.push(await analyzePage(page, currentPageId, "checkout"));

  // -- HARD STOP. Do not proceed past begin_checkout.
  // The agent will be tempted to fill the form and click "Place order".
  // Do not give it that instruction.

  // 4. Detect platform and stack
  const site = await detectSite(page, audit.url);

  // 5. Build the audit JSON
  const auditDoc: AuditDocument = {
    audit: {
      id: audit.id,
      version: "1.0.0",
      createdAt: audit.queuedAt.toISOString(),
      completedAt: new Date().toISOString(),
      operator: audit.createdById,
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

  // 6. Run the rule engine
  await prisma.audit.update({ where: { id: auditId }, data: { status: "ANALYZING" }});
  const findings = runRules(auditDoc);
  auditDoc.findings = findings;
  auditDoc.scorecard = computeScorecard(findings);

  // 7. Upload artifacts to R2
  const rawJsonKey = `audits/${auditId}/audit.json`;
  await uploadToR2(rawJsonKey, JSON.stringify(auditDoc));
  // ...HAR, screenshots

  // 8. Persist findings to Postgres
  await prisma.audit.update({
    where: { id: auditId },
    data: {
      status: "RENDERING",
      rawJsonKey,
      platform: site.platform.detected,
      overallScore: auditDoc.scorecard.overall.score,
      overallGrade: auditDoc.scorecard.overall.grade,
      events: capturedEvents as any,
      pages: pages as any,
      findings: { create: findings.map(toPrismaFinding) },
    },
  });

  // 9. Trigger PDF render
  await fetch(`${process.env.WEB_BASE_URL}/api/render-pdf`, {
    method: "POST",
    headers: { "x-internal-secret": process.env.INTERNAL_SECRET! },
    body: JSON.stringify({ auditId }),
  });

  await stagehand.close();
}
```

### 6.4 Critical guardrails

**Payment stop-list (deterministic, must not be AI-decided):** before any `page.act()` call that could click a button, intercept the proposed action and refuse if the button text matches:

```typescript
const PAYMENT_FORBIDDEN_PATTERNS = [
  /place\s*order/i,
  /complete\s*purchase/i,
  /pay\s*now/i,
  /submit\s*order/i,
  /confirm\s*and\s*pay/i,
  /buy\s*now/i,  // careful — this might be on PDPs
];
```

Implementation: use Stagehand's `observe` first to inspect what the AI plans to click, check the text against the stop-list, then decide whether to call `act`. Or override Playwright's click to gate every click through the stop-list. Pick one. The stop-list lives in code, not in a prompt.

**Login wall detection:** if any page returns a login form before checkout completes, mark the audit as `FAILED` with reason "Site requires login before checkout — out of scope for v1."

**Bot detection:** if the page returns an obvious bot challenge (Cloudflare interstitial, "verify you are human"), mark `FAILED` with reason "Site is using bot detection that blocks automated audit. Manual audit recommended."

**Incognito browser context only.** Never persist cookies between audits. Never log in. This protects the prospect from one-click checkouts and Shop Pay accidents.

**Currency handling:** if the site shows a country/currency picker, AI dismisses by selecting whatever the default is. Don't try to pick a specific country — the audit just needs *some* currency to be set so events fire correctly.

### 6.5 GA4 measurement protocol parser

Implement in `packages/audit-core/src/ga4-parser.ts`. Parse both the `/g/collect` (web) and `/mp/collect` (server) endpoints. Reference: [GA4 Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4).

Key params to extract:
- `tid` → measurement ID
- `en` → event name
- `ep.<key>` → event params (string)
- `epn.<key>` → event params (numeric)
- `pr<N>` → product/item array, pipe-delimited (e.g. `pr1=id12345~nmBlue+Widget~pr49.99~qt1`)
- `cu` → currency
- `cid` → client ID
- `sid` → session ID

Items are encoded with prefix codes: `id` (item_id), `nm` (item_name), `pr` (price), `qt` (quantity), `ca` (category), `br` (brand), `va` (variant), `ln` (item_list_name), `li` (item_list_id), `lp` (index in list), `cp` (coupon).

Decode tilde-separated key-value pairs after the prefix. Handle URL-encoded characters. Handle batched events (multiple events in one request, separated by newlines in the body).

Test the parser against the [GA Debugger Chrome extension](https://chrome.google.com/webstore/detail/google-analytics-debugger/jnkmfdileelhofjcijamephohjechhna) output on 5 known sites — they should match.

---

## 7. The rule engine

Lives in `packages/audit-core/src/rules/`. Each rule is a function that takes the `AuditDocument` and returns zero or more `Finding`s.

```typescript
// packages/audit-core/src/rules/types.ts
export type Rule = {
  id: string;
  category: Finding["category"];
  description: string;
  evaluate: (audit: AuditDocument) => Finding[];
};
```

### 7.1 Rules to implement for v1

Group rules in files by category. Each rule has a stable `ruleId` so reports are diffable across re-audits.

**Implementation coverage rules** (`rules/coverage.ts`):

- `ga4.ecommerce.view_item_list.missing` — fail if no `view_item_list` event fires on category pages
- `ga4.ecommerce.view_item.missing` — fail if no `view_item` on product pages
- `ga4.ecommerce.add_to_cart.missing` — fail if `add_to_cart` doesn't fire after the click
- `ga4.ecommerce.view_cart.missing` — fail if no `view_cart` on cart page or after drawer open
- `ga4.ecommerce.begin_checkout.missing` — fail if no `begin_checkout` after checkout click
- `ga4.ecommerce.naming.snake_case` — fail if any captured event uses non-snake_case (e.g. `addToCart`, `Add_To_Cart`)
- `ga4.ecommerce.naming.canonical` — fail if non-standard event names used where canonical exists (e.g. `cart_add` instead of `add_to_cart`)

**Data quality rules** (`rules/quality.ts`):

- `ga4.params.currency.missing` — fail if any ecommerce event missing `currency`
- `ga4.params.value.missing` — fail if any ecommerce event missing `value` where required
- `ga4.items.item_id.missing` — fail if any item missing `item_id`
- `ga4.items.item_name.missing` — fail if any item missing `item_name`
- `ga4.items.item_id.inconsistent` — fail if same product has different `item_id` across `view_item` and `add_to_cart` (compare by product page URL)
- `ga4.items.price_zero` — evaluate (not fail) if any item has `price: 0` — could be legit (free product) but usually a bug

**Platform & infrastructure rules** (`rules/infrastructure.ts`):

- `ga4.tags.duplicate_property` — fail if multiple GA4 measurement IDs detected (data fragmentation)
- `ga4.tags.legacy_ua` — evaluate if any UA tracking still firing (UA-XXXXX-X format)
- `ga4.consent.mode_v2_missing` — evaluate if no `gtag('consent', 'default', ...)` call detected
- `ga4.tags.gtm_present` — pass/fail depending on whether GTM is the implementation method (best practice = pass)
- `ga4.tags.hardcoded` — evaluate if `gtag.js` is hardcoded without GTM

**Feature adoption rules** (`rules/features.ts`):

- `feature_tracking.search.untracked` — evaluate if site search input exists but no `search` event fires
- `feature_tracking.wishlist.untracked` — evaluate if wishlist button detected but no `add_to_wishlist`
- `feature_tracking.newsletter.untracked` — evaluate if newsletter form exists but no `generate_lead` or `sign_up`
- `feature_tracking.high_intent_buttons.untracked` — for each `InteractiveElement` with no associated tracked event, generate a finding

### 7.2 Scoring

Categories and max scores:
- Implementation Coverage: 30 points
- Data Quality: 30 points
- Platform & Infrastructure: 25 points
- Feature Adoption: 15 points

Total: 100. Each rule contributes a defined point value when it passes; failing reduces by that amount. Define point allocations in a constants file so they're easy to tune.

Grading thresholds: 80+ = pass, 50-79 = evaluate, <50 = fail. Same thresholds per-category (with proportional adjustment).

---

## 8. Frontend (Next.js)

### 8.1 Routes

- `/` — landing/marketing (out of scope for build, simple form for now)
- `/sign-in`, `/sign-up` — Clerk
- `/audits` — list of past audits (table: domain, status, score, date, link to view)
- `/audits/new` — form to submit a new audit (URL input + optional notes)
- `/audits/[id]` — audit detail view (status, scorecard, findings list, links to PDF/HAR/JSON)

### 8.2 API routes

- `POST /api/audits` — create audit, enqueue to QStash. Auth required.
- `GET /api/audits/[id]` — return current state. Used for polling status.
- `POST /api/render-pdf` — internal endpoint called by worker. Authed by `x-internal-secret` header. Reads audit JSON from R2, renders PDF, writes back to R2, marks audit COMPLETE, sends email.
- `GET /api/audits/[id]/pdf` — signed URL redirect to R2 PDF
- `GET /api/audits/[id]/json` — signed URL redirect to R2 JSON
- `GET /api/audits/[id]/har` — signed URL redirect to R2 HAR

### 8.3 Status polling

Audit detail page polls `GET /api/audits/[id]` every 3s while status ∈ {PENDING, RUNNING, ANALYZING, RENDERING}. When COMPLETE, stop polling and render the report view inline (don't require PDF download to read the audit). Use SWR or TanStack Query.

### 8.4 UI requirements

Use Saif's design system: Unbounded for headers, Plus Jakarta Sans for body, OKLCH Electric Indigo palette, dark mode default. Tailwind config to match.

The audit detail view should show:
- Header with domain, score (circular gauge), grade, date
- Three category score cards (Implementation Coverage, Data Quality, Platform & Infrastructure, Feature Adoption — yes that's four, fix typo earlier)
- Findings list grouped by category, each finding expandable to show evidence
- Sidebar with download links: PDF, JSON, HAR
- Operator notes textarea (saves on blur)

---

## 9. PDF report generation

Lives in `packages/pdf/`. Uses `@react-pdf/renderer`. Rendered by a Vercel serverless function (`/api/render-pdf`).

### 9.1 Report structure

Borrow the structure from ga4auditor.com's PDF (worth studying), adapted for our content:

1. **Cover page** — domain, audit date, operator, overall grade
2. **Executive summary** — 1-page overview: what we did, top 3 findings, one-line recommendation
3. **Scorecard** — overall + category breakdown with grades
4. **Findings by category** — one section per category, findings sorted by severity:
   - Implementation Coverage
   - Data Quality
   - Platform & Infrastructure
   - Feature Adoption Opportunities
5. **Evidence appendix** — the actual captured events for each broken finding, formatted as readable JSON snippets. This is your differentiator — show the actual wire data.
6. **Recommended fix plan** — based on detected platform, show the specific Shopify/Woo/custom fix for each failing finding
7. **About / next steps** — pitch for the paid service, contact info

### 9.2 Implementation

```typescript
// packages/pdf/src/AuditReport.tsx
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import type { AuditDocument } from "@ga4-audit/audit-core";

Font.register({ family: "Unbounded", src: "..." });
Font.register({ family: "Plus Jakarta Sans", src: "..." });

export function AuditReport({ audit }: { audit: AuditDocument }) {
  return (
    <Document>
      <CoverPage audit={audit} />
      <ExecutiveSummaryPage audit={audit} />
      <ScorecardPage audit={audit} />
      {audit.findings.map(f => <FindingPage key={f.id} finding={f} audit={audit} />)}
      <EvidenceAppendixPage audit={audit} />
      <FixPlanPage audit={audit} />
      <NextStepsPage audit={audit} />
    </Document>
  );
}
```

The render function:

```typescript
// apps/web/app/api/render-pdf/route.ts
import { renderToBuffer } from "@react-pdf/renderer";
import { AuditReport } from "@ga4-audit/pdf";
import { downloadFromR2, uploadToR2 } from "@/lib/r2";
import { prisma } from "@ga4-audit/db";

export async function POST(req: Request) {
  // verify x-internal-secret
  const { auditId } = await req.json();

  const audit = await prisma.audit.findUnique({ where: { id: auditId }});
  const json = await downloadFromR2(audit!.rawJsonKey!);
  const auditDoc = JSON.parse(json);

  const buffer = await renderToBuffer(<AuditReport audit={auditDoc} />);
  const pdfKey = `audits/${auditId}/report.pdf`;
  await uploadToR2(pdfKey, buffer, "application/pdf");

  await prisma.audit.update({
    where: { id: auditId },
    data: { status: "COMPLETE", completedAt: new Date(), pdfReportKey: pdfKey },
  });

  // send email via Resend
  // ...

  return Response.json({ ok: true });
}
```

---

## 10. Security

### 10.1 Authentication and authorization

- All `/api/audits` routes require Clerk auth.
- `POST /api/render-pdf` is an internal endpoint, authed by `x-internal-secret` env var (HMAC of body would be better but secret-header is acceptable for v1).
- Worker `/audit` endpoint authed by QStash signature verification (built-in).
- R2 access via signed URLs only. PDF/JSON/HAR are NOT publicly accessible.
- Cloud Run worker runs on a service account with minimal permissions (no GCP API access beyond logging).

### 10.2 Input validation

- URL validation: must be valid HTTPS URL, not localhost, not private IP ranges (block 10.x, 192.168.x, 172.16-31.x, 127.x). Use [`is-private-ip`](https://www.npmjs.com/package/is-private-ip) or equivalent. This is critical to prevent SSRF.
- Reject URLs that resolve to private IPs after DNS resolution (DNS rebinding attack vector).
- Domain rate limit: max 5 audits per domain per day per org (prevent accidental abuse).
- Global rate limit: max 50 audits per day per org.

### 10.3 Secrets

All secrets in environment variables. Never commit. Required:

```
DATABASE_URL=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
ANTHROPIC_API_KEY=
QSTASH_TOKEN=
QSTASH_CURRENT_SIGNING_KEY=
QSTASH_NEXT_SIGNING_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=
RESEND_API_KEY=
INTERNAL_SECRET=          # for render-pdf endpoint
WEB_BASE_URL=
WORKER_BASE_URL=
SENTRY_DSN=
```

### 10.4 Worker hardening

The worker browser is the most exposed surface — it executes JavaScript from arbitrary websites. Mitigations:

- Run Chromium with `--no-sandbox` is unfortunately required in containers but mitigate by running Cloud Run with no service account permissions to GCP resources (separate service account, no IAM grants).
- Egress from worker container should be limited if possible (Cloud Run VPC egress controls, allow-list outbound).
- Never echo page content directly into logs (sanitize).
- Don't pass page content into AI prompts beyond what Stagehand needs (it manages this).
- HAR files may contain auth cookies if any get set — strip `Cookie` and `Authorization` headers from HAR before storing.

---

## 11. Local development

### 11.1 Setup

```bash
# Bootstrap
npm install -g turbo
git clone <repo>
cd ga4-audit
npm install

# Database
docker run -d --name ga4-audit-pg -p 5432:5432 -e POSTGRES_PASSWORD=local postgres:16
# Update DATABASE_URL in .env
npm run db:migrate
npm run db:seed   # creates one user/org for local

# Run frontend
cd apps/web && npm run dev

# Run worker in local mode (no Docker, no QStash)
cd apps/worker && npm run dev
```

### 11.2 Local QStash

Use [QStash dev server](https://upstash.com/docs/qstash/howto/local-development) or skip QStash entirely in dev mode and have the API route call the worker HTTP endpoint directly (gated behind `NODE_ENV=development`).

### 11.3 Test fixtures

Create `apps/worker/test-fixtures/` with 5 known sites and their expected audit outputs. Use these for snapshot tests.

```
test-fixtures/
├── shopify-good/
│   ├── input.json       (just the URL)
│   └── expected.json    (expected findings, asserted by ruleId)
├── shopify-broken-atc/
├── woocommerce-baseline/
├── custom-nextjs/
└── platform-unknown/
```

The 5 ground-truth sites should be picked manually by Saif (operator) and the expected outputs hand-curated to match what the GA Debugger extension shows on those sites. This is the eval set; if a code change breaks any of these, CI fails.

---

## 12. Deployment

### 12.1 Vercel (web)

Standard Next.js deploy. Env vars set in Vercel dashboard. Production branch: `main`.

### 12.2 Cloud Run (worker)

```bash
# Build and push
gcloud builds submit --tag gcr.io/$PROJECT/ga4-audit-worker -f apps/worker/Dockerfile

# Deploy
gcloud run deploy ga4-audit-worker \
  --image gcr.io/$PROJECT/ga4-audit-worker \
  --region us-central1 \
  --memory 4Gi \
  --cpu 2 \
  --timeout 900 \
  --concurrency 1 \
  --max-instances 10 \
  --min-instances 0 \
  --set-env-vars="..." \
  --no-allow-unauthenticated
```

QStash configured to call the worker URL with the appropriate signing keys.

### 12.3 Database migrations

Prisma migrations run against production DB during CI/CD. Use `prisma migrate deploy` in deploy step.

---

## 13. Build order for Claude Code

Don't build everything at once. Build in this order, checkpoint at each step.

1. **Repo skeleton** — Turborepo, packages/db with Prisma schema, packages/audit-core with types, empty apps/web and apps/worker. Get `turbo build` passing.
2. **GA4 parser** — `packages/audit-core/src/ga4-parser.ts` with comprehensive tests against captured raw payloads (provide 5-10 sample payloads in test fixtures). Don't move on until parser tests pass.
3. **Local audit runner** (no queue, no Cloud Run) — A CLI script `apps/worker/src/cli.ts` that takes a URL, runs Stagehand locally, prints captured events to stdout. Test against 3 real sites. **This is the spike — if this doesn't work, nothing else matters.**
4. **Page classification + platform detection** — pure functions in audit-core, unit tests
5. **Rule engine** — implement all rules from section 7.1, snapshot tests against test-fixtures
6. **Audit document assembly** — wire parser + classifier + rules into a complete `AuditDocument`
7. **Database integration** — write audit to Postgres at end of run
8. **Cloud Run worker** — Dockerize, deploy, hook to QStash
9. **Next.js app + Clerk auth** — landing, audits list, audit detail, /api/audits routes
10. **PDF report** — React-PDF components, /api/render-pdf endpoint
11. **End-to-end test** — submit audit from frontend, watch it complete, view PDF
12. **Email notifications** — Resend integration
13. **Hardening** — rate limiting, SSRF protection, error handling, retries

Do NOT skip step 3. The local audit runner is the riskiest part of the system. If it doesn't reliably capture events from real sites, no amount of polish elsewhere matters.

---

## 14. Testing

### 14.1 Unit tests

- GA4 parser: comprehensive coverage of measurement protocol edge cases
- Rule engine: each rule tested with passing and failing audit fixtures
- Page classifier: each page type with multiple platform variations
- Platform detector: each platform with positive and negative samples

### 14.2 Integration tests

- Full audit run against test-fixtures (mocked Stagehand or real headless)
- Database round-trip: audit JSON → DB → reconstructed audit JSON

### 14.3 E2E

- One Playwright test that submits an audit from the frontend and waits for completion (against a known stable site)

### 14.4 Manual eval

Maintain a spreadsheet of audits run manually against real sites with operator-graded "is this finding correct?" column. Track precision/recall over time. This is the most important test loop and lives outside CI.

---

## 15. Known limitations to document in the report

The PDF should include a "limitations" footnote covering:

1. We do not validate `purchase` events because we stop before payment submission. Recommend live test transaction during implementation.
2. We audit a single representative path through the funnel; site-wide coverage is not exhaustive.
3. Some sites use server-side GTM or first-party endpoints that may not match our patterns. We attempt detection but may miss novel implementations.
4. Mobile-only differences are not audited (we test desktop viewport).
5. Authenticated/login-required flows are out of scope.

Being upfront about limitations builds trust and protects against "your audit missed X" complaints.

---

## 16. Appendix: useful references

- [GA4 Measurement Protocol](https://developers.google.com/analytics/devguides/collection/protocol/ga4)
- [GA4 Recommended Events](https://support.google.com/analytics/answer/9267735)
- [GA4 Ecommerce Events Schema](https://developers.google.com/analytics/devguides/collection/ga4/ecommerce)
- [Stagehand docs](https://docs.stagehand.dev/)
- [QStash docs](https://upstash.com/docs/qstash)
- [React-PDF docs](https://react-pdf.org/)
- [Cloud Run + Playwright tutorial](https://cloud.google.com/run/docs/tutorials/) (general; adapt for Stagehand)

---

## 17. What to ask Saif before starting

If anything in this spec is unclear or seems wrong, do not guess. Stop and ask. Specifically:

- The 5 ground-truth test sites — Saif provides these
- The exact Tailwind theme tokens for Unbounded + Plus Jakarta Sans + OKLCH Electric Indigo
- The R2 bucket name, Cloud Run project ID, Vercel project name
- Whether to include the lead-capture flow on the marketing site (out of scope for v1 but if Saif wants it, scope changes)
- Whether the audit should be re-runnable on a schedule (out of scope for v1)

End of spec.
