# Environment and Email Setup

Read when adding environment variables, configuring deployables, or changing transactional email. Paths below are relative to the repository root.

## Environment Setup

Each deployable owns its environment: copy `apps/web/.env.example` to `apps/web/.env`, `apps/server/.env.example` to `apps/server/.env`, and `apps/worker/.env.example` to `apps/worker/.env`. Never load another app's `.env` or fall back to legacy application directories. Bun loads the current app's `.env*` files; Vite config uses its official `loadEnv` for `apps/web`.

Environment contracts use T3 Env. Server variables are defined once in `@app/server/env` and reused by Web build validation; Worker variables are validated in `apps/worker/src/env.ts`; public Web variables live in `apps/web/src/env/client.schema.ts`. Add a variable to the owning `.env.example` and schema together. Runtime dependency availability still belongs to health/readiness checks when a capability is optional.

The voice agent has its own `apps/livekit-agent/.env.example`. See those `.env.example` files for the full list. Key requirements:

- LiveKit Cloud credentials (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`)
- Google OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
- Database (`DATABASE_URL`)
- AI providers (`OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `ELEVENLABS_API_KEY`, `MINIMAX_API_KEY`) — see `.env.example` for the authoritative list

### Resend (transactional email)

The round-email feature (`/api/w/:slug/studio/interviews/round-emails/...`) calls Resend with `RESEND_FROM` as the sender. **Use a bare email address** (e.g. `RESEND_FROM=noreply@your-domain.com`) — the From-header display name is built dynamically at runtime as `{globalConfig.companyName} AI HR` (or `AI HR` when no company name is set), via `buildSenderFromAddress` in `apps/server/src/lib/server/resend.ts`. Avoid the `"Name <addr>"` form in env files because the `<>` characters get interpreted as shell redirection in many deploy scripts (Jenkins, CI). **Before sending in any non-local environment**, verify your sender domain in the [Resend dashboard](https://resend.com/domains) — otherwise Resend rejects the send. Local dev can leave `RESEND_API_KEY` unset; the route returns a structured 500 + writes a `studio_round_email_log` row with `status='failed'` when the key is missing.
