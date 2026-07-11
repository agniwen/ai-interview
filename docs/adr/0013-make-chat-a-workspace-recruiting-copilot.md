---
status: accepted
---

# Make chat a workspace recruiting copilot

The chat surface is a workspace-scoped recruiting copilot, not a resume-upload-only assistant or a chat bound to one job description or resume record. By default it may retrieve from the entire workspace resume library and job descriptions, because recruiters should be able to ask cross-candidate and cross-role questions without first binding the conversation to one object.

## Consequences

Every retrieval path must remain scoped to the active workspace and user permissions. Answers that rely on workspace records should expose which job descriptions or resume records were used so the result is auditable instead of feeling like an unbounded global search.

Recruiting-copilot retrieval should combine structured database filtering with semantic recall. Structured filters own deterministic business constraints such as job binding, recruitment stage, education, source channel, owner, and timestamps; the semantic index owns fuzzy candidate and experience matching.

The copilot must not directly mutate recruiting records. Write operations should be presented as copilot action proposals and only executed after explicit user confirmation through the UI, using the same guarded business APIs as non-chat flows.

Confirmed copilot actions must leave the same kind of timeline or operation-log evidence as equivalent manual actions. A chat answer alone is not an audit record for a recruiting-stage change, job binding, interview setup, or other business mutation.

Copilot answers that rely on system records should render lightweight citations for the job descriptions, resume records, or resume-pool items used in that turn. Citations should let recruiters open the source records for verification, while raw retrieval chunks, full prompts, and low-level tool traces should remain hidden or folded unless needed for debugging.

The assistant-ui migration should reuse the existing `chat_conversation` and `chat_message` tables through a custom thread persistence adapter. assistant-ui is the interaction layer, not the owner of chat persistence; Assistant Cloud or a parallel thread/message schema would create a second source of truth for workspace chat history.

The workspace recruiting copilot should not provide resume-file upload as a chat capability. Resume content used by the copilot should come from records already admitted into the resume library or related system-owned recruiting records, so the chat surface does not remain a resume upload analyzer under a new UI.

The first version should only cover candidate retrieval, job matching, small candidate comparisons, and copilot action proposals. It should not include bulk email, automatic scheduling, automatic imports, cross-workspace search, or unconfirmed bulk stage changes.

Mastra should be layered with a recruiting-copilot agent for open-ended chat, read tools for resume and job-description lookup, proposal tools for confirmable business actions, and workflows only for deterministic long-running actions such as generating interview-question drafts. Normal chat turns should not be wrapped in workflows just to use Mastra.

Candidate retrieval tools should return candidate summary cards by default rather than full resume text. Full resume-profile or resume-text detail should be loaded only after the user asks for a deeper explanation, compares specific candidates, or chooses a cited candidate to inspect.

The first version should compare at most five candidates in one answer. If a user asks to compare more, the copilot should first retrieve or rank the candidate set, show the strongest five, and ask the recruiter to narrow the criteria before doing deeper comparison.

The first version should run as a single recruiting-copilot agent that orchestrates tools and deterministic workflows. Supervisor agents or subagents can be introduced later only when a concrete model-role conflict or workflow boundary justifies the extra latency and debugging complexity.

The new copilot should replace the existing `/chat` surface in place instead of launching as a parallel route. Legacy chat history may be cleared during the migration because current usage and data volume are low, so the replacement does not need a compatibility layer for old upload-analysis conversations.

The first version should not use Mastra Memory as business memory. Conversational context should come from the current chat history, workspace record retrieval, and confirmed action results; durable recruiting facts must live in explicit business records, timelines, or operation logs.

The first version should include a small offline eval or scorer suite for the copilot boundaries: workspace scoping, no direct mutations, required citations for system-record answers, no resume-file upload path, and the five-candidate comparison limit. These evals guard product boundaries rather than trying to grade every possible recruiting answer.

The UI should use assistant-ui primitives for the thread, composer, citations, and action-proposal rendering while preserving the current app shell. The existing sidebar remains the chat session list, the existing top-level Chat/Studio switch remains the primary mode switch, and the copilot-specific context should live in the main chat area or a collapsible side panel rather than replacing navigation.

Desktop copilot context should live in a right-side collapsible panel with sections for citations, current retrieval scope, and pending action proposals. Mobile should expose the same information through an in-thread drawer or sheet, not by moving it into the session sidebar.

The first version should support a temporary copilot retrieval scope derived from the user's current request, such as a job description, recent upload window, or candidate subset. It should not introduce saved scope presets, cross-session default filters, or a separate filter-management system.

Implementation should prove read tools, citations, and candidate-summary rendering before adding confirmed action proposals. Write-adjacent behavior should come after retrieval outputs are stable, because action proposals depend on reliable source records and citations.

The first version of copilot action proposals should be limited to binding a candidate to a job description, advancing a recruitment stage through existing guards, and generating interview-question drafts. Bulk deletion, bulk rejection, bulk email, automatic invitations, automatic scheduling, and automatic imports are out of scope.
