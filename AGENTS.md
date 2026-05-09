# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Read first

The complete build specification is in `GA4_AUDIT_SPEC.md` at the repo root. Read it end-to-end before writing any code. It is the source of truth for architecture, data models, file structure, build order, and locked technical decisions.

## Project overview

GA4 Ecommerce Tracking Audit System — a web tool that audits GA4 ecommerce tracking on any website by running a synthetic browser shopper (Stagehand + Playwright), capturing GA4 events via network interception, analyzing them with a rule engine, and producing a PDF audit report.

## Architecture

Turborepo monorepo with this structure:

```
ga4-audit/
├── apps/
│   ├── web/              # Next.js 14+ App Router (frontend + API routes, Vercel)
│   └── worker/           # Cloud Run worker (Hono HTTP server + Stagehand browser runner)
├── packages/
│   ├── db/               # Prisma schema + client (shared between web and worker)
│   ├── audit-core/       # GA4 parser, rule engine, shared types (AuditDocument schema)
│   ├── pdf/              # React-PDF report components
│   └── tsconfig/
```

Key data flow: URL submitted → QStash enqueues → Cloud Run worker runs Stagehand audit → rule engine analyzes → artifacts uploaded to R2 → PDF rendered via Vercel function → email sent via Resend.

## Commands

```bash
# Install
pnpm install

# Build all packages
turbo build

# Typecheck (run after every change)
pnpm typecheck

# Tests
pnpm test

# Dev servers
cd apps/web && pnpm dev        # Next.js frontend
cd apps/worker && pnpm dev     # Worker in local mode

# Database
pnpm db:migrate                # Run Prisma migrations
pnpm db:seed                   # Seed local dev data

# Local audit CLI (no queue, no Docker)
cd apps/worker && npx ts-node src/cli.ts <URL>
```

## Tech stack (locked — do not swap without explicit confirmation)

- **Frontend:** Next.js 14+ App Router, TypeScript, Tailwind
- **Auth:** Clerk
- **Database:** Postgres + Prisma (Neon or Supabase)
- **Queue:** Upstash QStash
- **Worker:** Cloud Run + Stagehand + Playwright + Chromium
- **AI navigation:** Anthropic Codex Sonnet via Stagehand
- **PDF:** React-PDF (`@react-pdf/renderer`)
- **Storage:** Cloudflare R2
- **Email:** Resend
- **Package manager:** pnpm (Turborepo)

## Code conventions

- TypeScript strict mode everywhere. No `any` unless justified in a comment.
- Prefer named exports over default exports.
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`.
- Every public function gets a TSDoc comment with one sentence of intent.
- Every API route validates input with Zod. No untyped request bodies.
- Errors propagate with context — catch and re-throw with `cause`, never swallow.
- No `console.log` in committed code. Use structured logger (`pino` or similar).
- Data modeled with `organizationId` on every entity for future multi-tenancy.
- Use cuid IDs everywhere except Clerk-owned models.

## Critical safety boundaries

1. **Payment stop-list** (deterministic code, NOT AI-decided): The synthetic shopper must never click purchase-completion buttons. Stop-list patterns live in code and gate every `page.act()` call.
2. **SSRF prevention**: Validate URLs are HTTPS, not localhost/private IPs, including post-DNS-resolution check.
3. **Incognito only**: Never persist cookies between audits. Never log in.
4. **HAR sanitization**: Strip `Cookie` and `Authorization` headers before storing.

## Build order (follow sequentially, checkpoint at each step)

See `GA4_AUDIT_SPEC.md` section 13 for the full 13-step build order. Do NOT skip step 3 (local audit runner) — it's the riskiest part. If it doesn't reliably capture events from real sites, nothing else matters.

## What matters most (priority order)

1. GA4 parser correctness — foundation of all findings
2. Synthetic shopper working on real sites — riskiest unknown
3. Payment stop-list working — hard safety boundary
4. Rule engine being modular — pure functions, snapshot tests, drop-in new rules

## Decision-making rules

- Locked decisions in the spec are not up for re-litigation.
- When the spec is unclear, ask before guessing.
- When something is outside the spec (API changes, new constraints), flag and propose options.
- Never add a top-level dependency outside the spec without asking.
- Never modify the audit JSON schema types without bumping the `version` field.
- Never skip writing tests for the parser or rule engine.

## Terminology

- **Audit**: One run of the system against one URL
- **Capture**: A single GA4 event observed firing during an audit
- **Finding**: A rule-engine output (has severity and status, not "level" or "result")
- **Canonical event**: Standard GA4 ecommerce event name (view_item_list, view_item, add_to_cart, view_cart, begin_checkout, add_payment_info, purchase)
- **Synthetic shopper**: The Stagehand-driven browser walking the funnel
- **Stop-list**: Deterministic guardrail preventing purchase-completion clicks
