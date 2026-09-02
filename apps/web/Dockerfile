# Build from the monorepo root:
#   docker build -f apps/web/Dockerfile .

ARG BUN_IMAGE=oven/bun:1.4.0-debian@sha256:5bb0f9be3a1a36a03e27c9a9dd894a3b1ad26657155c7df4dda771e17bf872ef

FROM ${BUN_IMAGE} AS base
WORKDIR /repo

# --- Dependencies ---
FROM base AS deps
COPY .bun-version bun.lock bunfig.toml package.json ./
COPY patches patches
COPY apps/web/package.json apps/web/
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
RUN bun install --frozen-lockfile --filter @app/web

# --- Build ---
FROM base AS builder

ARG ALIBABA_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
ARG ALIBABA_FAST_MODEL=deepseek-v4-flash-0731
ARG ALIBABA_MODEL=deepseek-v4-flash-0731
ARG ALIBABA_STRUCTURED_MODEL=deepseek-v4-flash-0731
ARG BETTER_AUTH_SECRET=build-time-placeholder
ARG BETTER_AUTH_URL
ARG FEISHU_APP_ID=build-time-placeholder
ARG FEISHU_APP_ID2=build-time-placeholder
ARG FEISHU_APP_SECRET=build-time-placeholder
ARG FEISHU_APP_SECRET2=build-time-placeholder
ARG GOOGLE_CLIENT_ID=build-time-placeholder
ARG GOOGLE_CLIENT_SECRET=build-time-placeholder
ARG INTERVIEW_EVALUATION_MODEL=deepseek-v4-flash-0731
ARG MINIMAX_TTS_BASE_URL=https://api.minimax.chat
ARG NEXT_PUBLIC_AGENT_NAME=giaogiao
ARG NEXT_PUBLIC_BASE_URL
ARG NEXT_PUBLIC_BETTER_AUTH_URL
ARG NEXT_PUBLIC_ENABLE_CANDIDATE_SPECIFIC_INTERVIEW_QUESTIONS=true
ARG NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN=false
ARG NEXT_PUBLIC_ENABLE_INTERVIEW_RECORDING=true
ARG QWEN_OCR_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
ARG QWEN_OCR_MODEL=qwen-vl-ocr-latest
ARG RECORDING_R2_FORCE_PATH_STYLE=true
ARG RECORDING_R2_KEY_PREFIX=recordings
ARG RECORDING_R2_REGION=auto
ARG S3_FORCE_PATH_STYLE=false
ARG S3_KEY_PREFIX=uploads
ARG S3_REGION=auto

ENV ALIBABA_BASE_URL=$ALIBABA_BASE_URL
ENV ALIBABA_FAST_MODEL=$ALIBABA_FAST_MODEL
ENV ALIBABA_MODEL=$ALIBABA_MODEL
ENV ALIBABA_STRUCTURED_MODEL=$ALIBABA_STRUCTURED_MODEL
ENV BETTER_AUTH_SECRET=$BETTER_AUTH_SECRET
ENV BETTER_AUTH_URL=$BETTER_AUTH_URL
ENV FEISHU_APP_ID=$FEISHU_APP_ID
ENV FEISHU_APP_ID2=$FEISHU_APP_ID2
ENV FEISHU_APP_SECRET=$FEISHU_APP_SECRET
ENV FEISHU_APP_SECRET2=$FEISHU_APP_SECRET2
ENV GOOGLE_CLIENT_ID=$GOOGLE_CLIENT_ID
ENV GOOGLE_CLIENT_SECRET=$GOOGLE_CLIENT_SECRET
ENV INTERVIEW_EVALUATION_MODEL=$INTERVIEW_EVALUATION_MODEL
ENV MINIMAX_TTS_BASE_URL=$MINIMAX_TTS_BASE_URL
ENV NEXT_PUBLIC_AGENT_NAME=$NEXT_PUBLIC_AGENT_NAME
ENV NEXT_PUBLIC_BASE_URL=$NEXT_PUBLIC_BASE_URL
ENV NEXT_PUBLIC_BETTER_AUTH_URL=$NEXT_PUBLIC_BETTER_AUTH_URL
ENV NEXT_PUBLIC_ENABLE_CANDIDATE_SPECIFIC_INTERVIEW_QUESTIONS=$NEXT_PUBLIC_ENABLE_CANDIDATE_SPECIFIC_INTERVIEW_QUESTIONS
ENV NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN=$NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN
ENV NEXT_PUBLIC_ENABLE_INTERVIEW_RECORDING=$NEXT_PUBLIC_ENABLE_INTERVIEW_RECORDING
ENV QWEN_OCR_BASE_URL=$QWEN_OCR_BASE_URL
ENV QWEN_OCR_MODEL=$QWEN_OCR_MODEL
ENV RECORDING_R2_FORCE_PATH_STYLE=$RECORDING_R2_FORCE_PATH_STYLE
ENV RECORDING_R2_KEY_PREFIX=$RECORDING_R2_KEY_PREFIX
ENV RECORDING_R2_REGION=$RECORDING_R2_REGION
ENV S3_FORCE_PATH_STYLE=$S3_FORCE_PATH_STYLE
ENV S3_KEY_PREFIX=$S3_KEY_PREFIX
ENV S3_REGION=$S3_REGION

COPY --from=deps /repo /repo
COPY .bun-version bun.lock bunfig.toml package.json turbo.json tsconfig.base.json ./
COPY apps/web apps/web
COPY apps/server apps/server
COPY packages packages

RUN test -n "$BETTER_AUTH_URL" || (echo "BETTER_AUTH_URL build arg is required." && false) \
 && export NEXT_PUBLIC_BASE_URL="${NEXT_PUBLIC_BASE_URL:-$BETTER_AUTH_URL}" \
 && export NEXT_PUBLIC_BETTER_AUTH_URL="${NEXT_PUBLIC_BETTER_AUTH_URL:-$BETTER_AUTH_URL}" \
 && bun run --filter @app/web build

# --- Production ---
FROM ${BUN_IMAGE} AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV LIBREOFFICE_BIN=/usr/bin/soffice
ENV TZ=UTC

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    fontconfig \
    fonts-noto-cjk \
    libreoffice-calc \
    libreoffice-impress \
    libreoffice-writer \
 && rm -rf /var/lib/apt/lists/*

COPY --from=builder --chown=bun:bun /repo/apps/web/.output ./.output

USER bun

EXPOSE 3000
ENV PORT=3000
ENV HOST=0.0.0.0

CMD ["bun", ".output/server/index.mjs"]
