# Microsoft's official Playwright base image — comes with the matching Chromium
# pre-installed at the path Playwright expects. This is what production browser
# automation services (Browserless, etc.) use on Cloud Run.
#
# Why we switched: Debian's `chromium` package hangs silently on Cloud Run gen2.
# `chromium --version` would time out with no stderr. The Playwright-bundled
# Chromium just works.
FROM mcr.microsoft.com/playwright:v1.59.1-noble

# Install OpenSSL for Prisma + ca-certificates for outbound HTTPS.
# Most Chromium deps are already in the base image.
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

ENV HEADLESS=true
ENV NODE_ENV=production

# pnpm via corepack (Node is pre-installed in the Playwright image).
RUN corepack enable && corepack prepare pnpm@10.23.0 --activate

WORKDIR /app

# Copy workspace config + lockfile first for caching.
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY turbo.json ./

# Copy package.json for each workspace package so pnpm can resolve the graph.
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/db/package.json ./packages/db/
COPY packages/audit-core/package.json ./packages/audit-core/
COPY apps/worker/package.json ./apps/worker/

RUN pnpm install --frozen-lockfile

# Copy source for the worker and its workspace dependencies.
COPY packages/tsconfig/ ./packages/tsconfig/
COPY packages/db/ ./packages/db/
COPY packages/audit-core/ ./packages/audit-core/
COPY apps/worker/ ./apps/worker/

# Generate Prisma client, then build worker + transitive workspace deps via turbo.
RUN pnpm --filter @ga4-audit/db generate
RUN pnpm exec turbo run build --filter=@ga4-audit/worker

EXPOSE 8080

# Healthcheck reads $PORT so it works whether the platform injects 3000, 8080, etc.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||8080)+'/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "apps/worker/dist/server.js"]
