# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered voice interview/resume screening application. Chinese-first locale — agent instructions and interview prompts are in Simplified Chinese.

## Architecture

- **Web app** (`src/`): Next.js 16 + React 19, App Router, Hono API routes, Drizzle ORM + PostgreSQL, Better Auth, shadcn/ui + Tailwind CSS v4
- **Voice agent** (`agent/`): Python LiveKit Agents SDK with OpenAI / Google / ElevenLabs / Minimax plugins, Silero VAD, turn-detector
- **Monorepo**: pnpm workspace; shared packages in `packages/` (e.g. `@repo/adapter-feishu`)

Two separate package managers: **pnpm** for web, **uv** for Python agent. Do not mix them.

## Commands

### Web (from project root)

- `pnpm dev` — dev server
- `pnpm hooks` — install lefthook git hooks (run once after clone)
- `pnpm build` — production build
- `pnpm typecheck` — TypeScript type checking
- `pnpm check` — Ultracite (oxlint + oxfmt) check
- `pnpm fix` — Ultracite autofix (also runs via lefthook on commit)
- `pnpm test` / `pnpm test:watch` — Vitest
- `pnpm db:generate` — generate a versioned migration from schema changes
- `pnpm db:migrate` — apply migrations
- `pnpm db:seed` — seed via `scripts/seed.ts`
- `pnpm db:studio` — Drizzle Studio UI

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
- **TypeScript**: Ultracite enforces formatting/linting via oxlint + oxfmt — run `pnpm fix` before committing
- **Python**: Ruff — double quotes, 88 char line length
- **Components**: shadcn/ui with new-york style, CSS variables for theming

## Environment Setup

Copy `.env.example` to `.env` and populate required keys. See `.env.example` for the full list. Key requirements:

- LiveKit Cloud credentials (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`)
- Google OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
- Database (`DATABASE_URL`)
- AI providers (`OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `ELEVENLABS_API_KEY`, `MINIMAX_API_KEY`) — see `.env.example` for the authoritative list

## Gotchas

- Must run `uv run src/agent.py download-files` before first agent run to download Silero VAD and turn-detector models
- Generated/upstream UI is excluded from oxlint: `src/components/agents-ui/`, `src/hooks/agents-ui/`, `src/components/ui/`, `src/components/react-bits/`, `src/components/spell-ui/` — avoid hand-editing these
- Next.js config uses `output: 'standalone'` for Docker deployment
- Drizzle ORM is on RC (`1.0.0-rc.1`) — pin carefully when upgrading
