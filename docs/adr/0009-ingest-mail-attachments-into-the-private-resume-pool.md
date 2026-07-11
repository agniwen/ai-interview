---
status: accepted
---

# Ingest mail attachments into the private resume pool

Mail ingest imports resume attachments from configured user mailboxes into the user's private resume pool rather than directly into the resume library. The worker records mailbox processing state for idempotency, uploads attachments, creates resume upload batches, and lets the existing parsing queue process the resumes.

## Consequences

Mail ingest is an intake source, not an automatic acceptance path. Mailbox credentials and polling state belong to the workspace user who configured the account, and worker recovery must preserve idempotency across restarts.
