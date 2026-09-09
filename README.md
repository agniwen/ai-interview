# AI Hiring Copilot

AI-powered voice interview and resume screening platform. Chinese-first locale:
agent instructions, system prompts, and interview flows are written in
Simplified Chinese.

## Architecture

- **Web app** (`apps/web/`): TanStack Start + React 19,
  TanStack Router, TanStack Query, Better Auth client, shadcn/ui, Tailwind CSS
  v4, and Vite/Nitro output. It owns the browser UI, route loaders, server
  functions, SSR/SSG, and the mounted Hono API adapter.
- **Backend app** (`apps/server/`): Hono API runtime,
  Drizzle ORM, PostgreSQL, Better Auth, object storage, email, and server-side
  AI utilities. It can be mounted by the web app at `/api` or started as a
  standalone Bun service.
- **Resume worker** (`apps/worker/`): background processing for resume
  parsing, meeting transcription, and notification/queue reconciliation.
- **Voice agent** (`apps/livekit-agent/`): Python LiveKit Agents SDK with a
  DashScope (Alibaba) streaming STT adapter, an OpenAI-compatible LLM pointed at
  the DashScope endpoint, and MiniMax TTS.
- **Shared packages** (`packages/`): `@app/shared` (isomorphic contracts and
  schemas), `@app/db-schema` (Drizzle schema and relations), `@app/database`
  (database factory), and `@app/resume-parse-queue`.
- **Application runtime packages** (`packages/`): `@app/ai-runtime`,
  `@app/object-storage`, `@app/meeting-media`, `@app/meeting-live-transcript`,
  `@app/meeting-processing`, `@app/meeting-processing-queue`, and
  `@app/resume-processing`.

Two package managers are used: **Bun 1.4.0** for TypeScript apps/packages and **uv**
for the Python agent. Do not mix them.

## Quick Start

```bash
make install
cp apps/web/.env.example apps/web/.env
cp apps/server/.env.example apps/server/.env
cp apps/livekit-agent/.env.example apps/livekit-agent/.env
bun run db:migrate
make dev
```

`make agent-console` runs an in-terminal chat against the agent without opening
a LiveKit room. `make help` lists every Make target.

## Local Docker Validation

Build and start the Bun 1.4.0 web and worker images. Both services load
`apps/web/.env`, matching the dependencies and credentials
used by the local web app:

```bash
BETTER_AUTH_URL=http://localhost:3000 \
  docker compose -f docker-compose.yml -f docker-compose.local.yml up --build -d
```

Open <http://localhost:3000>. Web readiness is available at
<http://localhost:3000/api/ready>, and worker readiness is available at
<http://localhost:8790/readyz>. Because the worker uses the real application
configuration, it connects to the configured Redis queue immediately and may
process pending jobs just like a normal local worker start.

Stop the local validation stack with:

```bash
BETTER_AUTH_URL=http://localhost:3000 \
  docker compose -f docker-compose.yml -f docker-compose.local.yml down
```

## Configuration

Each runtime owns its own `.env` file:

- `apps/web/.env` for the TanStack Start web app.
- `apps/server/.env` for standalone Hono backend runs.
- `apps/livekit-agent/.env` for the Python LiveKit agent.

Key requirements:

- **Database**: `DATABASE_URL`
- **Better Auth**: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
  `NEXT_PUBLIC_BASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- **LLM providers**: `OPENAI_API_KEY`, `ALIBABA_API_KEY` (DashScope OCR and
  structured extraction), `DASHSCOPE_API_KEY` (voice-agent LLM/STT)
- **Voice providers**: `MINIMAX_API_KEY` (TTS)
- **LiveKit**: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
  `AGENT_NAME`, `NEXT_PUBLIC_AGENT_NAME`; private/self-hosted deployment is the
  default, and LiveKit Cloud requires `INTERVIEW_SELF_HOSTED=0`
- **Object storage**: `S3_*` for uploads and `RECORDING_R2_*` for recordings
- **Optional integrations**: `FEISHU_*`, `RESEND_*`

The web app intentionally keeps the existing `NEXT_PUBLIC_*` variable names.
Vite exposes them through `envPrefix: ["VITE_", "NEXT_PUBLIC_"]`, so client code
reads them from `import.meta.env.NEXT_PUBLIC_*`.

## Common Commands

### Root

| Command                         | Purpose                                     |
| ------------------------------- | ------------------------------------------- |
| `bun run dev`                   | Turbo dev across apps                       |
| `bun run build`                 | Turbo production build                      |
| `bun run typecheck`             | Turbo TypeScript checks                     |
| `bun run test`                  | Turbo tests                                 |
| `bun run check` / `bun run fix` | Ultracite check / autofix                   |
| `bun run db:generate`           | Generate Drizzle migrations through web app |
| `bun run db:migrate`            | Apply Drizzle migrations through web app    |
| `bun run db:studio`             | Drizzle Studio                              |
| `bun run hooks`                 | Install lefthook git hooks                  |

### Web

```bash
bun run --filter @app/web dev
bun run --filter @app/web build
bun run --filter @app/web typecheck
bun run --filter @app/web test
```

### Backend

```bash
bun run --filter @app/server dev:standalone
bun run --filter @app/server start
bun run --filter @app/server typecheck
bun run --filter @app/server test
```

### Agent

```bash
cd apps/livekit-agent
uv sync
uv run -m livekit.agents download-files
uv run src/agent.py dev
uv run src/agent.py console
uv run pytest
uv run ruff format
uv run ruff check
```

## Project Layout

```text
apps/
  web/
    src/routes/                 TanStack Router file routes
    src/lib/start/              server functions and Start-only helpers
    src/lib/client/             browser helpers and Hono RPC client
    src/lib/server/             small web server helpers
    src/components/             shadcn/ui + project components
    src/server.ts               TanStack Start server entry
    src/client.tsx              browser entry
    vite.config.ts              TanStack Start / Vite / Nitro config
  server/
    src/server/app.ts           Hono app factory
    src/server/routes/          route folders with route.ts/schema.ts/dao
    src/lib/server/             backend runtime helpers
    src/index.ts                standalone Bun entrypoint
  desktop/
    src/main/                   Electron main process (Echo capture, SQLite)
    src/renderer/               Echo renderer (local-first meeting capture)
  worker/
    src/                        background queues, schedulers, and readiness
  livekit-agent/
    src/agent.py                Python LiveKit agent entrypoint
    tests/                      pytest suite
packages/
  shared/                     isomorphic contracts, schemas, state machines
  db-schema/                  Drizzle PostgreSQL schema, relations, enums
  database/                   shared Drizzle database factory and type
  ai-runtime/                 provider-neutral server-side model primitives
  object-storage/             S3-compatible client, keys, upload/download/copy
  resume-parse-queue/         BullMQ contracts for resume parse/review/index
  resume-processing/          resume ingest, parsing, review, semantic workflows
  meeting-media/              recording normalization and audio preparation
  meeting-live-transcript/    live-transcript capture/correction/relay contracts
  meeting-processing/         meeting transcription/intelligence/purge workflows
  meeting-processing-queue/   BullMQ contracts for meeting jobs
```

## Frontend Data Flow

- Route-owned SSR data uses TanStack Start `createServerFn`.
- Server function inputs should use `.validator(...)` with Zod schemas.
- TanStack Query is integrated with TanStack Start through
  `@tanstack/react-router-ssr-query`; route loaders prefetch/dehydrate query
  data where needed.
- The public home page is prerendered by TanStack Start.
- JSON API calls use the typed Hono RPC client at `@/lib/client/rpc` and
  `rpcFetch`.
- Multipart uploads, streams, and binary responses stay on plain `fetch` or
  `apiFetch`.

## Backend Route Layout

Every route folder under
`apps/server/src/server/routes/` is self-contained:

- `route.ts` exports a Hono router.
- `schema.ts` contains Zod schemas when needed.
- `dao.ts` or `dao/` contains route-owned database queries.
- `utils.ts` or `utils/` contains feature-internal helpers.
- Nested sub-resources live under `routes/` and are mounted from the parent.

Keep middleware inside the closest owning router. `server/app.ts` should remain
mount-only.

## External References

When touching fast-moving APIs, prefer canonical docs:

- TanStack Start: <https://tanstack.com/start/latest/docs/framework/react/overview>
- TanStack Router: <https://tanstack.com/router/latest/docs/framework/react/overview>
- TanStack Query: <https://tanstack.com/query/latest/docs/framework/react/overview>
- Hono: <https://hono.dev/llms.txt> and <https://hono.dev/llms-full.txt>
- LiveKit: `lk docs overview` / `lk docs search`

See `AGENTS.md` and `CLAUDE.md` for detailed repository conventions.
