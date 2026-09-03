---
name: verify
description: Run full project verification — linting, type checking, and tests across both web and agent packages.
---

Run every verification step even if an earlier one fails, then report a concise
pass/fail summary with the relevant error for each failure:

1. **TypeScript lint and format check**: `bun run check`
2. **TypeScript type check**: `bun run typecheck`
3. **TypeScript tests**: `bun run test`
4. **Python lint**: `cd apps/livekit-agent && uv run ruff check`
5. **Python format check**: `cd apps/livekit-agent && uv run ruff format --check`
6. **Python tests**: `cd apps/livekit-agent && uv run python -m pytest`

If the Python development tools are unavailable, report that `uv sync --project
apps/livekit-agent --dev` is required; do not silently skip those steps.
