# AI Recruitment Copilot

AI-powered voice interview and resume screening platform. Chinese-first locale:
agent instructions, system prompts, and interview flows are written in
Simplified Chinese.

## Architecture

- **Web app** (`apps/ai-recruitment-copilot/`): TanStack Start + React 19,
  TanStack Router, TanStack Query, Better Auth client, shadcn/ui, Tailwind CSS
  v4, and Vite/Nitro output. It owns the browser UI, route loaders, server
  functions, SSR/SSG, and the mounted Hono API adapter.
- **Backend app** (`apps/ai-recruitment-copilot-backend/`): Hono API runtime,
  Drizzle ORM, PostgreSQL, Better Auth, object storage, email, and server-side
  AI utilities. It can be mounted by the web app at `/api` or started as a
  standalone Node service.
- **Resume worker** (`apps/ai-recruitment-copilot-worker/`): asynchronous resume
  parsing worker for queued PDF/OCR processing.
- **Voice agent** (`apps/livekit-agent/`): Python LiveKit Agents SDK with OpenAI,
  Google, ElevenLabs, Minimax, Silero VAD, and turn detector plugins.
- **Shared packages** (`packages/`): `@arc/shared`, `@arc/db-schema`, and
  `@arc/resume-parse-queue`.

Two package managers are used: **pnpm** for TypeScript apps/packages and **uv**
for the Python agent. Do not mix them.

## Quick Start

```bash
make install
cp apps/ai-recruitment-copilot/.env.example apps/ai-recruitment-copilot/.env
cp apps/ai-recruitment-copilot-backend/.env.example apps/ai-recruitment-copilot-backend/.env
cp apps/livekit-agent/.env.example apps/livekit-agent/.env
pnpm db:migrate
make dev
```

`make agent-console` runs an in-terminal chat against the agent without opening
a LiveKit room. `make help` lists every Make target.

## Configuration

Each runtime owns its own `.env` file:

- `apps/ai-recruitment-copilot/.env` for the TanStack Start web app.
- `apps/ai-recruitment-copilot-backend/.env` for standalone Hono backend runs.
- `apps/livekit-agent/.env` for the Python LiveKit agent.

Key requirements:

- **Database**: `DATABASE_URL`
- **Better Auth**: `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
  `NEXT_PUBLIC_BASE_URL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- **LLM providers**: `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`,
  `ALIBABA_API_KEY`, `AI_GATEWAY_API_KEY`
- **Voice providers**: `ELEVENLABS_API_KEY`, `MINIMAX_API_KEY`
- **LiveKit Cloud**: `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`,
  `AGENT_NAME`, `NEXT_PUBLIC_AGENT_NAME`
- **Object storage**: `S3_*` for uploads and `RECORDING_R2_*` for recordings
- **Optional integrations**: `FEISHU_*`, `RESEND_*`

The web app intentionally keeps the existing `NEXT_PUBLIC_*` variable names.
Vite exposes them through `envPrefix: ["VITE_", "NEXT_PUBLIC_"]`, so client code
reads them from `import.meta.env.NEXT_PUBLIC_*`.

## Common Commands

### Root

| Command                   | Purpose                                     |
| ------------------------- | ------------------------------------------- |
| `pnpm dev`                | Turbo dev across apps                       |
| `pnpm build`              | Turbo production build                      |
| `pnpm typecheck`          | Turbo TypeScript checks                     |
| `pnpm test`               | Turbo tests                                 |
| `pnpm check` / `pnpm fix` | Ultracite check / autofix                   |
| `pnpm db:generate`        | Generate Drizzle migrations through web app |
| `pnpm db:migrate`         | Apply Drizzle migrations through web app    |
| `pnpm db:studio`          | Drizzle Studio                              |
| `pnpm hooks`              | Install lefthook git hooks                  |

### Web

```bash
pnpm --filter @arc/ai-recruitment-copilot dev
pnpm --filter @arc/ai-recruitment-copilot build
pnpm --filter @arc/ai-recruitment-copilot typecheck
pnpm --filter @arc/ai-recruitment-copilot test
```

### Backend

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend dev:standalone
pnpm --filter @arc/ai-recruitment-copilot-backend start
pnpm --filter @arc/ai-recruitment-copilot-backend typecheck
pnpm --filter @arc/ai-recruitment-copilot-backend test
```

### Agent

```bash
cd apps/livekit-agent
uv sync
uv run src/agent.py download-files
uv run src/agent.py dev
uv run src/agent.py console
uv run pytest
uv run ruff format
uv run ruff check
```

## Project Layout

```text
apps/
  ai-recruitment-copilot/
    src/routes/                 TanStack Router file routes
    src/lib/start/              server functions and Start-only helpers
    src/lib/client/             browser helpers and Hono RPC client
    src/lib/server/             small web server helpers
    src/components/             shadcn/ui + project components
    src/server.ts               TanStack Start server entry
    src/client.tsx              browser entry
    vite.config.ts              TanStack Start / Vite / Nitro config
  ai-recruitment-copilot-backend/
    src/server/app.ts           Hono app factory
    src/server/routes/          route folders with route.ts/schema.ts/dao
    src/lib/server/             backend runtime helpers
    src/index.ts                standalone Node entrypoint
  ai-recruitment-copilot-worker/
    src/                        async resume parsing worker
  livekit-agent/
    src/agent.py                Python LiveKit agent entrypoint
    tests/                      pytest suite
packages/
  shared/
  db-schema/
  resume-parse-queue/
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
`apps/ai-recruitment-copilot-backend/src/server/routes/` is self-contained:

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
