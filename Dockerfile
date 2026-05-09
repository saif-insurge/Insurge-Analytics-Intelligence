FROM node:22-slim

# Install Chromium dependencies for Playwright/Stagehand
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
ENV HEADLESS=true
ENV NODE_ENV=production

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.23.0 --activate

WORKDIR /app

# Copy workspace config and lockfile
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY turbo.json ./

# Copy all package.json files for dependency resolution
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/db/package.json ./packages/db/
COPY packages/audit-core/package.json ./packages/audit-core/
COPY apps/worker/package.json ./apps/worker/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/tsconfig/ ./packages/tsconfig/
COPY packages/db/ ./packages/db/
COPY packages/audit-core/ ./packages/audit-core/
COPY apps/worker/ ./apps/worker/

# Generate Prisma client, then build worker + all its workspace dependencies (audit-core, db).
# Turbo respects the dependency graph and builds packages in the right order.
RUN pnpm --filter @ga4-audit/db generate
RUN pnpm exec turbo run build --filter=@ga4-audit/worker

EXPOSE 8080

# Healthcheck reads $PORT so it works whether the platform injects 3000, 8080, etc.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||8080)+'/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "apps/worker/dist/server.js"]
