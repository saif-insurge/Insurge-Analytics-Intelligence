# Database

Postgres on Prisma's hosted DB. Schema lives in `packages/db/prisma/schema.prisma`. Migrations in `packages/db/prisma/migrations/`.

## Models

### `Organization`

Multi-tenancy root. Currently one org per Clerk user (auto-created on first audit). Schema is ready for proper multi-org but the UI assumes one.

| Column | Type | Purpose |
|---|---|---|
| `id` | `String` (PK) | Clerk org ID, or `org_<userId>` fallback |
| `name` | `String` | Display name (defaults to "Default") |
| `createdAt` | `DateTime` | |

Relations: `audits[]`, `apiKeys[]`

### `User`

Mirrors Clerk user; we copy the ID and (best-effort) email. `email` defaults to the Clerk user ID if we can't fetch the real email at submit time.

| Column | Type | Purpose |
|---|---|---|
| `id` | `String` (PK) | Clerk user ID |
| `email` | `String` (unique) | |
| `organizationId` | `String` (FK → Organization) | |
| `createdAt` | `DateTime` | |

Relations: `audits[]`

### `Audit`

The core entity — one row per audit run.

| Column | Type | Purpose |
|---|---|---|
| `id` | `cuid` | |
| `organizationId` | FK | Multi-tenant scoping |
| `createdById` | FK → User | Who submitted |
| `url` | `String` | URL to audit |
| `domain` | `String` | Extracted from URL for filtering |
| `status` | `AuditStatus` enum | PENDING → RUNNING → ANALYZING → RENDERING → COMPLETE / FAILED |
| `queuedAt` | `DateTime` (default now) | |
| `startedAt` / `completedAt` / `failedAt` | `DateTime?` | Lifecycle timestamps |
| `failureReason` | `String?` | Error message when FAILED |
| `platform` / `platformConfidence` | `String?` | Detected platform (Shopify, WooCommerce, custom, etc.) |
| `rawJsonKey` / `harFileKey` / `screenshotsKey` / `pdfReportKey` | `String?` | R2 storage keys |
| `overallScore` | `Int?` | 0-100 |
| `overallGrade` | `String?` | A-F |
| `findings` | relation → Finding[] | Rule-engine outputs |
| `events` | `Json?` | Captured GA4 events — see shape below |
| `pages` | `Json?` | Page records |
| `aiAnalysis` | `Json?` | AI-generated insights |
| `detectedPlatforms` | `Json?` | Ad pixels, CDPs, tag managers |
| `funnelLog` | `Json?` | Step-by-step agent walk log |
| `operatorNotes` | `String?` | User-provided context |

Indexes: `[organizationId, queuedAt]`, `[status]`

### `Finding`

One row per rule-engine output. Tied to its parent audit.

| Column | Type | Purpose |
|---|---|---|
| `id` | `cuid` | |
| `auditId` | FK → Audit (cascade delete) | |
| `ruleId` | `String` | Stable identifier of the rule |
| `category` | `String` | Implementation Coverage / Data Quality / Platform & Infra / Feature Adoption |
| `severity` | `String` | critical / high / medium / low / info |
| `status` | `String` | passed / failed / not-applicable |
| `title` | `String` | Headline |
| `summary` | `Text` | What was checked, what was found |
| `evidence` | `Json` | Rule-specific data backing the finding |
| `impact` | `Text?` | Why it matters for the user |
| `fix` | `Json?` | Platform-specific remediation guidance |

### `ApiKey`

External API authentication. Per-organization, soft-revocable.

| Column | Type | Purpose |
|---|---|---|
| `id` | `cuid` | |
| `organizationId` | FK → Organization (cascade) | |
| `createdById` | `String` | Who created it (Clerk user ID) |
| `name` | `String` | Human-readable label |
| `prefix` | `String` | First 12 chars of plaintext (for UI display, e.g., `ina_live_xY8z`) |
| `keyHash` | `String` (unique) | SHA-256 hex of the plaintext |
| `lastUsedAt` | `DateTime?` | Updated fire-and-forget on each successful auth |
| `revokedAt` | `DateTime?` | Soft delete — non-null disables the key |
| `createdAt` | `DateTime` | |

Indexes: `[organizationId]`, `[keyHash]`

## JSON column shapes

Defined as TypeScript types in `packages/audit-core/src/types.ts`:

| Column | Shape |
|---|---|
| `Audit.events` | `CapturedEvent[]` — `{id, pageId, timestamp, transport, endpoint, tid, name, params, items, raw}` |
| `Audit.pages` | `PageRecord[]` — page snapshots with funnel step, signals, dataLayer entries |
| `Audit.aiAnalysis` | `AiAnalysisData` — `{summary, ga4Present, insights[], tokensUsed, inputTokens, outputTokens, estimatedCostUsd}` |
| `Audit.detectedPlatforms` | `DetectedPlatformData[]` — `{name, category, requestCount, sampleUrls, detectedEvents}` |
| `Audit.funnelLog` | `FunnelStepLog[]` — `{step, name, instruction, observation, urlBefore, urlAfter, success, error, timestamp, durationMs}` |

Note: external API (`/api/v1/audits/:id`) redacts `funnelLog.instruction` (internal LLM prompts) — only outcomes are returned.

## Migrations

### Local development

```bash
# After editing schema.prisma
pnpm --filter @ga4-audit/db prisma migrate dev --name <descriptive_name>
```

This creates the migration file AND applies it to your local DATABASE_URL (which currently points at Prisma hosted DB — be careful, see below).

### Production

```bash
# From local machine, point DATABASE_URL at prod, run:
pnpm --filter @ga4-audit/db prisma migrate deploy
```

This applies pending migrations without prompting (no destructive operations).

### Important

The current `DATABASE_URL` in `.env` points at the **production Prisma DB**. There's no separate dev DB. Running `migrate dev` applies to prod immediately. Safe for additive changes (new tables, new columns) but be very careful with renames/drops.

If you need a local dev DB, spin up Postgres locally and override `DATABASE_URL` in a separate `.env.local`.

## Generated client location

Prisma 7 outputs the client into `node_modules/.pnpm/@prisma+client@.../node_modules/.prisma/client/`. Importing from `@prisma/client` re-exports from there.

Run `pnpm --filter @ga4-audit/db generate` after schema changes to regenerate the typed client. **Restart `pnpm dev` after generating** — tsx caches the client and won't pick up new models otherwise.
