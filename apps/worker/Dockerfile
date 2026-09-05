# Build from the monorepo root:
#   docker build -f apps/worker/Dockerfile .

ARG BUN_IMAGE=oven/bun:1.4.0-debian@sha256:5bb0f9be3a1a36a03e27c9a9dd894a3b1ad26657155c7df4dda771e17bf872ef

FROM ${BUN_IMAGE} AS base
WORKDIR /repo

# --- Dependencies ---
FROM base AS deps
COPY .bun-version bun.lock bunfig.toml package.json ./
COPY patches patches
COPY apps/worker/package.json apps/worker/
COPY apps/server/package.json apps/server/
COPY packages/ai-runtime/package.json packages/ai-runtime/
COPY packages/database/package.json packages/database/
COPY packages/db-schema/package.json packages/db-schema/
COPY packages/meeting-live-transcript/package.json packages/meeting-live-transcript/
COPY packages/meeting-media/package.json packages/meeting-media/
COPY packages/meeting-processing/package.json packages/meeting-processing/
COPY packages/meeting-processing-queue/package.json packages/meeting-processing-queue/
COPY packages/object-storage/package.json packages/object-storage/
COPY packages/resume-parse-queue/package.json packages/resume-parse-queue/
COPY packages/resume-processing/package.json packages/resume-processing/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --filter @app/worker

# --- Build ---
FROM deps AS builder
COPY tsconfig.base.json ./
COPY apps/worker apps/worker
COPY apps/server apps/server
COPY packages packages

RUN bun run --filter @app/worker build
RUN bun -e "const fs = require('node:fs'); const path = require('node:path'); const entry = require.resolve('mupdf', { paths: ['/repo/packages/resume-processing'] }); fs.copyFileSync(path.join(path.dirname(entry), 'mupdf-wasm.wasm'), '/repo/apps/worker/dist/mupdf-wasm.wasm');"

# --- Production dependencies ---
FROM base AS prod-deps
COPY .bun-version bun.lock bunfig.toml package.json ./
COPY patches patches
COPY apps/worker/package.json apps/worker/
COPY apps/server/package.json apps/server/
COPY packages/ai-runtime/package.json packages/ai-runtime/
COPY packages/database/package.json packages/database/
COPY packages/db-schema/package.json packages/db-schema/
COPY packages/meeting-live-transcript/package.json packages/meeting-live-transcript/
COPY packages/meeting-media/package.json packages/meeting-media/
COPY packages/meeting-processing/package.json packages/meeting-processing/
COPY packages/meeting-processing-queue/package.json packages/meeting-processing-queue/
COPY packages/object-storage/package.json packages/object-storage/
COPY packages/resume-parse-queue/package.json packages/resume-parse-queue/
COPY packages/resume-processing/package.json packages/resume-processing/
COPY packages/shared/package.json packages/shared/
RUN bun install --frozen-lockfile --production --filter @app/worker

# --- Production ---
FROM ${BUN_IMAGE} AS runner
WORKDIR /repo

ENV NODE_ENV=production
ENV WORKER_HOST=0.0.0.0
ENV WORKER_PORT=8790
ENV LIBREOFFICE_BIN=/usr/bin/soffice
ENV TZ=UTC
# Match the web image's Recording R2 defaults. Runtime values override these;
# endpoint, bucket and credentials must point to the same storage as the web app.
ENV RECORDING_R2_REGION=auto
ENV RECORDING_R2_FORCE_PATH_STYLE=true
ENV RECORDING_R2_KEY_PREFIX=recordings

# Match the web image's upload-storage defaults. Runtime values override these.
ENV S3_REGION=auto
ENV S3_FORCE_PATH_STYLE=false
ENV S3_KEY_PREFIX=uploads

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
COPY --from=prod-deps --chown=bun:bun /repo/apps/worker/node_modules ./apps/worker/node_modules
COPY --from=builder --chown=bun:bun /repo/apps/worker/dist ./apps/worker/dist

USER bun

EXPOSE 8790

CMD ["bun", "apps/worker/dist/index.mjs"]
