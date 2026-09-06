# CASHNET API Server — Production Dockerfile
# Multi-stage build for minimal production image.

FROM node:22-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@11.19.0 --activate

# Copy workspace config
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY lib/ lib/
COPY artifacts/api-server/package.json artifacts/api-server/

# Install dependencies
RUN pnpm install --frozen-lockfile --prod=false

# Copy source
COPY artifacts/api-server/ artifacts/api-server/
COPY database/ database/

# Build
RUN pnpm --filter @workspace/api-server run build

# ── Production stage ─────────────────────────────────────────────────────────
FROM node:22-alpine AS production
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@11.19.0 --activate

# Non-root user for security
RUN addgroup -g 1001 cashnet && adduser -u 1001 -G cashnet -s /bin/sh -D cashnet

# Copy built artifacts
COPY --from=builder /app/pnpm-workspace.yaml /app/package.json /app/pnpm-lock.yaml ./
COPY --from=builder /app/lib/ lib/
COPY --from=builder /app/artifacts/api-server/package.json artifacts/api-server/
COPY --from=builder /app/artifacts/api-server/dist/ artifacts/api-server/dist/
COPY --from=builder /app/database/ database/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --prod

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/healthz || exit 1

USER cashnet
EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "artifacts/api-server/dist/index.mjs"]
