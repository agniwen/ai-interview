# Build from the monorepo root:
#   docker build -f apps/ai-recruitment-copilot-worker/Dockerfile .

ARG BUN_IMAGE=oven/bun:1.4.0-debian@sha256:5bb0f9be3a1a36a03e27c9a9dd894a3b1ad26657155c7df4dda771e17bf872ef

FROM ${BUN_IMAGE} AS base
WORKDIR /repo

# --- Dependencies ---
FROM base AS deps
COPY .bun-version bun.lock bunfig.toml package.json ./
COPY patches patches
COPY apps/ai-recruitment-copilot/package.json apps/ai-recruitment-copilot/
COPY apps/ai-recruitment-copilot-backend/package.json apps/ai-recruitment-copilot-backend/
COPY apps/ai-recruitment-copilot-desktop/package.json apps/ai-recruitment-copilot-desktop/
COPY apps/ai-recruitment-copilot-worker/package.json apps/ai-recruitment-copilot-worker/
COPY packages/db-schema/package.json packages/db-schema/
COPY packages/meeting-processing-queue/package.json packages/meeting-processing-queue/
COPY packages/resume-parse-queue/package.json packages/resume-parse-queue/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --filter @arc/ai-recruitment-copilot-worker

# --- Build ---
FROM deps AS builder
COPY tsconfig.base.json ./
COPY apps/ai-recruitment-copilot-worker apps/ai-recruitment-copilot-worker
COPY apps/ai-recruitment-copilot-backend apps/ai-recruitment-copilot-backend
COPY packages packages

RUN bun run --filter @arc/ai-recruitment-copilot-worker build
RUN bun -e "const fs = require('node:fs'); const path = require('node:path'); const entry = require.resolve('mupdf', { paths: ['/repo/apps/ai-recruitment-copilot-backend'] }); fs.copyFileSync(path.join(path.dirname(entry), 'mupdf-wasm.wasm'), '/repo/apps/ai-recruitment-copilot-worker/dist/mupdf-wasm.wasm');"

# --- Production dependencies ---
FROM base AS prod-deps
COPY .bun-version bun.lock bunfig.toml package.json ./
COPY patches patches
COPY apps/ai-recruitment-copilot/package.json apps/ai-recruitment-copilot/
COPY apps/ai-recruitment-copilot-backend/package.json apps/ai-recruitment-copilot-backend/
COPY apps/ai-recruitment-copilot-desktop/package.json apps/ai-recruitment-copilot-desktop/
COPY apps/ai-recruitment-copilot-worker/package.json apps/ai-recruitment-copilot-worker/
COPY packages/db-schema/package.json packages/db-schema/
COPY packages/meeting-processing-queue/package.json packages/meeting-processing-queue/
COPY packages/resume-parse-queue/package.json packages/resume-parse-queue/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --production --filter @arc/ai-recruitment-copilot-worker

# --- Production ---
FROM ${BUN_IMAGE} AS runner
WORKDIR /repo

ENV NODE_ENV=production
ENV WORKER_HOST=0.0.0.0
ENV WORKER_PORT=8790
ENV LIBREOFFICE_BIN=/usr/bin/soffice
ENV TZ=UTC

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    fontconfig \
    ffmpeg \
    fonts-noto-cjk \
    libreoffice-calc \
    libreoffice-impress \
    libreoffice-writer \
 && rm -rf /var/lib/apt/lists/*

COPY --from=prod-deps --chown=bun:bun /repo/node_modules ./node_modules
COPY --from=prod-deps --chown=bun:bun /repo/apps/ai-recruitment-copilot-worker/node_modules ./apps/ai-recruitment-copilot-worker/node_modules
COPY --from=builder --chown=bun:bun /repo/apps/ai-recruitment-copilot-worker/dist ./apps/ai-recruitment-copilot-worker/dist

USER bun

EXPOSE 8790

CMD ["bun", "apps/ai-recruitment-copilot-worker/dist/index.mjs"]
