# syntax=docker/dockerfile:1
# 中文：构建上下文为仓库根，例如 `docker build -f apps/ai-recruitment-copilot/Dockerfile .`
# English: build from the monorepo root, e.g.
#   docker build -f apps/ai-recruitment-copilot/Dockerfile .

FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# --- Dependencies ---
FROM base AS deps
WORKDIR /repo
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/ai-recruitment-copilot/package.json apps/ai-recruitment-copilot/
COPY apps/ai-recruitment-copilot-backend/package.json apps/ai-recruitment-copilot-backend/
COPY packages packages
# --ignore-scripts skips the `prepare` hook (lefthook install) which needs git
# and is only used for local git hooks, not CI/runtime.
RUN pnpm install --frozen-lockfile --ignore-scripts

# --- Build ---
FROM base AS builder
WORKDIR /repo
# Carry over the fully-installed workspace from deps (root + per-workspace node_modules,
# including packages/*/node_modules that pnpm symlinks into each package).
COPY --from=deps /repo /repo
# Layer in root config / lockfile / shared tsconfig and the app source.
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps/ai-recruitment-copilot ./apps/ai-recruitment-copilot
COPY apps/ai-recruitment-copilot-backend ./apps/ai-recruitment-copilot-backend

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm --filter @arc/ai-recruitment-copilot build

# --- Production ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 nextjs

# Next.js standalone output (with outputFileTracingRoot = repo root) lands the
# server entry at apps/ai-recruitment-copilot/server.js inside .next/standalone.
COPY --from=builder --chown=nextjs:nodejs /repo/apps/ai-recruitment-copilot/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/apps/ai-recruitment-copilot/.next/static ./apps/ai-recruitment-copilot/.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/apps/ai-recruitment-copilot/public ./apps/ai-recruitment-copilot/public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/ai-recruitment-copilot/server.js"]
