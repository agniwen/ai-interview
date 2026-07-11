# Workspace Recruiting Copilot implementation plan

This plan follows ADR 0013. The existing `/chat` route will be replaced in place with a workspace-scoped recruiting copilot. Legacy chat history may be cleared during migration.

## Product boundaries

- The copilot can inspect the entire active workspace resume library and job descriptions by default.
- Resume-file upload is not part of the new chat capability.
- The first version supports candidate retrieval, job matching, candidate comparison, and confirmable action proposals.
- Candidate comparison is capped at five candidates per answer.
- The copilot cannot directly mutate recruiting records. It can only return action proposals that the user confirms in the UI.
- Confirmed actions must use existing guarded business APIs and leave timeline or operation-log evidence.
- Assistant UI owns interaction rendering only. Existing `chat_conversation` and `chat_message` remain the persistence source.

## Phase 1: Retrieval contracts

Build stable backend schemas and read tools before touching the main UI.

- `search_resume_records`: combine structured filters with semantic recall and return candidate summary cards.
- `get_resume_record_detail`: load full resume profile or resume text only when needed.
- `search_job_descriptions`: find active job descriptions in the workspace.
- `get_job_description_detail`: load the job description context for matching and citations.
- Retrieval outputs include citation metadata for every system record used.

Verify:

- Unit tests prove workspace scoping.
- Tool tests prove summary-card shape does not include full resume text by default.
- Retrieval tests cover structured-only, semantic-only, and combined filter cases.

## Phase 2: Mastra copilot agent

Introduce a single `RecruitingCopilotAgent` that orchestrates read tools.

- Do not introduce supervisor agents or subagents in the first version.
- Do not use Mastra Memory for business memory.
- Normal chat turns stay agent-driven; workflows are reserved for deterministic long-running actions.
- The agent must answer with citation metadata when using system records.

Verify:

- Focused tests cover candidate retrieval, job matching, and comparison.
- Boundary evals cover no cross-workspace leakage, no upload request as the main path, and the five-candidate comparison cap.

## Phase 3: Assistant UI replacement

Replace the current `/chat` thread and composer in place while preserving the current app shell.

- Keep the existing sidebar as the session list.
- Keep the existing top-level Chat/Studio switch.
- Remove attachment upload from the chat composer.
- Use assistant-ui primitives for thread, composer, citations, and action-proposal rendering.
- Use a custom thread persistence adapter over the existing chat conversation APIs.

Verify:

- Existing session list still creates, opens, and deletes conversations.
- New chat messages persist through `chat_conversation` and `chat_message`.
- The composer has no resume-file upload path.

## Phase 4: Citations and context panel

Add the copilot context UI after retrieval outputs are stable.

- Desktop uses a right-side collapsible panel.
- Mobile uses an in-thread drawer or sheet.
- Sections: citations, current retrieval scope, pending action proposals.
- Citation clicks open the source job description, resume record, or resume-pool item.

Verify:

- Answers that used system records render citations.
- Citation links open the correct workspace-scoped detail surface.
- Raw retrieval chunks and full prompts are not shown by default.

## Phase 5: Action proposals

Add write-adjacent behavior only after read tools and citations are stable.

First-version proposal types:

- Bind a candidate to a job description.
- Advance a recruitment stage through existing guards.
- Generate interview-question drafts.

Out of scope:

- Bulk deletion.
- Bulk rejection.
- Bulk email.
- Automatic invitations.
- Automatic scheduling.
- Automatic imports.

Verify:

- Proposal tools never write directly.
- Confirmation calls existing guarded APIs.
- Confirmed actions create the same kind of timeline or operation-log evidence as manual actions.

## Phase 6: Boundary evals

Add a small offline eval or scorer suite for product boundaries.

Minimum cases:

- The copilot cannot cite records from another workspace.
- The copilot returns an action proposal instead of writing directly.
- System-record answers include citations.
- The copilot does not ask the user to upload a resume PDF as the primary path.
- Comparing more than five candidates asks the user to narrow or ranks only the strongest five.

## Phase 7: Remove old upload-chat code

After the replacement is verified, remove old upload-analysis chat UI and API code that no longer serves another product surface.

Verify:

- No chat composer upload entry remains.
- Remaining upload APIs are still used by resume library or resume pool flows before deleting shared code.
- `pnpm check`, focused backend tests, focused frontend tests, and `git diff --check` pass.
