---
name: verify
description: Run full project verification — linting, type checking, and tests across both web and agent packages.
---

Run the following verification steps and report results:

1. **TypeScript type check**: `pnpm typecheck`
2. **ESLint**: `pnpm lint`
3. **Python lint**: `cd agent && uv run ruff check`
4. **Python tests**: `cd agent && uv run pytest`

Run all steps even if earlier ones fail. Report a summary of pass/fail for each step with any errors.
