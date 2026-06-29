# syntax=docker/dockerfile:1
# Multi-stage build producing a minimal, self-contained Next.js standalone image.
# Base image (node:20-slim, Debian) matches the Prisma debian-openssl-3.0.x engine.

FROM node:20-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
# openssl + ca-certificates are required by the Prisma query engine.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# ---- deps: install node_modules + generate the Prisma client ----
# Also used as the "migrator" image (has the Prisma CLI, schema and migrations).
FROM base AS deps
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --legacy-peer-deps
RUN npx prisma generate

# ---- builder: compile the Next standalone bundle ----
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Dummy build-time env. Real values are injected at runtime — these only satisfy
# import-time validation while `next build` evaluates route modules. None are
# NEXT_PUBLIC_*, so nothing here is baked into the output.
ENV GITHUB_CLIENT_ID=build \
    GITHUB_CLIENT_SECRET=build \
    GITHUB_BASE_URL=https://build.invalid \
    GITHUB_API_URL=https://build.invalid/api/v3 \
    TOKEN_ENC_KEY=build \
    LLM_BASE_URL=http://build.invalid/v1 \
    AUTH_SECRET=build \
    NEXT_OUTPUT_STANDALONE=1 \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- runner: minimal standalone server ----
FROM base AS runner
ENV NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0
RUN useradd --create-home --uid 1001 nextjs
# Standalone server + its traced node_modules.
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
# Ensure the generated Prisma client + engine are present (belt-and-suspenders
# in case tracing misses the native engine).
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]
