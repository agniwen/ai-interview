---
status: accepted
---

# Use shared subject threads for Studio detail agents

Studio detail and editor pages may host an agent in the side pane so recruiters can read the current record and have the agent help fill in its configuration through chat. Each such conversation is a Subject Thread: it belongs to one workspace record (a job description, interview question template, candidate form template or resume record) rather than to one member, and every member who can view that record sees the same thread. A record has at most one active thread; starting a new conversation archives the active thread for everyone, and archived threads stay listed on that record so they can be previewed, restored or deleted. There is no cross-page thread list, and Subject Threads do not appear in the personal `/chat` session list.

This narrowly supersedes ADR-0013's statement that the copilot is not a chat bound to one job description or resume record, and only for Studio detail pages. The workspace `/chat` copilot stays personal and workspace-scoped. All other ADR-0013 rules remain in force: no direct mutation of recruiting records, Copilot Action Proposals confirmed through the UI with operation-log evidence, citations for record-based answers, no resume-file upload path, no Mastra Memory as business memory, and `chat_conversation` / `chat_message` as the only chat history store.

## Consequences

Subject Threads reuse `chat_conversation` and `chat_message`. A conversation either belongs to one member (personal chat) or to one subject (a Subject Thread), never both. A Subject Thread survives the removal of any member, including its creator. User messages record their author so a shared thread can show who said what.

Because answers are persisted for every member who can view the record, while retrieval runs with the sender's visibility (ADR-0043), a Subject Thread only exposes tools whose results every viewer of that record may see: reading that record and its directly linked configuration, reading the option lists its editor already offers (such as departments, interviewers, members or bindable jobs), proposing form patches for it, and Copilot Action Proposals about it. Cross-candidate or library-wide retrieval stays in the personal `/chat` copilot. The tool allowlist is per subject kind and is covered by the copilot boundary evals.

Access follows the record, not the thread. Viewing a Subject Thread requires view permission on the record; sending messages, stopping a run, starting a new conversation and restoring an archived thread require edit permission; deleting an archived thread requires delete permission. Members also need chat access (ADR-0044). Confirming a Copilot Action Proposal is authorized against the confirming member and records who confirmed it.

The server owns Subject Thread history: a client submits only the new message, and the server builds model input from stored messages. Each thread runs at most one agent turn at a time; a concurrent send is rejected with the active sender identified instead of interleaving. Regeneration is limited to the latest reply of the requesting member's own turn, so one member cannot erase another member's messages.

The agent changes page configuration through form patches that fill the viewer's unsaved form, never by saving records itself. A patch may cover any field a member can edit on that form; reference fields are validated against those option lists before the patch is offered. A patch only takes effect when a member saves through the page's normal Save action (ADR-0031). Applying a patch is local to the member who applies it; the shared outcome is the saved record. Business mutations remain Copilot Action Proposals.

A new-record page has no record yet, so its conversation starts as a draft thread that only its creator can address, gated by the create permission for that record type. When the record is first saved, the draft becomes the record's Subject Thread and is shared from then on; a draft that is never saved stays private to its creator.

Deleting a record removes its Subject Threads. The first version uses polling rather than a push channel, and an agent turn does not continue after its sender leaves the page.
