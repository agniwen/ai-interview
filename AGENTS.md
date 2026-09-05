# Repository instructions

This is the shared instruction source for coding agents. `CLAUDE.md` imports this file; maintain rules here or in the linked references, not in parallel copies.

## Work contract

- Finish the user's requested outcome. Resolve routine choices from repository evidence; ask only when a missing decision materially changes scope, correctness, or an irreversible action. Continue independent work while waiting.
- Follow system/developer requirements, then the user's explicit task instructions, then applicable repository and skill guidance. Existing authorization remains valid for that task. If guidance blocks progress, identify the exact file and instruction and explain the conflict.
- Treat follow-up messages as steering for the active task unless the user cancels or replaces it. Carry forward accepted decisions and verification results.
- Define a checkable outcome, inspect the affected implementation, make the smallest coherent change, and verify it. A brief plan is useful for multiple dependent steps; routine edits need no planning ceremony.
- Preserve unrelated work, data semantics, and public contracts. Remove only dead code introduced by your change. Prefer existing components and local patterns over speculative abstractions.
- Commit, push, deploy, and send external messages only within explicit user authorization. “提交” authorizes a scoped commit; “推送” also authorizes pushing. Inspect the diff before either action.

## Communication and tools

- Use concise Chinese prose with the outcome first. Explain material decisions, verification, and blockers; avoid a running command log and repeated summaries. Use lists when they improve comparison or scanning.
- Batch independent reads and searches. Use subagents only when available and permitted, for bounded independent work that benefits from delegation; keep dependent edits sequential and verify delegated results.
- Load only skills and references whose triggers match the task. Read them before relevant edits; a documentation or styling change does not automatically trigger a framework migration workflow.
- Treat scripts, manifests, exports maps, and schemas as the source of current commands, versions, and paths. Verify stale examples against code instead of expanding compatibility layers to match documentation.

## Repository map

Chinese-first voice interview and resume screening application. Product copy and interview prompts use Simplified Chinese.

- `apps/web/`: TanStack Start/Router/Query, React, shadcn/ui, Tailwind; mounts Hono at `/api`.
- `apps/server/`: Hono, Drizzle/PostgreSQL, Better Auth; shared app factory for Web and standalone entrypoints.
- `apps/worker/`: background processing. `apps/desktop/`: Electron application.
- `apps/livekit-agent/`: Python LiveKit voice agent. Keep `src/agent.py` as its deployment entrypoint.
- `packages/`: `@app/*` workspace packages. Keep pure contracts in `@app/shared`, schema/relations in `@app/db-schema`, and runtime tools in their owning package.

Use Bun for TypeScript workspaces and uv for Python. Read `package.json`, the affected package's scripts, and `apps/livekit-agent/pyproject.toml` for versions and commands.

## Load by task

Read the matching reference before changing the corresponding behavior. Relative paths in this table start at the repository root.

| Task                                                                                 | Required reference                                                                                                        |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Job setup, JD snapshots, resume evaluation prompts/results or evaluation UI          | [Resume evaluation contract](docs/agents/resume-evaluation.md) and the ADRs linked there                                  |
| Hono routes, middleware, application verbs, DAO ownership, Server/Worker integration | [Server architecture](docs/agents/server-architecture.md)                                                                 |
| Package exports, browser HTTP clients, SSR helpers, shared modules, schema ownership | [Runtime boundaries](docs/agents/runtime-boundaries.md)                                                                   |
| TanStack Start/Router APIs, navigation, loaders, route masks, search params, SSR     | [TanStack Intent catalog](docs/agents/tanstack-intent.md); run the matching guidance command before editing that behavior |
| LiveKit agent code, voice prompts, tools, workflows or handoffs                      | [Voice agent](docs/agents/voice-agent.md)                                                                                 |
| Environment variables, deployment configuration, transactional email                 | [Environment setup](docs/agents/environment.md)                                                                           |
| Domain terminology or architecture decisions                                         | [Domain documentation](docs/agents/domain.md), root `CONTEXT.md`, and relevant `docs/adr/` entries                        |
| GitHub issue work                                                                    | [Issue tracker](docs/agents/issue-tracker.md); for triage also read [triage labels](docs/agents/triage-labels.md)         |

## Boundaries to keep visible

- Keep `apps/web/src/routes/` limited to route declarations, loaders, search validation, and thin page composition. Feature UI/state belongs under `src/components/features/`; client utilities under `src/lib/client/`; Start helpers under `src/lib/start/`. This also applies to route-generator-excluded helper files.
- Preserve `.route("/api", apiRoutes)` and typed `rpc.api.*` calls. Keep the backend independent of browser and TanStack request primitives; external consumers use declared package exports.
- Job `prompt` is the canonical “岗位 JD”. Job saving has one Save action. Retired scoring settings stay historical; new evaluations use 不推荐 / 待定 / 推荐 / 非常推荐 and never change recruiter decisions automatically. Read the full evaluation contract for changes in this area.
- Reuse existing UI primitives, design tokens, loading transitions, and accessibility behavior. A primitive being excluded from lint does not make it immutable: inspect shared callers and keep authorized changes scoped. Preserve registry customizations when importing upstream components.
- Keep each app's environment within its owner and update its schema and `.env.example` together. Use the linked environment guide for details.

## Verification and completion

- Choose verification by the behavior at risk. Fixes need a reproduction and an outcome check; add a regression test when it protects behavior. Copy, styling, and documentation changes need appropriate inspection rather than tests that repeat the implementation.
- For TypeScript behavior, run the affected tests, package typecheck, and lint/format on changed files. For shared APIs, check both producer and consumers. For UI, inspect the target browser or Desktop surface when available and disclose any unverified platform.
- For documentation-only changes, check links, paths, command examples, consistency, and the diff. Application tests/builds are unnecessary unless runtime behavior also changes.
- Typical commands: `bun run --filter @app/web test <test-path>`, `bun run --filter @app/web typecheck`, `bun run check <changed-files>`, and `git diff --check`. Substitute the owning package; consult its scripts for available checks. Root build/test/typecheck commands fan out through Turbo.
- Format only changed files with `bun run fix <changed-files>`. Python uses `uv run ruff format`, `uv run ruff check`, and `uv run pytest` from `apps/livekit-agent/`; the voice guide defines its behavioral test-first requirement.
- After relevant checks pass, repeat or broaden them only for a new change, failure, or unresolved risk. Honor explicitly required checks. Report pre-existing failures separately instead of fixing unrelated code or claiming all checks passed.
- Finish when the requested behavior is implemented and relevant verification is accounted for. Report the outcome, checks, and remaining limits concisely. Use conventional commit messages when a commit is authorized.

## Maintaining these instructions

Keep shared rules here, task-specific details behind explicit triggers, and tool-specific additions in their entry file. Update a rule in one place and inspect the linked references for conflicts. Preserve product/architecture constraints when shortening text.

Behavioral guidance reviewed against [OpenAI's GPT-6 Astra prompting recommendations](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-6-astra) on 2026-09-05. These are repository working conventions, not an application model migration or API configuration.
