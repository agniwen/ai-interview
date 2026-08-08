# syntax=docker/dockerfile:1
# Build from the monorepo root:
#   docker build -f apps/ai-recruitment-copilot-worker/Dockerfile .

FROM node:22.23.1-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

FROM base AS deps
WORKDIR /repo

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY patches patches
COPY apps/ai-recruitment-copilot-worker/package.json apps/ai-recruitment-copilot-worker/
COPY apps/ai-recruitment-copilot-backend/package.json apps/ai-recruitment-copilot-backend/
COPY packages/db-schema/package.json packages/db-schema/
COPY packages/meeting-processing-queue/package.json packages/meeting-processing-queue/
COPY packages/resume-parse-queue/package.json packages/resume-parse-queue/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile --ignore-scripts

FROM deps AS builder
WORKDIR /repo

COPY tsconfig.base.json ./
COPY apps/ai-recruitment-copilot-worker/tsconfig.json apps/ai-recruitment-copilot-worker/tsdown.config.ts apps/ai-recruitment-copilot-worker/
COPY apps/ai-recruitment-copilot-worker/src apps/ai-recruitment-copilot-worker/src
COPY apps/ai-recruitment-copilot-backend/tsconfig.json apps/ai-recruitment-copilot-backend/
COPY apps/ai-recruitment-copilot-backend/src apps/ai-recruitment-copilot-backend/src
COPY packages/db-schema/tsconfig.json packages/db-schema/
COPY packages/db-schema/src packages/db-schema/src
COPY packages/meeting-processing-queue/tsconfig.json packages/meeting-processing-queue/
COPY packages/meeting-processing-queue/src packages/meeting-processing-queue/src
COPY packages/resume-parse-queue/tsconfig.json packages/resume-parse-queue/
COPY packages/resume-parse-queue/src packages/resume-parse-queue/src
COPY packages/shared/tsconfig.json packages/shared/
COPY packages/shared/src packages/shared/src

RUN pnpm --filter @arc/ai-recruitment-copilot-worker build
RUN node -e "const fs = require('node:fs'); const path = require('node:path'); const entry = require.resolve('mupdf', { paths: ['/repo/apps/ai-recruitment-copilot-backend'] }); fs.copyFileSync(path.join(path.dirname(entry), 'mupdf-wasm.wasm'), '/repo/apps/ai-recruitment-copilot-worker/dist/mupdf-wasm.wasm');"
RUN CI=true pnpm --filter @arc/ai-recruitment-copilot-worker deploy --legacy --prod /prod

FROM node:22.23.1-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV WORKER_HOST="0.0.0.0"
ENV WORKER_PORT=8790
ENV LIBREOFFICE_BIN=/usr/bin/soffice
ENV MEETING_TRANSCRIPTION_FFMPEG_VERSION_PREFIX="ffmpeg version 5.1.9"

ARG FFMPEG_DEBIAN_VERSION="7:5.1.9-0+deb12u1"

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    fontconfig \
    ffmpeg="${FFMPEG_DEBIAN_VERSION}" \
    fonts-noto-cjk \
    libreoffice-calc \
    libreoffice-impress \
    libreoffice-writer \
 && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 worker

COPY --from=builder --chown=worker:nodejs /prod ./

USER worker

EXPOSE 8790

CMD ["node", "dist/index.mjs"]
