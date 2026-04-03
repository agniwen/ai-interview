# Internship Resume Screening Chatbot

A chat-based application for intern resume screening, built with:

- Next.js (App Router, TypeScript)
- AI SDK (`useChat` + `streamText`)
- AI Elements (`conversation`, `message`, `prompt-input`, `attachments`, `tool`, `reasoning`, `sources`, `suggestion`)
- Gemini provider (`@ai-sdk/google`)

## Included features

- Unified model configuration via `GOOGLE_MODEL` in `.env.local`
- Upload and analyze multiple resume PDFs
- Settings menu with Job Description (JD) input for secondary evaluation context
- Auto-generate a working JD from user intent (e.g. "我需要招聘行政")
- Resume-screening oriented chat flow with suggestions and actions
- Tool calling UI (`Tool`) with backend demo screening tools
- Reasoning and source sections (when provider/model supports them)
- Conversation export, copy, and regenerate actions

## PDF extraction stack

- `pdf-parse`: extracts text from uploaded resume PDFs server-side
- `lib/resume-pdf.ts`: reusable parser + structured info extractor
- Built-in resume tools in `app/api/chat/route.ts`:
  - `list_uploaded_resume_pdfs`
  - `extract_resume_pdf_text`
  - `extract_resume_pdf_structured_info`

## 1) Configure environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

Set values in `.env.local`:

- `GOOGLE_GENERATIVE_AI_API_KEY`: your Gemini API key
- `GOOGLE_MODEL`: optional model id (default `gemini-3-flash-preview`)
- `GOOGLE_GENERATIVE_AI_BASE_URL`: optional custom endpoint / proxy

## 2) Run locally

```bash
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## 3) Useful commands

```bash
npm run lint
npm run build
```

## Project structure

- `app/page.tsx`: intern resume screening chat UI powered by AI Elements + `useChat`
- `app/api/chat/route.ts`: server route using `streamText` + Gemini provider
- `.env.example`: required env placeholders
