# Deployment

## Topology

| Component | Host | URL | Region |
|---|---|---|---|
| Web app (Next.js 16) | Coolify on Hetzner VPS | `https://analytics-intel.insurge.io` | EU |
| Worker (Hono + Stagehand) | GCP Cloud Run | `https://worker.analytics-intel.insurge.io` | europe-west1 |
| Postgres | Prisma hosted DB | `db.prisma.io:5432` | EU |
| Queue | Upstash QStash | `qstash.upstash.io` | global |
| Object storage | Cloudflare R2 | `<acct>.r2.cloudflarestorage.com` | global edge |
| Email | Resend | `api.resend.com` | global |
| Residential proxy | Proxycheap | configurable | static IP |

## Env var matrix

| Variable | Web | Worker | Secret | Source / notes |
|---|---|---|---|---|
| `DATABASE_URL` | ✓ | ✓ | ✓ | Prisma DB connection string |
| `CLERK_SECRET_KEY` | ✓ | — | ✓ | clerk.com dashboard |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | ✓ (build-time) | — | — | clerk.com dashboard |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | ✓ (build-time) | — | — | `/sign-in` |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | ✓ (build-time) | — | — | `/sign-up` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` | ✓ (build-time) | — | — | `/audits` |
| `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL` | ✓ (build-time) | — | — | `/audits` |
| `QSTASH_TOKEN` | ✓ | — | ✓ | console.upstash.com — to publish |
| `QSTASH_CURRENT_SIGNING_KEY` | — | ✓ | ✓ | console.upstash.com — to verify |
| `QSTASH_NEXT_SIGNING_KEY` | — | ✓ | ✓ | for key rotation |
| `INTERNAL_SECRET` | ✓ | ✓ | ✓ | Long random string. Same value on both. Used for worker→web PDF render callback |
| `WEB_BASE_URL` | ✓ | ✓ | — | `https://analytics-intel.insurge.io` |
| `WORKER_BASE_URL` | ✓ | ✓ | — | `https://worker.analytics-intel.insurge.io` |
| `OPENAI_API_KEY` | — | ✓ | ✓ | platform.openai.com |
| `ANTHROPIC_API_KEY` | — | optional | ✓ | console.anthropic.com (if using Claude) |
| `GEMINI_API_KEY` | — | optional | ✓ | aistudio.google.com (if using Gemini) |
| `OPENROUTER_API_KEY` | — | optional | ✓ | openrouter.ai (if routing through OpenRouter) |
| `STAGEHAND_MODEL` | — | ✓ | — | `openai/gpt-5.4-mini` (default), `google/gemini-3-flash-preview`, `openrouter/<model>` |
| `RESEND_API_KEY` | ✓ | ✓ | ✓ | resend.com |
| `RESEND_FROM_EMAIL` | ✓ | ✓ | — | `Insurge <no-reply@updates.insurge.io>` |
| `R2_ACCOUNT_ID` | ✓ | ✓ | ✓ | Cloudflare R2 dashboard |
| `R2_ACCESS_KEY_ID` | ✓ | ✓ | ✓ | |
| `R2_SECRET_ACCESS_KEY` | ✓ | ✓ | ✓ | |
| `R2_BUCKET` | ✓ | ✓ | — | bucket name |
| `PROXY_SERVER` | — | ✓ | ✓ | Proxycheap host:port |
| `PROXY_USERNAME` | — | ✓ | ✓ | |
| `PROXY_PASSWORD` | — | ✓ | ✓ | |
| `DISABLE_PROXY` | — | optional | — | Set to `true` to bypass proxy for debugging |
| `HEADLESS` | — | ✓ | — | `true` in prod, `false` for local headed dev |
| `PORT` | auto | ✓ | — | Worker reads $PORT (Coolify/Cloud Run inject this) |
| `SENTRY_DSN` | optional | optional | — | sentry.io |

**`NEXT_PUBLIC_*` vars are baked in at build time.** Mark them as Build Variables in Coolify and redeploy after changing.

## Cloud Run worker — initial setup

Already done; documented for reference / re-creation.

```bash
# Project / billing
gcloud config set project n8n-x-insurge
# (billing must be enabled on the project)

# APIs
gcloud services enable \
  run.googleapis.com \
  artifactregistry.googleapis.com \
  cloudbuild.googleapis.com \
  secretmanager.googleapis.com

# Artifact Registry repo
gcloud artifacts repositories create insurge-analytics \
  --repository-format=docker \
  --location=europe-west1

# First image build (manual)
gcloud builds submit --config=cloudbuild.worker.yaml --region=europe-west1 .

# Deploy
gcloud run deploy worker \
  --image=europe-west1-docker.pkg.dev/n8n-x-insurge/insurge-analytics/worker:latest \
  --region=europe-west1 \
  --allow-unauthenticated \
  --memory=3Gi \
  --cpu=2 \
  --concurrency=2 \
  --timeout=900 \
  --min-instances=0 \
  --max-instances=10 \
  --port=8080 \
  --set-env-vars="HEADLESS=true,NODE_ENV=production,PORT=8080,..."

# Custom domain (DNS CNAME → ghs.googlehosted.com)
gcloud beta run domain-mappings create \
  --service=worker \
  --domain=worker.analytics-intel.insurge.io \
  --region=europe-west1
```

**Resource config rationale:**
- 3Gi RAM, 2 vCPU — Chromium is hungry; one audit needs ~1.5GB peak
- Concurrency 2 per instance — two audits can share a container; new requests spawn a new instance
- Max instances 10 → up to 20 concurrent audits
- Timeout 900s (15 min) — covers slow funnel walks
- Min 0 — idle costs nothing

## Continuous deploy

GitHub trigger configured in the Cloud Run service settings:
- **Build type:** Cloud Build configuration file
- **Build config path:** `cloudbuild.worker.yaml`
- **Branch:** `main`

Every push to `main` → Cloud Build runs `cloudbuild.worker.yaml` → builds fresh image → tags `:$BUILD_ID` and `:latest` → Cloud Run auto-deploys new revision.

## Coolify web — initial setup

```
Build pack:        Dockerfile
Dockerfile path:   apps/web/Dockerfile
Base directory:    /
Ports exposed:     3000
Domain:            https://analytics-intel.insurge.io
```

Env vars set via Coolify UI. `NEXT_PUBLIC_*` vars marked as Build Variables.

DNS: `*.insurge.io` wildcard A record pointing at Hetzner VPS IP. Specific `worker.analytics-intel` is a CNAME → `ghs.googlehosted.com` (overrides wildcard).

## Runbook

### Redeploy

```bash
# Web (Coolify) — push to main, auto-deploys
git push origin main

# Worker (Cloud Run) — push to main, build trigger fires
git push origin main
# OR manual:
gcloud builds submit --config=cloudbuild.worker.yaml --region=europe-west1 .
```

### View logs

```bash
# Worker
gcloud run services logs tail worker --region=europe-west1
# Or last N lines:
gcloud run services logs read worker --region=europe-west1 --limit=100

# Web — via Coolify UI → app → logs
```

### Run a Prisma migration against prod

```bash
# Migration files are checked in. Apply pending ones:
pnpm --filter @ga4-audit/db prisma migrate deploy
# Uses DATABASE_URL from .env (which currently points at prod)
```

### Scale concurrency

```bash
# Increase max instances (e.g. 20 instances × 2 concurrency = 40 simultaneous audits)
gcloud run services update worker \
  --region=europe-west1 \
  --max-instances=20

# Adjust per-instance concurrency
gcloud run services update worker \
  --region=europe-west1 \
  --concurrency=3
```

### Roll back to a previous revision

```bash
gcloud run services list-revisions --service=worker --region=europe-west1
gcloud run services update-traffic worker \
  --region=europe-west1 \
  --to-revisions=<revision-name>=100
```

### Rotate a secret

If using Cloud Run env vars directly:
```bash
gcloud run services update worker --region=europe-west1 \
  --update-env-vars="OPENAI_API_KEY=<new-key>"
```

If using Secret Manager:
```bash
echo -n "<new-value>" | gcloud secrets versions add OPENAI_API_KEY --data-file=-
# Then redeploy so the latest version is picked up
gcloud run services update worker --region=europe-west1
```

### Health check

```bash
# Worker
curl https://worker.analytics-intel.insurge.io/health
# Should return: {"status":"ok","timestamp":"..."}

# Web — visit the homepage in browser
```

## Common issues

| Symptom | Likely cause | Fix |
|---|---|---|
| Worker container OOM-killed | Too many concurrent audits per instance | Reduce `--concurrency`, or increase `--memory` |
| Cloud Run cold start ~5-8s | First request to scaled-to-zero instance | Set `--min-instances=1` if you want zero cold starts (costs more) |
| Worker says `Cannot find module '...types.js'` | Workspace package wasn't built | Ensure `cloudbuild.worker.yaml` runs `turbo run build --filter=worker` |
| Web build fails with `useSearchParams not in Suspense` | Next.js production build requirement | Wrap the page content in `<Suspense>` |
| Custom domain returns 503 / 000 | SSL cert still provisioning (5-15 min after DNS) | Wait, then retry |
| `prisma.apiKey is undefined` after schema change | Stale Prisma client in dev server | Restart `pnpm dev` |
