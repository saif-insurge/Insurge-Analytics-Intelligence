FROM node:22-slim

# pnpm via corepack (built into Node 22)
RUN corepack enable && corepack prepare pnpm@10.23.0 --activate

WORKDIR /app

ENV NODE_ENV=production

# Copy workspace config and lockfile first for better caching
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY turbo.json ./

# Copy all package.json files for dependency resolution
COPY packages/tsconfig/package.json ./packages/tsconfig/
COPY packages/db/package.json ./packages/db/
COPY packages/audit-core/package.json ./packages/audit-core/
COPY packages/pdf/package.json ./packages/pdf/
COPY apps/web/package.json ./apps/web/

# Install all deps (workspace symlinks intact)
RUN pnpm install --frozen-lockfile

# Copy source for the web app and its workspace dependencies
COPY packages/tsconfig/ ./packages/tsconfig/
COPY packages/db/ ./packages/db/
COPY packages/audit-core/ ./packages/audit-core/
COPY packages/pdf/ ./packages/pdf/
COPY apps/web/ ./apps/web/

# Generate Prisma client, then build web (and its workspace deps via turbo).
RUN pnpm --filter @ga4-audit/db generate
RUN pnpm exec turbo run build --filter=@ga4-audit/web

EXPOSE 3000

# Healthcheck reads $PORT so it matches whatever Coolify injects (3000 by default).
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD node -e "require('http').get('http://localhost:'+(process.env.PORT||3000)+'/', r => process.exit(r.statusCode < 500 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["pnpm", "--filter", "@ga4-audit/web", "start"]
