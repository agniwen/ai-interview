# Resume Parser Skill

A Claude Code skill that turns local PDF resumes into structured candidate
profiles + Markdown reports by calling the hosted backend at
`https://interview.chainthink.cn`.

## Install

The skill is a directory you drop into `~/.claude/skills/`. Easiest path:

```bash
git clone --depth=1 \
  https://github.com/<your-org>/ai-tool-demo.git /tmp/ai-tool-demo
cp -R /tmp/ai-tool-demo/skill/resume-parser ~/.claude/skills/resume-parser
```

Requirements:

- Node.js ≥ 18 (for built-in `fetch` / `FormData`)
- A user account on `interview.chainthink.cn`

## First-time login

In Claude Code, just ask Claude to parse a resume — the skill will trigger
`node parse.mjs login` automatically and surface the verification URL +
user_code to you. Open the URL, log in, click 确认授权.

You can also run it manually:

```bash
node ~/.claude/skills/resume-parser/parse.mjs login
```

The token is saved to `~/.config/resume-parser-skill/token.json` (mode 0600)
and reused on subsequent calls.

## Usage from Claude Code

Just ask, in any of these forms:

- "帮我解析 ~/Downloads/张三.pdf"
- "Parse the resumes under ~/Downloads/candidates"
- "看下这份简历的关键信息"

For each PDF, two files are written next to it:

- `<name>.profile.json` — structured candidate data (skills, experience, etc.)
- `<name>.report.md` — Chinese Markdown report

If multiple PDFs were processed, Claude will follow up with a comparative
summary.

## CLI usage (without Claude)

```bash
node ~/.claude/skills/resume-parser/parse.mjs login --check
node ~/.claude/skills/resume-parser/parse.mjs run /path/to/resume.pdf
```

Outputs to stderr/stdout in JSON for easy piping.

## Configuration

| Env var                   | Default                           | Purpose                             |
| ------------------------- | --------------------------------- | ----------------------------------- |
| `RESUME_SKILL_BASE_URL`   | `https://interview.chainthink.cn` | Override backend (e.g. self-hosted) |
| `RESUME_SKILL_CONFIG_DIR` | `~/.config/resume-parser-skill`   | Override token storage dir          |

## Limits

- Max PDF size: 20 MB
- Daily quota: 50 parses per token (contact admin to raise)
- Supported format: PDF only (image PDFs OK — backend has vision fallback)

## Privacy

The PDF is sent to the backend, parsed by Alibaba Qwen3-max (with Google
Gemini Vision as image-PDF fallback), and the response is returned to you.
The backend stores access tokens (hashed) and request metadata for rate
limiting; resume content is **not** persisted.

## Revoke access

Run on the backend:

```sql
UPDATE skill_access_token SET revoked_at = NOW() WHERE id = '<token-id>';
```

Or delete the local file `~/.config/resume-parser-skill/token.json` to log
out from this machine.
