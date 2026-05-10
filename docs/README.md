# Insurge Analytics Intelligence — Documentation

A SaaS platform that audits GA4 ecommerce tracking on any website. Submit a URL, an autonomous browser walks the shopping funnel, captures every analytics event, and produces a scored audit report you can ship to stakeholders.

## Documentation

| Doc | Purpose |
|---|---|
| [architecture.md](./architecture.md) | High-level system design, components, data flow, audit lifecycle |
| [lld.md](./lld.md) | Low-level design — how each major module works internally |
| [database.md](./database.md) | Prisma schema reference + JSON column shapes |
| [deployment.md](./deployment.md) | Production setup (Cloud Run worker + Coolify web), env vars, runbook |
| [api.md](./api.md) | External REST API reference for programmatic audit submission |

## Quick orientation

- **Languages:** TypeScript (strict mode) everywhere
- **Monorepo:** Turborepo with pnpm workspaces — `apps/web`, `apps/worker`, `packages/audit-core`, `packages/db`, `packages/pdf`
- **Web app:** Next.js 16 App Router, deployed on Coolify (Hetzner VPS) at `analytics-intel.insurge.io`
- **Worker:** Hono HTTP server + Stagehand + Playwright/Chromium, deployed on Cloud Run at `worker.analytics-intel.insurge.io`
- **Database:** Postgres on Prisma's hosted DB
- **Queue:** Upstash QStash (with HTTP fallback for dev)
- **Auth (web):** Clerk
- **Auth (API):** per-org API keys (`ina_live_*`)
- **AI:** Stagehand uses GPT-5.4 / Gemini 3 / Claude Sonnet 4.6 (configurable)

## Local development

```bash
pnpm install
pnpm db:migrate        # apply migrations
pnpm dev               # all packages in watch mode

# Or per-app
cd apps/web && pnpm dev
cd apps/worker && pnpm dev
```

Local CLI for testing the audit pipeline without the web UI:
```bash
cd apps/worker && pnpm cli <URL>
```

## Repo conventions

- TypeScript strict mode, no `any` without justification
- Conventional commits: `feat:`, `fix:`, `chore:`, `refactor:`
- Every public function gets a one-sentence TSDoc
- Zod for all API input validation
- Pino for structured logging (no `console.log` in committed code)
- `organizationId` on every entity (multi-tenancy foundation)
