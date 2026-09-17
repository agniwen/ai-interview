---
status: accepted
---

# Support recorded human initial interviews

HR may conduct an initial interview with a candidate who prefers human conversation over an AI interview. One completed recording supplies the existing seven HR information fields in the recruiting record's shared Feishu evaluation document. Generation requires an explicit HR action and runs in the background. These product decisions were confirmed on 2026-09-07 and updated on 2026-09-08.

The recruiting desk presents this source as **Human Initial Interview** inside the existing AI interview tab, using a dedicated card rather than representing it as an AI interview attempt or a business follow-up interview. A successfully generated human initial interview may support an authenticated HR decision to advance to business interviews without completing an AI interview. Starting generation is limited to active screening or AI interview records without an evaluation document or an existing human initial interview. Importing a screening record advances it transactionally to AI interview and displays the dedicated human initial interview card; advancement to business interviews still requires a separate HR decision. Existing AI interview history remains; HR cancels unstarted arrangements explicitly.

The shared document identity from ADR-0037 is retained. When regenerating an existing snapshot in the recruiting desk, HR must confirm replacement if a document already exists. Replacement is limited to the seven HR initial-interview fields, including human edits within those fields; other evaluation sections remain untouched. This is an explicit exception to the earlier protection of reviewer-authored content in that region, not permission to regenerate the entire document or revise an immutable AI interview report.

The recruiting domain owns an independent copy of the recording and snapshots of the transcript, speaker identities, resume and job materials used for evaluation. Source Echo identifiers are provenance text only, without foreign keys or a continuing recruiting-context link. After copying succeeds, playback, regeneration and pipeline decisions use only recruiting-owned data; deleting or changing Echo recordings has no effect and is never blocked by this feature. This replaces the earlier proposed binding, source-change markers and post-progression unbinding restriction: those policies would couple the independent systems unnecessarily.

Members who can view the recruiting record can read its snapshot materials without a separate Echo share grant. This does not change access to the original Echo recording. Each regeneration retains its own result and transcript version and requires confirmation before replacing existing HR fields.

See the [requirement plan](../plans/2026-09-07-recorded-human-initial-interview.md) for the full flow, UI states and acceptance criteria.
