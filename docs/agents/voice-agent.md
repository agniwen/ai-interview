# Voice Agent Development

Read for changes under `apps/livekit-agent/` or shared prompts used by the voice agent. The test-first requirement below applies to runtime agent behavior, not repository instruction documents. Paths are relative to the repository root.

## Voice Agent Development (`apps/livekit-agent/`)

### Entrypoint and structure

- All Python agent code lives in `apps/livekit-agent/src/`. **Keep `apps/livekit-agent/src/agent.py` as the entrypoint** — the `Dockerfile` references it directly for production deployment, so do not rename or move it.
- Use `uv` for everything (install, run, test) — never mix in `pip`/`poetry`. Run commands from `apps/livekit-agent/`; use `uv run src/agent.py dev` or `uv run src/agent.py console`. Before the first run, execute `uv run -m livekit.agents download-files`.
- Format and lint Python with `uv run ruff format` and `uv run ruff check` before committing.

### LiveKit documentation access

LiveKit Agents evolves quickly; prefer the latest docs over training-data recall. Two access paths:

- **LiveKit CLI** (`lk docs`, requires CLI 2.15.0+ — check `lk --version`):
  - macOS: `brew install livekit-cli` (update: `brew update && brew upgrade livekit-cli`)
  - Linux: `curl -sSL https://get.livekit.io/cli | bash`
  - Windows: `winget install LiveKit.LiveKitCLI`
  - Key subcommands: `lk docs overview`, `lk docs search`, `lk docs get-page`, `lk docs code-search`, `lk docs changelog`, `lk docs submit-feedback`. Prefer browsing (`overview`/`get-page`) over `search`, and `search` over `code-search`.
- **LiveKit Docs MCP server**: Streamable HTTP transport at <https://docs.livekit.io/mcp> for IDE integration.

If documentation is incomplete, report the gap to the user. Submit external feedback only when the user requests it.

Beyond docs, `lk` also manages other LiveKit resources (e.g. SIP trunks for telephony). Run `lk --help` to explore.

### Workflows: handoffs and tasks

Voice agents are highly latency-sensitive. Avoid monolithic prompts that try to cover every conversation phase — they bloat each LLM request and hurt reliability. Use LiveKit's **handoffs** (one agent transfers control to another) and **tasks** (tightly-scoped prompts for a single outcome) to keep per-request context small and focused. See <https://docs.livekit.io/agents/build/workflows/>.

### Testing core agent behavior (TDD)

When modifying voice-agent prompts, tool descriptions, or task / workflow / handoff definitions, **write behavior tests in `apps/livekit-agent/tests/` first** and iterate until they pass — don't guess at LLM behavior. Run with `uv run pytest`. See <https://docs.livekit.io/agents/start/testing/>.
