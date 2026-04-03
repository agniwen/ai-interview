# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev              # Start Next.js dev server
pnpm build            # Production build
pnpm typecheck        # TypeScript type checking (tsc --noEmit)
pnpm lint             # ESLint with auto-fix
pnpm db:generate      # Generate Drizzle migrations
pnpm db:migrate       # Run Drizzle migrations
pnpm db:push          # Push schema to database
pnpm db:studio        # Open Drizzle Studio
```

## Architecture

This is an **AI-powered interview & resume screening platform** built with Next.js 16 (App Router) and React 19. The project uses the `src/` directory structure.

### Backend: Hono on Next.js API Route

All API requests go through a single catch-all route (`src/app/api/[[...route]]/route.ts`) which delegates to a Hono app (`src/server/app.ts`).

- **`src/server/factory.ts`** — Hono factory with typed context (user, session variables)
- **`src/server/middlewares/`** — Auth chain: `betterAuthMiddleware` (loads session) → `authMiddleware` (requires login) → `adminMiddleware` (requires admin role)
- **`src/server/routes/`** — Feature routes (chat, interview, studio-interviews, chat-title)
- **`src/server/utils.ts`** — Pagination helpers (`success()`, `page()`, `pageSchema()`, `pageCondition()`)
- Route handlers use `factory.createApp()` and validate with `zValidator('json', zodSchema)`

### Database: Drizzle ORM + PostgreSQL

- **Schema**: `src/lib/db/schema.ts` — Tables: user, session, account, verification, studioInterview, studioInterviewSchedule, interviewConversation, interviewConversationTurn
- **Relations**: `src/lib/db/relations.ts`
- **Client**: `src/lib/db/index.ts`
- **Config**: `drizzle.config.ts` (migrations output to `./drizzle/`)
- Tables use text IDs (nanoid), auto-timestamps, and JSON columns for complex data (resumeProfile, interviewQuestions, transcripts)

### Authentication: Better Auth

- **Server config**: `src/lib/auth.ts` — email+password and Google OAuth, admin plugin
- **Client hooks**: `src/lib/auth-client.ts` — `createAuthClient()` with `authClient.useSession()`
- **Roles**: `src/lib/auth-roles.ts` — role utilities (getRoleList, hasRole, isAdminRole)

### Frontend

- **Route groups**: `(auth)` for protected routes, `studio/(auth)` for admin-protected routes
- **State**: Jotai atoms (e.g., `src/app/chat/atoms/`)
- **UI**: shadcn/ui (new-york style) + Radix UI + TailwindCSS v4 with CSS variables
- **AI SDK**: `@ai-sdk/react` (`useChat`) + `@ai-sdk/google` (Gemini) for streaming chat
- **Voice**: ElevenLabs for mock interview audio
- **Components**: `src/components/ui/` (shadcn), `src/components/ai-elements/` (AI SDK wrappers), `src/components/auth/`, `src/components/interview/`

### Key Data Types

- `src/lib/interview/types.ts` — `ResumeProfile`, `InterviewQuestion`, `InterviewTranscriptTurn`

## Code Style

- ESLint: `@antfu/eslint-config` with React — semicolons required, single quotes, single JSX quotes
- Path alias: `@/*` resolves to `./src/*`
- Chinese language UI — the app targets Chinese-speaking users
