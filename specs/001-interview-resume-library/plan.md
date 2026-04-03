# Implementation Plan: Interview Resume Library

**Branch**: `001-interview-resume-library` | **Date**: 2026-03-10 | **Spec**: `/Users/obito/dev/ai-tool-demo/specs/001-interview-resume-library/spec.md`
**Input**: Feature specification from `/specs/001-interview-resume-library/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Build an internal studio resume-library workflow for interview candidates by expanding the existing interview management module with richer CRUD, multi-round scheduling, and shareable interview links. The implementation will reuse the current Next.js App Router, Hono API, Drizzle/Postgres persistence, and existing resume-analysis service, while replacing the candidate-facing upload-first `/interview` flow with a dynamic `/interview/[id]` page that loads stored resume and interview data by record id.

## Technical Context

<!--
  ACTION REQUIRED: Replace the content in this section with the technical details
  for the project. The structure here is presented in advisory capacity to guide
  the iteration process.
-->

**Language/Version**: TypeScript 5.x on Node.js with Next.js 16 / React 19  
**Primary Dependencies**: Next.js App Router, Hono, Drizzle ORM, Postgres, Zod, React Hook Form, TanStack Table, Better Auth, ElevenLabs client  
**Storage**: PostgreSQL via Drizzle ORM; structured resume and interview data persisted in relational tables plus JSON fields where already established  
**Testing**: Repository-standard validation via `npm run lint`, `npm run typecheck`, and manual browser verification flows documented in `quickstart.md`  
**Target Platform**: Web application for internal studio admins and public candidate interview links
**Project Type**: Full-stack web application  
**Performance Goals**: Studio list and detail views feel responsive for low-thousands of candidate records; candidate interview page loads stored interview context within 2 seconds in normal network conditions  
**Constraints**: Must preserve existing repo patterns; must reuse existing resume-analysis capability; candidate interview page must no longer require resume upload; unique link must resolve through `/interview/{id}`  
**Scale/Scope**: One studio resume-library module, one public candidate interview route, expanded interview record schema with one-to-many interview rounds

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- The constitution file at `/Users/obito/dev/ai-tool-demo/.specify/memory/constitution.md` is a placeholder template with no project-specific enforceable principles or gates.
- No explicit constitutional violations are defined for this feature.
- Gate status before research: PASS
- Gate status after design: PASS

## Project Structure

### Documentation (this feature)

```text
specs/001-interview-resume-library/
├── plan.md              # This file (/speckit.plan command output)
├── research.md          # Phase 0 output (/speckit.plan command)
├── data-model.md        # Phase 1 output (/speckit.plan command)
├── quickstart.md        # Phase 1 output (/speckit.plan command)
├── contracts/           # Phase 1 output (/speckit.plan command)
└── tasks.md             # Phase 2 output (/speckit.tasks command - NOT created by /speckit.plan)
```

### Source Code (repository root)
<!--
  ACTION REQUIRED: Replace the placeholder tree below with the concrete layout
  for this feature. Delete unused options and expand the chosen structure with
  real paths (e.g., apps/admin, packages/something). The delivered plan must
  not include Option labels.
-->

```text
app/
├── api/[[...route]]/route.ts
├── interview/
│   ├── [id]/page.tsx              # New public candidate-facing interview route
│   └── _components/
├── studio/
│   ├── (auth)/interviews/page.tsx
│   └── interviews/_components/
lib/
├── db/
│   ├── index.ts
│   ├── relations.ts
│   └── schema.ts
├── interview/
└── studio-interviews.ts
server/
├── app.ts
├── middlewares/
└── routes/
    ├── interview/
    └── studio-interviews/
drizzle/
└── */migration.sql
```

**Structure Decision**: Use the existing monolithic Next.js web-app structure. Extend `app/studio/(auth)/interviews/page.tsx`, `app/studio/interviews/_components/`, `server/routes/studio-interviews/route.ts`, `lib/studio-interviews.ts`, and `lib/db/schema.ts` for admin CRUD. Add a new public dynamic candidate route under `app/interview/[id]/page.tsx` and extend `server/routes/interview/route.ts` to serve candidate-facing record data and per-record token access.

## Complexity Tracking

No constitution violations require justification for this feature.
