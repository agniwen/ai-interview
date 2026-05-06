---
name: resume-parser
description: Use when the user asks Claude to analyze, parse, screen, summarize, or extract structured data from one or more local resume PDFs (.pdf). Triggers include "解析简历", "分析这份简历", "看下这个简历", "parse the resumes in <folder>", "analyze this resume". Sends each PDF to the resume-parser backend at interview.chainthink.cn, then writes a structured JSON profile and a Chinese Markdown report next to each source file.
---

# Resume Parser Skill

This skill turns PDF resumes into structured candidate profiles + readable
Markdown reports by calling the hosted resume-parser backend at
`https://interview.chainthink.cn`.

## When to use

Trigger this skill when the user:

- Points at one or more PDF files and asks for analysis, parsing, screening, or summary
- Says things like "帮我看下这份简历", "解析这个 PDF", "parse the resumes under ~/Downloads/candidates"
- Wants structured candidate data (skills, work experience, education) extracted from a PDF

Do **not** trigger this skill for non-PDF resumes (e.g. .docx, .txt) — it only handles PDFs.

## Workflow

Follow these steps in order. The skill ships with a single Node 18+ script
`parse.mjs` that handles authentication and HTTP.

### Step 1 — Resolve the PDFs

Glob the path the user gave you. Skip non-`.pdf` files. If more than 5 PDFs
match, list them and confirm with the user before continuing.

### Step 2 — Make sure we're authenticated

Run:

```bash
node ${CLAUDE_PLUGIN_ROOT}/parse.mjs login --check
```

If it exits non-zero, the user needs to authorize. Run:

```bash
node ${CLAUDE_PLUGIN_ROOT}/parse.mjs login
```

The script prints a `verification_uri_complete` URL and a short `user_code`.
**Show both to the user** and tell them to open the URL in a browser, log in
with their company account, and approve. The script will block until the
device flow completes (or times out after 10 minutes). Do not proceed to
Step 3 until login succeeds.

### Step 3 — Parse each PDF

For each PDF, run:

```bash
node ${CLAUDE_PLUGIN_ROOT}/parse.mjs run /absolute/path/to/resume.pdf
```

The script writes two files **next to the input**:

- `<basename>.profile.json` — structured candidate data
- `<basename>.report.md` — Chinese Markdown report

After each run, briefly tell the user the two output paths. If the script
exits with `error: rate_limited` or HTTP 429, **stop the loop** and inform
the user that today's quota is exhausted.

### Step 4 — Comparative summary (only if multiple PDFs)

After all PDFs are processed, read each `*.report.md` and produce a short
side-by-side comparison: top skills, years of experience, target roles,
notable risk signals from the timeline analysis. Keep it under ~200 words.

## Constraints

- **Do not** read PDF binary content yourself before calling the script. The
  backend handles parsing — sending the binary as-is is required so it can
  fall back to vision OCR for image PDFs.
- **Do not** invoke the script's `login` subcommand without `--check` first.
  Re-running `login` when a valid token already exists wastes the user's time.
- If a PDF is larger than 20MB, skip it and tell the user — the backend will
  reject it.
- Authentication tokens live at `~/.config/resume-parser-skill/token.json`
  (mode 0600). Never print the token contents.
- The default backend is `https://interview.chainthink.cn`. Users can override
  by setting `RESUME_SKILL_BASE_URL` before invoking the script.

## Failure modes

| Script output                       | What to do                                 |
| ----------------------------------- | ------------------------------------------ |
| `error: unauthenticated` (exit 2)   | Re-run `login`; surface URL + user_code    |
| `error: rate_limited` (exit 3)      | Stop, tell the user the quota is gone      |
| `error: file_too_large` (exit 4)    | Skip that file, continue with others       |
| `error: unsupported_media` (exit 5) | Skip that file (not a real PDF)            |
| Any other non-zero exit             | Show stderr to the user, stop the workflow |
