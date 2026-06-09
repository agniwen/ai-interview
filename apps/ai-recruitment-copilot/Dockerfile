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

RUN pnpm --filter @arc/ai-recruitment-copilot build

# --- Production ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 startjs

# TanStack Start with Nitro emits a standalone Node server in `.output`.
COPY --from=builder --chown=startjs:nodejs /repo/apps/ai-recruitment-copilot/.output ./.output

USER startjs

EXPOSE 3000
ENV PORT=3000
ENV HOST="0.0.0.0"

CMD ["node", ".output/server/index.mjs"]
