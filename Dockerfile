# ── dependencies ─────────────────────────────────────────────────────────────
FROM node:22-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY package.json package-lock.json ./
RUN npm ci

# ── build ────────────────────────────────────────────────────────────────────
FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Prisma needs a URL to generate; the real one is injected at runtime.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build?schema=public"
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npx next build

# ── migrator ─────────────────────────────────────────────────────────────────
# The Prisma CLI needs its full dependency tree, which the standalone runtime
# image deliberately does not carry. It runs once, as its own container, before
# the app starts.
FROM build AS migrator
WORKDIR /app
ENV NODE_ENV=production
ENTRYPOINT ["npx", "prisma", "db", "push", "--schema=./prisma/schema.prisma", "--skip-generate", "--accept-data-loss"]

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache openssl curl && \
    addgroup -g 1001 -S aayu && \
    adduser -u 1001 -S aayu -G aayu

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV AAYU_DATA_DIR=/data/uploads

COPY --from=build --chown=aayu:aayu /app/.next/standalone ./
COPY --from=build --chown=aayu:aayu /app/.next/static ./.next/static
COPY --from=build --chown=aayu:aayu /app/public ./public
COPY --chown=aayu:aayu docker/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh && mkdir -p /data/uploads && chown -R aayu:aayu /data

USER aayu
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/api/health || exit 1

ENTRYPOINT ["./entrypoint.sh"]
