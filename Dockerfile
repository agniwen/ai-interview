FROM node:22-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

# --- Dependencies ---
FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/ai-interview/package.json ./apps/ai-interview/
COPY packages/adapter-feishu/package.json ./packages/adapter-feishu/
# --ignore-scripts skips the `prepare` hook (lefthook install) which needs git
# and is only used for local git hooks, not CI/runtime.
RUN pnpm install --frozen-lockfile --ignore-scripts

# --- Build ---
FROM base AS builder
WORKDIR /app
# Pull the entire installed workspace (root + per-package node_modules) from deps,
# then overlay the actual source. .dockerignore excludes node_modules so the
# COPY . . won't clobber the installed deps.
COPY --from=deps /app ./
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo run build --filter=ai-interview

# --- Production ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Next.js standalone output (with outputFileTracingRoot at monorepo root)
# produces a self-contained tree at apps/ai-interview/.next/standalone/
# mirroring the workspace layout (apps/ai-interview/server.js plus hoisted
# node_modules). public/ and .next/static/ must be copied manually.
COPY --from=builder --chown=nextjs:nodejs /app/apps/ai-interview/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/ai-interview/.next/static ./apps/ai-interview/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/ai-interview/public ./apps/ai-interview/public

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "apps/ai-interview/server.js"]
