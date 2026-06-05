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

Two separate `.env` files — each runtime loads its own:

- `./.env` for the web app (Next.js reads via its built-in env loader)
- `./agent/.env` for the Python agent (loaded by `dotenv.load_dotenv()` from
  `agent/src/agent.py`)

Each side has its own `.env.example` with bilingual inline comments. A handful
of values (`LIVEKIT_*`, `CALLBACK_BASE_URL`, `AGENT_CALLBACK_SECRET`,
`RECORDING_R2_*`) must be kept in lock-step across both files.

Key requirements for the web `.env`:

- **Database** — `DATABASE_URL` (Postgres connection string)
- **Better Auth** — `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`,
  `NEXT_PUBLIC_BASE_URL`, plus `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` for
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
- **PostHog analytics (optional)** — frontend capture:
  `NEXT_PUBLIC_ENABLE_POSTHOG=true`, `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN`,
  `NEXT_PUBLIC_POSTHOG_HOST`; platform dashboard server query:
  `POSTHOG_PERSONAL_API_KEY`, `POSTHOG_PROJECT_ID`, `POSTHOG_API_HOST`
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

## Product analytics — PostHog

The web app uses PostHog through the client-only wrapper at
`apps/ai-recruitment-copilot/src/lib/client/analytics.ts`. PostHog is disabled
unless `NEXT_PUBLIC_ENABLE_POSTHOG=true` and
`NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` is set. Because these `NEXT_PUBLIC_*`
values are bundled into the browser build, restart the dev server or redeploy
after changing them.

Every tracked workspace event should include filterable context:

- `user_id` — the Better Auth user id, also used as PostHog `distinct_id`
- `workspace_id` — the active organization/workspace id

The wrapper registers these as PostHog super properties after entering a
workspace, so custom events sent through `captureAnalyticsEvent()` inherit them.

Tracked events currently include:

- `page_viewed`
- `resume_parse_started`, `resume_parse_completed`, `resume_parse_failed`
- `resume_upload_started`, `resume_upload_completed`
- `interview_created`
- `interviewer_created`
- `job_description_created`, `job_description_updated`
- `job_interviewer_matched`

Page views are intentionally custom-tracked instead of using PostHog's automatic
pageview capture. Raw URLs are normalized before upload: workspace slugs,
record ids, and query strings are removed, e.g.
`/w/acme/studio/interviews/round_123?recordId=candidate_1` becomes
`/w/[workspace]/studio/interviews/[id]`.

Privacy rule: do not send candidate names, emails, phone numbers, resume text,
interview transcripts, free-form notes, or original file names to PostHog. The
analytics wrapper uses a property allowlist for internal ids, counts, status,
durations, file type/size, and page classification fields.

To verify analytics locally:

1. Set the PostHog env vars and restart the Next.js dev server.
2. Open browser DevTools Network and filter for `posthog` or the configured
   host.
3. Trigger a page navigation or resume/JD/interviewer workflow.
4. Confirm the outgoing event payload contains `user_id` and `workspace_id`,
   and does not contain candidate PII.

Platform admins can view aggregated analytics at `/platform/analytics`. That
page queries PostHog server-side with `POSTHOG_PERSONAL_API_KEY` and supports
range, `workspace_id`, and `user_id` filters. The personal API key must never
use a `NEXT_PUBLIC_` prefix.

## External references

When working on Hono / Next.js / LiveKit APIs, prefer the canonical docs over
training-data recall:

- Hono: <https://hono.dev/llms.txt> (full reference at `llms-full.txt`)
- Next.js: <https://nextjs.org/docs/llms.txt>
- LiveKit: `lk docs overview` / `lk docs search` via the LiveKit CLI

See `CLAUDE.md` for detailed conventions (route folder layout, lib runtime
split, frontend HTTP call patterns).
