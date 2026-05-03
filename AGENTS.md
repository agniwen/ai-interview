# ai-interview Development Guidelines

AI-powered voice interview/resume screening application. Chinese-first locale — agent instructions and interview prompts are in Simplified Chinese.

## Architecture

pnpm + Turbo workspace.

- **Web app** (`apps/ai-interview/`): Next.js 16 + React 19, App Router, Hono API routes, Drizzle ORM + PostgreSQL, Better Auth, shadcn/ui + Tailwind CSS v4
- **Voice agent** (`apps/agent/`): Python LiveKit Agents SDK, ElevenLabs TTS, Alibaba Qwen STT/LLM
- **Shared packages** (`packages/`): e.g. `@repo/adapter-feishu`

Two separate package managers: **pnpm** for web, **uv** for Python agent. Do not mix them.

## Commands

### Web (from project root)

- `pnpm dev` — dev server
- `pnpm build` — production build
- `pnpm typecheck` — TypeScript type checking
- `pnpm check` — Ultracite/Oxlint check
- `pnpm fix` — Ultracite/Oxlint autofix
- `pnpm --filter ai-interview db:push` — sync Drizzle schema to database
- `pnpm --filter ai-interview db:migrate` — run migrations
- `pnpm --filter ai-interview db:studio` — Drizzle Studio UI
- `pnpm --filter ai-interview db:seed` — seed data

### Agent (from `apps/agent/`)

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
- **TypeScript**: Ultracite (Oxlint + Oxfmt) — see Ultracite Code Standards below. Run `pnpm dlx ultracite fix` before committing.
- **Python**: Ruff — double quotes, 88 char line length
- **Components**: shadcn/ui with new-york style, CSS variables for theming

## Environment Setup

Copy `.env.example` to `.env` and populate required keys. Key requirements:

- LiveKit Cloud credentials (`LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`)
- Google OAuth (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
- Database (`DATABASE_URL`)
- AI providers (`GOOGLE_GENERATIVE_AI_API_KEY`, `ELEVENLABS_API_KEY`, `ALIBABA_API_KEY`)

## Gotchas

- Must run `uv run src/agent.py download-files` before first agent run to download Silero VAD and turn-detector models
- `apps/ai-interview/src/components/agents-ui/` and `apps/ai-interview/src/hooks/agents-ui/` are upstream LiveKit UI code, ignored by Oxlint — avoid modifying these
- Next.js config uses `output: 'standalone'` for Docker deployment
- Drizzle ORM/Kit are on RC (`1.0.0-rc.1`). Note RC breaking changes from beta: casing API moved to per-table helpers; RQBv1 (`db._query`) removed; `drizzle({ relations })` no longer accepts `schema` alongside `relations`

<!-- MANUAL ADDITIONS START -->
<!-- MANUAL ADDITIONS END -->

# Ultracite Code Standards

This project uses **Ultracite**, a zero-config preset that enforces strict code quality standards through automated formatting and linting.

## Quick Reference

- **Format code**: `pnpm dlx ultracite fix`
- **Check for issues**: `pnpm dlx ultracite check`
- **Diagnose setup**: `pnpm dlx ultracite doctor`

Oxlint + Oxfmt (the underlying engine) provides robust linting and formatting. Most issues are automatically fixable.

---

## Core Principles

Write code that is **accessible, performant, type-safe, and maintainable**. Focus on clarity and explicit intent over brevity.

### Type Safety & Explicitness

- Use explicit types for function parameters and return values when they enhance clarity
- Prefer `unknown` over `any` when the type is genuinely unknown
- Use const assertions (`as const`) for immutable values and literal types
- Leverage TypeScript's type narrowing instead of type assertions
- Use meaningful variable names instead of magic numbers - extract constants with descriptive names

### Modern JavaScript/TypeScript

- Use arrow functions for callbacks and short functions
- Prefer `for...of` loops over `.forEach()` and indexed `for` loops
- Use optional chaining (`?.`) and nullish coalescing (`??`) for safer property access
- Prefer template literals over string concatenation
- Use destructuring for object and array assignments
- Use `const` by default, `let` only when reassignment is needed, never `var`

### Async & Promises

- Always `await` promises in async functions - don't forget to use the return value
- Use `async/await` syntax instead of promise chains for better readability
- Handle errors appropriately in async code with try-catch blocks
- Don't use async functions as Promise executors

### React & JSX

- Use function components over class components
- Call hooks at the top level only, never conditionally
- Specify all dependencies in hook dependency arrays correctly
- Use the `key` prop for elements in iterables (prefer unique IDs over array indices)
- Nest children between opening and closing tags instead of passing as props
- Don't define components inside other components
- Use semantic HTML and ARIA attributes for accessibility:
  - Provide meaningful alt text for images
  - Use proper heading hierarchy
  - Add labels for form inputs
  - Include keyboard event handlers alongside mouse events
  - Use semantic elements (`<button>`, `<nav>`, etc.) instead of divs with roles

### Error Handling & Debugging

- Remove `console.log`, `debugger`, and `alert` statements from production code
- Throw `Error` objects with descriptive messages, not strings or other values
- Use `try-catch` blocks meaningfully - don't catch errors just to rethrow them
- Prefer early returns over nested conditionals for error cases

### Code Organization

- Keep functions focused and under reasonable cognitive complexity limits
- Extract complex conditions into well-named boolean variables
- Use early returns to reduce nesting
- Prefer simple conditionals over nested ternary operators
- Group related code together and separate concerns

### Security

- Add `rel="noopener"` when using `target="_blank"` on links
- Avoid `dangerouslySetInnerHTML` unless absolutely necessary
- Don't use `eval()` or assign directly to `document.cookie`
- Validate and sanitize user input

### Performance

- Avoid spread syntax in accumulators within loops
- Use top-level regex literals instead of creating them in loops
- Prefer specific imports over namespace imports
- Avoid barrel files (index files that re-export everything)
- Use proper image components (e.g., Next.js `<Image>`) over `<img>` tags

### Framework-Specific Guidance

**Next.js:**

- Use Next.js `<Image>` component for images
- Use `next/head` or App Router metadata API for head elements
- Use Server Components for async data fetching instead of async Client Components

**React 19+:**

- Use ref as a prop instead of `React.forwardRef`

**Solid/Svelte/Vue/Qwik:**

- Use `class` and `for` attributes (not `className` or `htmlFor`)

---

## Testing

- Write assertions inside `it()` or `test()` blocks
- Avoid done callbacks in async tests - use async/await instead
- Don't use `.only` or `.skip` in committed code
- Keep test suites reasonably flat - avoid excessive `describe` nesting

## When Oxlint + Oxfmt Can't Help

Oxlint + Oxfmt's linter will catch most issues automatically. Focus your attention on:

1. **Business logic correctness** - Oxlint + Oxfmt can't validate your algorithms
2. **Meaningful naming** - Use descriptive names for functions, variables, and types
3. **Architecture decisions** - Component structure, data flow, and API design
4. **Edge cases** - Handle boundary conditions and error states
5. **User experience** - Accessibility, performance, and usability considerations
6. **Documentation** - Add comments for complex logic, but prefer self-documenting code

---

Most formatting and common issues are automatically fixed by Oxlint + Oxfmt. Run `pnpm dlx ultracite fix` before committing to ensure compliance.
