---
status: accepted
---

# Run Echo processing durably on the recording device

Confirmed with the user on 2026-09-09 after reviewing the trade-offs. Echo owns recoverable processing and synchronization on the user's device instead of depending on `apps/worker`. Electron and its local SQLite database already retain recording state; extending that ownership through processing avoids handing unfinished work to a separate runtime and makes quitting and reopening a normal recovery path. Accepted means the decision is approved, not that migration is complete.

## Scope and execution ownership

- Only Echo leaves Worker. Recruiting resume processing, interview evaluation, notifications, and other recruiting jobs keep their existing Worker execution. ADR-0035 continues to govern those Worker paths; its processing location and retry rules do not govern Echo's new local scheduler.
- Electron Main owns a durable task scheduler independent of Renderer windows. Media work runs in a separate process so recording and UI remain responsive. SQLite stores tasks, checkpoints, artifacts and pending synchronization; audio files remain on disk.
- Closing the window keeps Echo in the tray and permits processing to continue. Fully quitting, sleeping, or losing network pauses affected work; reopening or reconnecting resumes it. No separate always-running service and no promise of completion while Echo is fully stopped.
- Tasks bind to the account, workspace, meeting, and input revision when created. Changing the active account or workspace cannot redirect an existing task. Authorization is rechecked when contacting Server.
- The original device performs automatic continuation. Other devices view synchronized results and show that unfinished work is waiting for its processing device. Automatic cross-device takeover is outside this release.

## Processing and synchronization

Saving freezes and durably records the local recording and save intent. Backup and processing proceed independently: audio and live drafts may upload immediately while local tasks produce mixed playback, the Final Meeting Transcript, and Meeting Intelligence. Each completed artifact is durably saved locally before its task completes, then synchronized independently. Processing completion and synchronization completion are separate facts; cloud visibility is neither of them.

- Keep the current transcription strategy: promote usable Deepgram live drafts to a final transcript; preserve Qwen post-recording transcription, scheduled in resumable segments from Echo. Do not trade transcription quality for an execution-location migration.
- Server remains responsible for authentication, workspace permissions, model credentials and request-based model/provider gateways. Echo owns durable scheduling and continuation; these endpoints do not enqueue Echo work or require a Server process to keep an in-memory job alive after a request ends. Provider task identifiers and segment results must survive local restart where asynchronous provider operations require polling.
- Echo initiates Meeting Intelligence regeneration and Meeting Answer generation. The web surface retains viewing, playback, editing, export and sharing of existing results, but does not initiate Echo regeneration or AI questions in this release. Existing meeting access permissions still apply within Echo.
- Generated revisions and user-authored corrections remain distinct. A delayed generation or synchronization response cannot overwrite newer edits or publish against the wrong input revision.
- Synchronization is idempotent and revision-aware. Server validates access, manifests and artifact integrity before acknowledging persistence. Stable operation identifiers permit completed responses to be reused when available. Provider operations without idempotency support may still incur duplicate charges after an ambiguous failure; do not promise exactly-once billing.

## Retention and permanent deletion

Data that is not yet processed or not yet durably synchronized is never automatically cleaned up. This includes source audio, partial and final transcripts, summaries, task progress and pending results. An upload acknowledgement must not discard the local session or the inputs needed to finish it. This explicitly replaces the former Local Recording Recovery Copy handoff rule.

After all required processing completes and Server verifies the corresponding cloud data, users may explicitly release synchronized local audio. There is no seven-day automatic local cleanup in this release. Local text results remain available; released audio can be fetched from cloud storage for playback. Explicit authorized discard/permanent deletion is separate from storage housekeeping.

For permanent deletion, Server validates access, records a deletion tombstone and exposes resumable, bounded cleanup operations. Echo durably records the deletion request and continues it across restarts until Server confirms completion; only then may the UI claim permanent deletion has completed. Offline devices check deletion state before synchronizing, so stale local data cannot resurrect deleted meetings. Echo does not depend on Worker to complete these requests. When no Echo client is running, unfinished cleanup may wait for continuation; this decision does not promise unattended cleanup while every client is stopped. Existing recruiting-owned copies remain independent as specified by ADR-0038.

## Failure and recovery

- Offline, sleep and application exit pause tasks without consuming retries.
- Transient service failures permit at most five automatic retries after the initial attempt, with backoff; exhaustion requires a user retry. Authentication, permission and quota failures pause immediately with an actionable message. Invalid input is retained for diagnosis or explicit user action rather than retried indefinitely.
- Persist each segment/checkpoint and atomically publish outputs before marking a task successful. At startup, recover expired in-progress attempts and reconcile durable output before repeating work. Cancellation or stale execution must not publish results after a newer attempt or deletion.
- Raw recordings and successful partial results survive failures. Recovery is not conditional on the previous Renderer window, a timer, or an in-memory Promise still existing.

## Historical migration

Preserve all completed historical results. For incomplete Echo processing, stop Worker continuation and present “在此设备继续处理” in Echo. On explicit user acceptance, bind the historical task to that device, download and verify the required source data, and enter the local durable workflow. Tasks without a device accepting responsibility remain waiting; they are neither deleted nor automatically recomputed.

Fence existing queued and running Echo attempts so late Worker results cannot supersede the new ownership revision. Classify ownership explicitly and preserve non-Echo work in shared queues. The switch must not clear entire queues or erase historical output. Server and clients must share the ownership protocol before Echo is removed from Worker recovery scans.

## Alternatives and consequences

- Continuing cloud Worker processing was rejected for Echo because local durable recovery is the intended owner. This deliberately gives up automatic completion when the processing device stays closed.
- Fully offline models or distributing platform model keys to clients were rejected for this migration. Server model gateways remain supported dependencies.
- Uploading only after all processing completes was rejected: early backup reduces device-loss exposure while unfinished local inputs are still retained.
- Automatic device takeover and automatic local audio cleanup were deferred to keep ownership and retention explicit.
- Local storage use and desktop packaging requirements increase. The scheduler must bound concurrency and prioritize active recording over background work.

## Acceptance and delivery

Implement the local retention/task foundation, then local media/transcription/intelligence/answer execution and synchronization, then historical handoff and Echo queue fencing. This is one migration outcome, not permission to leave an indefinite Worker fallback for Echo.

With Worker stopped, verify capture, upload, mixed playback, final transcription, intelligence, answers and permanent deletion. Interrupt each stage with process termination, network loss or ambiguous upload acknowledgement; reopen and verify durable recovery without data loss or stale publication. Also cover account switching, user edits during generation, exhausted retries, explicit local audio release, historical adoption and deletion followed by stale-device synchronization. Non-Echo recruiting queue behavior must remain covered independently.

Deployment must stop old Worker consumers before the ownership migration, then start the matching Server and Worker release. Shared recruiting queues remain intact and resume under the new Worker. Deploying the migration while an old Worker is still recovering Echo jobs is unsupported. Distribute the matching Echo build; older clients receive an upgrade-required response for new cloud saves and keep their local recording.
