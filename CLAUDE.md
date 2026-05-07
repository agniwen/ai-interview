# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered voice interview/resume screening application. Chinese-first locale — agent instructions and interview prompts are in Simplified Chinese.

## Architecture

- **Web app** (`src/`): Next.js 16 + React 19, App Router, Hono API routes, Drizzle ORM + PostgreSQL, Better Auth, shadcn/ui + Tailwind CSS v4
- **Voice agent** (`agent/`): Python LiveKit Agents SDK, ElevenLabs TTS, Alibaba Qwen STT/LLM

Two separate package managers: **pnpm** for web, **uv** for Python agent. Do not mix them.

## Commands

### Web (from project root)

- `pnpm dev` — dev server
- `pnpm hooks` — install lefthook git hooks (run once after clone)
- `pnpm build` — production build
- `pnpm typecheck` — TypeScript type checking
- `pnpm lint` — ESLint with autofix
- `npm run db:push` — sync Drizzle schema to database
- `npm run db:migrate` — run migrations
- `npm run db:studio` — Drizzle Studio UI

### Agent (from `agent/`)

- `uv sync` — install dependencies
- `uv run src/agent.py download-files` — download VAD + turn-detector models (required before first run)
- `uv run src/agent.py dev` — dev mode with hot reload
- `uv run src/agent.py console` — interactive terminal chat
- `uv run pytest` — run tests
- `uv run ruff format` — format Python code
- `uv run ruff check` — lint Python code

### Unified (Makefile)

- `make install` — full setup: web deps + agent + model downloads
- `make dev` — run web + agent in parallel
- `make agent-console` — terminal chat without web

## Code Style

- **Conventional commits**: `feat:`, `fix:`, `chore:`, `refactor:`, etc.
- **TypeScript**: ESLint with @antfu/eslint-config — single quotes, always semicolons
- **Python**: Ruff — double quotes, 88 char line length
- **Components**: shadcn/ui with new-york style, CSS variables for theming

## Environment Setup

Copy `.env.example` to `.env` and populate required keys. See `.env.example` for the full list. Key requirements:

- LiveKit Cloud credentials (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`)
- Google OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
- Database (`DATABASE_URL`)
- AI providers (`GOOGLE_GENERATIVE_AI_API_KEY`, `ELEVENLABS_API_KEY`, `ALIBABA_API_KEY`)

## Gotchas

- Must run `uv run src/agent.py download-files` before first agent run to download Silero VAD and turn-detector models
- `src/components/agents-ui/` and `src/hooks/agents-ui/` are upstream LiveKit UI code with relaxed lint rules — avoid modifying these
- Next.js config uses `output: 'standalone'` for Docker deployment
- Drizzle ORM is on beta (`1.0.0-beta.9`)
