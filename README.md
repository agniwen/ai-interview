# AI Recruitment Copilot

AI-powered voice interview and resume screening platform. Chinese-first locale —
agent instructions, system prompts, and interview flows are written in
Simplified Chinese.

## Architecture

Two runtimes share this repo:

- **Web app** (`src/`) — Next.js 16 (App Router) + React 19, Hono API routes,
  Drizzle ORM on PostgreSQL, Better Auth, shadcn/ui + Tailwind v4. Handles auth,
  workspace/org management, resume upload/parsing, the chat-based screening
  flow, and the interview console.
- **Voice agent** (`agent/`) — Python LiveKit Agents SDK with Silero VAD,
  turn-detector, ElevenLabs / Google / OpenAI / Minimax plugins. Joins a
  LiveKit room and conducts the live interview.

Two package managers: **pnpm** for the web app, **uv** for the Python agent.
They are kept strictly separate.

## Quick start

```bash
make install   # pnpm install + uv sync + Silero/turn-detector model download
cp .env.example .env  # then fill in values — see comments inside the file
pnpm db:migrate
make dev       # parallel: Next.js dev server + LiveKit agent worker
```

`make agent-console` runs an in-terminal chat against the agent without opening
a LiveKit room. `make help` lists every Make target.

## Configuration

All env vars live in a single `.env` at the repo root (the Python agent reads
the same file). The example file is annotated; key requirements:

- **Database** — `DATABASE_URL` (Postgres connection string)
- **Better Auth** — `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
  `NEXT_PUBLIC_APP_URL`, plus `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for
  OAuth
- **LLM provider** — `ALIBABA_API_KEY` (DashScope; Qwen for chat + OCR,
  DeepSeek V4 for ranking)
- **AI Gateway** — `AI_GATEWAY_API_KEY` (Vercel AI Gateway, used for the
  interview evaluation step)
- **LiveKit Cloud** — `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
  `AGENT_NAME` (must match the worker registered in `agent/src/agent.py`)
- **Voice TTS/STT** — `ELEVENLABS_API_KEY`
- **Object storage** — `S3_*` for general uploads (resume PDFs, attachments),
  `RECORDING_R2_*` for LiveKit Egress interview recordings
- **Optional integrations** — `FEISHU_*` for the Feishu bot adapter

Refer to `.env.example` for the full list with per-variable explanations.

## Common commands

### Web (run from repo root)

| Command                         | Purpose                                            |
| ------------------------------- | -------------------------------------------------- |
| `pnpm dev`                      | Next.js dev server                                 |
| `pnpm build`                    | Production build (Next.js standalone output)       |
| `pnpm typecheck`                | `tsc --noEmit`                                     |
| `pnpm check` / `pnpm fix`       | Ultracite (oxlint + oxfmt) check / autofix         |
| `pnpm test` / `pnpm test:watch` | Vitest                                             |
| `pnpm db:generate`              | Generate a versioned migration from schema changes |
| `pnpm db:migrate`               | Apply migrations                                   |
| `pnpm db:studio`                | Drizzle Studio UI                                  |
| `pnpm hooks`                    | Install lefthook git hooks (run once after clone)  |

### Agent (run from `agent/`)

| Command                                    | Purpose                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| `uv sync`                                  | Install Python dependencies                                            |
| `uv run src/agent.py download-files`       | Download Silero VAD + turn-detector models (required before first run) |
| `uv run src/agent.py dev`                  | Dev mode with hot reload                                               |
| `uv run src/agent.py console`              | Interactive terminal chat                                              |
| `uv run pytest`                            | Run tests                                                              |
| `uv run ruff format` / `uv run ruff check` | Format / lint                                                          |

## Project layout

```
src/
  app/                       Next.js App Router pages (auth, chat, interview, studio)
  server/
    routes/                  Hono route folders (route.ts + schema.ts + dao + utils)
      chat/                  Conversation CRUD + message persistence
      resume/                Resume upload, parsing, screening chat, JD suggestion
      interview/             Live interview lifecycle and reports
      studio/                Workspace-scoped studio (JDs, interviews, departments)
      agent/                 Agent callbacks (events from the Python worker)
      feishu/                Feishu bot adapter routes
    agents/                  Shared AI SDK agent builders
    middlewares/             Shared Hono middleware
  lib/
    server/                  Node-only (DB, auth, S3, OCR, server-only directives)
    client/                  Browser-only (RPC client, auth-client, fetch helpers)
    shared/                  Isomorphic types, Zod schemas, Drizzle schema/relations
  components/                shadcn/ui + project-specific components
agent/
  src/                       Python LiveKit agent (entrypoint: src/agent.py)
  tests/                     pytest suite for agent behaviour
packages/
  adapter-feishu/            Shared adapter package
```

## Resume screening chat — tool surface

The screening agent (`src/server/routes/resume/screening.ts`) exposes a small
toolset on the `/api/resume/chat` endpoint:

- `suggest_job_description` (server) — when no JD is configured and the user
  uploaded a resume, ranks the workspace's open JDs against the parsed resume.
- `apply_job_description` (client) — renders an approval card so the user can
  confirm/ignore the recommended JD.
- `list_uploaded_resume_pdfs` — disambiguates between multiple uploaded files.
- `get_resume_review_framework` — returns a weighted screening framework.
- `get_server_time` — anchors "now" for timeline / tenure inference.

Resume PDFs are parsed at upload time via Qwen-VL OCR + DeepSeek V4 Flash; the
structured result is baked into the user message as a `data-resume-parsed`
part, so the chat agent never re-parses PDFs.

## External references

When working on Hono / Next.js / LiveKit APIs, prefer the canonical docs over
training-data recall:

- Hono: <https://hono.dev/llms.txt> (full reference at `llms-full.txt`)
- Next.js: <https://nextjs.org/docs/llms.txt>
- LiveKit: `lk docs overview` / `lk docs search` via the LiveKit CLI

See `CLAUDE.md` for detailed conventions (route folder layout, lib runtime
split, frontend HTTP call patterns).
