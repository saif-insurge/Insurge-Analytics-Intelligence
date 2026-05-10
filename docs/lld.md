# Low-Level Design

How each major module works internally. File paths are linked; line numbers reference the state at time of writing — re-grep if drift suspected.

---

## Worker — `apps/worker/`

### `audit-runner.ts` — pipeline orchestration

Orchestrates one full audit. Called by both the HTTP server (production) and the local CLI (dev).

**Flow:**
1. Initializes Stagehand with stealth init script + browser flags + viewport + Proxycheap proxy if configured
2. Connects Playwright to Stagehand's CDP endpoint
3. Attaches **dual** request listeners — context-level (catches main frame + new tabs) AND page-level (catches cross-origin iframes / OOPIFs). Dedupes via `url|postData` set.
4. Runs the funnel agent (`runFunnelAgent`) — captures HAR throughout
5. Post-walk: parses GA4 events from the complete HAR using `isGa4Endpoint` + `parseGa4Request`. Deterministic — no race conditions vs `pwContext.route()` interception
6. Detects ad pixels / CDPs from `allRequestUrls` via `detectAnalyticsPlatforms`
7. Runs rule engine via `assembleAuditDocument(rawCapture)`
8. Two-call AI analysis (`analyzeNetworkRequests`)
9. Persists to Postgres via `persistAudit`
10. Sends email if `notifyEmail` set
11. Diagnostic logging: counts of GA4 URLs, analytics-domain hits, sample URLs (helps debug capture issues)

**Stealth measures:**
- Init script masks `navigator.webdriver`, plugins, languages, `window.chrome`, permissions
- Browser flags: `--disable-blink-features=AutomationControlled`, `--disable-features=IsolateOrigins`
- Viewport `1440×900`, locale `en-US`
- Proxycheap residential proxy when `PROXY_SERVER` set

**Gotchas:**
- HEADLESS env var must be `false` to run headed locally; defaults to `true` (headless) for prod
- Custom domain proxy auth done via `setHTTPCredentials` as fallback to Stagehand's proxy config
- Some sites (Shopify Web Pixels iframe) selectively suppress GA4 destinations for automated sessions even when Meta/Google Ads still fire — observed on `isharya.co`. Not a bug in our capture; it's site-side behavior.

### `funnel-agent.ts` — Stagehand autonomous agent

Replaces brittle hardcoded step-by-step navigation with an LLM-driven agent in **hybrid mode** (DOM + vision-based coordinate clicking).

**Custom tools the agent can call:**
| Tool | Purpose |
|---|---|
| `logStep` | Records what just happened. Reads the actual browser URL (not the agent's self-reported one) to prevent hallucination. |
| `getEvents` | Returns GA4 events + ad pixel activity captured so far. Optional `waitForNewEvents` triggers built-in 2× 3s retry for slow GTM events. |
| `checkUrl` | Verifies URL changed after a click (catches variant-selector clicks that look like navigation). |
| `verifyCartChange` | Runs JS in the page to check for cart badge updates, drawer visibility, "added to cart" text — confirms ATC actually worked before the agent claims success. |

**System prompt structure:** numbered steps (HOME → CATEGORY → PDP → ATC → BUY NOW → CART → CHECKOUT) with explicit warnings (don't click variant selectors, don't navigate directly to /cart, never click Pay Now).

**Output schema:** Zod `auditResultSchema` — pages visited, actions performed, cart type (page/drawer), reached checkout, issues encountered.

### `ga4-parser.ts` — Measurement Protocol parsing

Pure function. Single entry point: `parseGa4Request(url, postBody?)`.

Handles four transports:
1. **`/g/collect` GET** — params in URL query string
2. **`/g/collect` POST** — newline-separated URL-encoded payloads (one event per line). Real-world Shopify/GTM batch up to 5 events per request.
3. **`/mp/collect`** — Measurement Protocol JSON body with `events[]` array
4. **First-party proxies** — any URL with `tid=G-` query param (catches custom GA4 endpoints like `clovia.com`'s setup)

Item parsing handles tilde-separated, 2-char prefix encoding (e.g., `id12345~nmBlue+Widget~pr49.99~qt1`) plus 3-char nested categories (`ca2`, `ca3`...).

53 unit tests in `ga4-parser.test.ts`.

### `analytics-detector.ts` — multi-platform detection

Pattern-matches network URLs to detect 20+ analytics platforms across categories: CDPs (Rudderstack, Segment), analytics (GA4, Mixpanel), ads (Meta Pixel, Google Ads, TikTok, Snapchat), pixels, tag managers. Enhanced event extraction per platform (`ev=` for Meta, `event=` for TikTok, etc.).

Used in two places:
- `audit-runner.ts` post-walk — for the report's "Detected Platforms" section
- `funnel-agent.ts` `getEvents` tool — to give the agent visibility into ad pixels firing in real time

### `assembler.ts` — RawAuditCapture → AuditDocument

Pure function in `packages/audit-core/`. Takes the raw events + page records, runs all rules, computes the scorecard, builds the typed `AuditDocument`. Snapshot-tested.

### Rule engine — `packages/audit-core/src/rules/`

Each rule is a pure function: `(capture: RawAuditCapture) => Finding[]`. Easy to add new rules (drop in a file, register in `index.ts`). Snapshot tests guard against regressions.

### `ai-analysis.ts` — two-call OpenAI pattern

OpenAI doesn't allow web search + JSON mode in the same call. So:
1. **Call 1** — free-form prompt with `web_search` tool enabled. Asks for ecosystem context: known platforms, common implementation patterns, what to look for.
2. **Call 2** — structured prompt with JSON schema. Takes call 1's output as context, returns `{summary, insights[], detectedPlatforms[], ga4Present, tokensUsed, ...}`.

Tracks input/output tokens and cost.

---

## Web app — `apps/web/`

### Audit submission — `app/api/audits/route.ts` and `app/api/v1/audits/route.ts`

Both routes share the same logic via `lib/audit-submit.ts` (`createAudit`, `ensureOrgAndUser`) and `lib/audit-schemas.ts` (Zod schemas).

- `/api/audits` — Clerk-authed (UI submits)
- `/api/v1/audits` — API-key-authed (`requireApiKey` from `lib/api-auth.ts`)

Both:
1. Validate single or bulk submission shape
2. Upsert org/user
3. Create Audit row
4. Publish to QStash (or fire-and-forget direct fetch to worker if `QSTASH_TOKEN` not set)

### API key auth — `lib/api-auth.ts` + `lib/api-keys.ts`

- `generateApiKey()` returns `{plaintext, hash, prefix}`. Plaintext is `ina_live_<base64url(32 random bytes)>`. Stored as SHA-256 hex.
- `requireApiKey(req)` reads `Authorization: Bearer <key>` header, hashes, looks up, returns `{organizationId, apiKeyId, createdById}`. Updates `lastUsedAt` fire-and-forget.
- Returns `ApiAuthError(401)` on missing/malformed/invalid/revoked keys.

### Audit detail page — `app/audits/[id]/page.tsx`

Polls `GET /api/audits/:id` every 3s while status is in-progress. Renders:
- Editorial-style header with score and grade
- Funnel walk log (expandable, with observations)
- AI analysis ("Tracking Intelligence")
- Ad pixels detected
- **Ecommerce Events Checklist** — green for detected, red for not-detected, with item counts
- All Captured Events
- Findings grouped by category

### Public report — `app/report/[id]/page.tsx`

Same data, no auth, branded for prospect-facing sharing. CTA at bottom.

---

## Database — `packages/db/`

Lazy PrismaClient via Proxy pattern (`src/index.ts`) — defers initialization until first query so importing the module doesn't crash if `DATABASE_URL` isn't yet loaded (helps with Next.js cold-start order).

Migrations live in `prisma/migrations/`. See [database.md](./database.md) for schema reference.

---

## Bot detection observations

Empirically observed during development:
- **Cloudflare** challenges flag automated sessions on some sites (e.g. `isharya.com` triggered "Verify you are human" mid-walk). Stealth init script + residential proxy reduces frequency but doesn't eliminate.
- **Shopify Web Pixels Custom Pixel** sandbox can selectively suppress GA4 destinations while still firing Meta Pixel and Merchant Center from the same iframe. Reproducible on `isharya.co`. Likely cookie/fingerprint-based heuristic at the destination filter level.
- **Allbirds + Sugar Cosmetics** (also Shopify Web Pixels) work fine — site-specific config matters.

If a site silently drops events, check DevTools manually first to rule out site-side suppression vs our capture issue.
