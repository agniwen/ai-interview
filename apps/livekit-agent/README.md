# Voice Interview Agent

Python LiveKit agent that conducts the live interview half of **AI Recruitment
Copilot**. The web app (`../ai-recruitment-copilot/`) handles auth, resume upload/parsing,
screening chat, and interview scheduling; this agent joins a LiveKit room and
runs the actual voice conversation, then reports the transcript back to web.

For repo-wide setup (web + agent together), see the root [`README.md`](../../README.md).

## Pipeline

| Stage          | Provider                                          | Notes                           |
| -------------- | ------------------------------------------------- | ------------------------------- |
| STT            | ElevenLabs (`scribe_v2`, language `zh`)           | livekit-plugins-elevenlabs      |
| LLM            | Aliyun DashScope (`deepseek-v4-flash-0731` by default) | OpenAI-compatible endpoint      |
| TTS            | Minimax                                           | livekit-plugins-minimax-ai      |
| VAD            | Silero                                            | downloaded via `download-files` |
| Turn-detection | LiveKit multilingual model                        | downloaded via `download-files` |
| Recording      | LiveKit Egress → Cloudflare R2                    | see `src/recording.py`          |

Worker registers with `AGENT_NAME`, defaulting to `giaogiao`. The web side
dispatches sessions to that name via `AGENT_NAME` / `NEXT_PUBLIC_AGENT_NAME` —
all three values must match.

## Setup

Python 3.11, [`uv`](https://docs.astral.sh/uv/) required. Do not mix in
`pip` / `poetry`.

```bash
cd apps/livekit-agent
uv sync                                  # install deps into .venv
uv run -m livekit.agents download-files  # Silero VAD + turn-detector models
cp .env.example .env                     # then fill in values (see comments inside)
```

`.env` is loaded by `src/agent.py` via `python-dotenv` (`load_dotenv()`) — it
lives **inside `apps/livekit-agent/`**, separate from the server environment:
`apps/ai-recruitment-copilot/.env` for the integrated web runtime, or
`apps/ai-recruitment-copilot-backend/.env` for the standalone backend. Shared
values (`LIVEKIT_*`, `CALLBACK_BASE_URL`, `AGENT_CALLBACK_SECRET`,
`RECORDING_R2_*`) must stay in lock-step with whichever server runtime is deployed.

For a self-hosted LiveKit server and agent worker, set
`INTERVIEW_SELF_HOSTED=1`. This pins the local `v1-mini` turn detector, uses
VAD interruption handling, and disables Cloud-only noise cancellation. Leave
it unset for LiveKit Cloud so the full turn detector, adaptive interruption,
and Cloud audio enhancement remain active. For local troubleshooting, you can
disable only noise cancellation with `INTERVIEW_DISABLE_NOISE_CANCELLATION=1`.

## Running

```bash
uv run src/agent.py dev        # worker + hot reload, joins LiveKit Cloud
uv run src/agent.py start      # worker in production mode (no reload)
uv run src/agent.py console    # interactive terminal chat — no LiveKit room
```

From the repo root, the Makefile wraps these:

```bash
make agent-dev        # equivalent to: uv run src/agent.py dev
make agent-console    # terminal-only chat
make agent-start      # production-mode worker
make dev              # parallel: web dev server + agent dev worker
```

## Tests & linting

```bash
uv run pytest             # full test suite
uv run ruff format        # format
uv run ruff check         # lint
```

When modifying agent instructions, tool descriptions, or handoff / task
definitions, write the test first under `tests/` and iterate until it passes —
LLM behaviour is too hard to verify by eye. See the LiveKit
[testing & evaluation framework](https://docs.livekit.io/agents/start/testing/).

## Deployment

### First-time setup (forking / cloning this repo)

The committed `livekit.toml` and the `--project resume` flag in the root
`Makefile` are bound to the original author's LiveKit Cloud project. A fresh
clone needs to repoint both at your own project before `make agent-deploy`
will work.

1. **Install the LiveKit CLI** (2.15.0+) and log in:

   ```bash
   brew install livekit-cli                 # macOS
   # or: curl -sSL https://get.livekit.io/cli | bash   # Linux
   # or: winget install LiveKit.LiveKitCLI             # Windows
   lk cloud auth                            # browser login
   lk project add <your-project-alias>      # alias used by --project flags
   ```

2. **Reset the project binding.** Delete the upstream `apps/livekit-agent/livekit.toml` so
   the next `lk agent create` regenerates it against your project:

   ```bash
   rm apps/livekit-agent/livekit.toml
   ```

3. **Update the Makefile project alias.** In the repo root `Makefile`, change
   `--project resume` in the `agent-deploy` and `agent-update-secrets` targets
   to your own alias (or drop the flag to use your default project).

4. **Fill in secrets.** `.env.secrets` is what `lk agent deploy` uploads to
   LiveKit Cloud (separate from the local `.env` used by
   `uv run src/agent.py dev`). Copy and populate:

   ```bash
   cd apps/livekit-agent
   cp .env.example .env.secrets
   # fill in LIVEKIT_*, DASHSCOPE_API_KEY, ELEVEN_API_KEY, DEEPGRAM_API_KEY,
   #         MINIMAX_API_KEY,
   #         CALLBACK_BASE_URL, AGENT_CALLBACK_SECRET, RECORDING_R2_*
   ```

   `CALLBACK_BASE_URL` must point at your deployed web service (the agent
   POSTs session events back there). `AGENT_CALLBACK_SECRET`, `LIVEKIT_*`,
   and `RECORDING_R2_*` must match `apps/ai-recruitment-copilot/.env` for the
   integrated runtime, or `apps/ai-recruitment-copilot-backend/.env` for the
   standalone backend.

5. **Align the agent name with the web side.** Set `AGENT_NAME` in the worker
   and web environments, and set `NEXT_PUBLIC_AGENT_NAME` to the same value.
   All three default to `giaogiao` in the checked-in examples.

6. **First deploy.** From `apps/livekit-agent/`:

   ```bash
   lk agent create --secrets-file .env.secrets --project <your-alias>
   ```

   This builds the image, uploads secrets, and writes a fresh `livekit.toml`
   bound to your project + new agent id. Commit that regenerated file.

### Subsequent deploys

```bash
make agent-deploy             # build + push new code (uses .env.secrets)
make agent-update-secrets     # only refresh env vars and restart
```

`Dockerfile` builds from `src/agent.py` — keep that file name; the production
image references it directly.

## Code layout

```
src/
  agent.py        Entrypoint — AgentSession wiring, room handlers, dispatch
  recording.py    LiveKit Egress → R2 recording lifecycle
  report.py       POSTs session summary back to web (CALLBACK_BASE_URL)
  aliyun_stt.py   Optional aligned DashScope streaming STT adapter
tests/            pytest suite
```

## LiveKit documentation

LiveKit Agents evolves quickly — prefer the latest docs over training-data
recall. Browse from the terminal with the LiveKit CLI (requires `lk` 2.15.0+):

```bash
lk docs overview
lk docs search "voice agents"
lk docs get-page /agents/start/voice-ai-quickstart
```

Or use the MCP server at <https://docs.livekit.io/mcp> for IDE integration.
Submit doc feedback inline via `lk docs submit-feedback` if you hit gaps.
