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

ARG ALIBABA_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
ARG ALIBABA_FAST_MODEL=deepseek-v4-flash
ARG ALIBABA_MODEL=deepseek-v4-pro
ARG ALIBABA_STRUCTURED_MODEL=deepseek-v4-pro
ARG BETTER_AUTH_SECRET=build-time-placeholder
ARG BETTER_AUTH_URL=https://example.com
ARG FEISHU_APP_ID=build-time-placeholder
ARG FEISHU_APP_ID2=build-time-placeholder
ARG FEISHU_APP_SECRET=build-time-placeholder
ARG FEISHU_APP_SECRET2=build-time-placeholder
ARG GOOGLE_CLIENT_ID=build-time-placeholder
ARG GOOGLE_CLIENT_SECRET=build-time-placeholder
ARG INTERVIEW_EVALUATION_MODEL=deepseek-v4-pro
ARG MINIMAX_TTS_BASE_URL=https://api.minimax.chat
ARG NEXT_PUBLIC_AGENT_NAME=interview-agent
ARG NEXT_PUBLIC_BASE_URL=https://example.com
ARG NEXT_PUBLIC_BETTER_AUTH_URL=https://example.com
ARG NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN=false
ARG QWEN_OCR_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
ARG QWEN_OCR_MODEL=qwen-vl-ocr-latest
ARG RECORDING_R2_FORCE_PATH_STYLE=true
ARG RECORDING_R2_KEY_PREFIX=recordings
ARG RECORDING_R2_REGION=auto
ARG S3_FORCE_PATH_STYLE=true
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
ENV NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN=$NEXT_PUBLIC_ENABLE_GOOGLE_LOGIN
ENV QWEN_OCR_BASE_URL=$QWEN_OCR_BASE_URL
ENV QWEN_OCR_MODEL=$QWEN_OCR_MODEL
ENV RECORDING_R2_FORCE_PATH_STYLE=$RECORDING_R2_FORCE_PATH_STYLE
ENV RECORDING_R2_KEY_PREFIX=$RECORDING_R2_KEY_PREFIX
ENV RECORDING_R2_REGION=$RECORDING_R2_REGION
ENV S3_FORCE_PATH_STYLE=$S3_FORCE_PATH_STYLE
ENV S3_KEY_PREFIX=$S3_KEY_PREFIX
ENV S3_REGION=$S3_REGION

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
ENV LIBREOFFICE_BIN=/usr/bin/soffice

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
    fontconfig \
    fonts-noto-cjk \
    libreoffice-impress \
 && rm -rf /var/lib/apt/lists/*

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 startjs

# TanStack Start with Nitro emits a standalone Node server in `.output`.
COPY --from=builder --chown=startjs:nodejs /repo/apps/ai-recruitment-copilot/.output ./.output

USER startjs

EXPOSE 3000
ENV PORT=3000
ENV HOST="0.0.0.0"

CMD ["node", ".output/server/index.mjs"]
