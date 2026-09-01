# Context Map

## Shared language

- [Product language](./CONTEXT.md) — canonical user-facing recruiting, resume, interview, and Meeting Buddy vocabulary shared across contexts

## Contexts

- [Identity Access](./apps/backend/src/domains/identity-access/CONTEXT.md) — owns workspace identity, membership, invitations, roles, and recruiting-group access
- [Recruiting Setup](./apps/backend/src/domains/recruiting-setup/CONTEXT.md) — owns reusable departments, interviewers, forms, question templates, and workspace recruiting defaults
- [Jobs](./apps/backend/src/domains/jobs/CONTEXT.md) — owns job descriptions, immutable job versions, interviewer assignments, and referral links
- [Candidate Lifecycle](./apps/backend/src/domains/candidate-lifecycle/CONTEXT.md) — owns candidate intake, resume records, candidate recruiting records, evaluations, interview rounds, offers, and recruiting notifications
- [Meetings](./apps/backend/src/domains/meetings/CONTEXT.md) — owns Meeting Buddy sessions, recordings, transcripts, intelligence, access, and recruiting context links
- [Recruiting Copilot](./apps/backend/src/domains/recruiting-copilot/CONTEXT.md) — owns Copilot conversations, messages, state, and action proposals
- [Platform Operations](./apps/backend/src/domains/platform-operations/CONTEXT.md) — coordinates privileged operational actions without owning another context's business data

## Relationships

- **Recruiting Setup → Jobs**: Jobs snapshots selected recruiting setup by stable identifiers and versions.
- **Jobs → Candidate Lifecycle**: Candidate recruiting records reference a Job Description and immutable job-evaluation version; Jobs never writes candidate state.
- **Identity Access → all authenticated contexts**: downstream contexts receive an actor/workspace scope and do not recreate membership rules.
- **Candidate Lifecycle → Meetings**: Meetings stores only a Recruiting Context Link and reads a narrow candidate summary; it does not own the Candidate Recruiting Record.
- **Recruiting Setup / Jobs / Candidate Lifecycle / Meetings → Recruiting Copilot**: Copilot reads narrow projections and submits confirmed commands to the owning context.
- **All owners → Platform Operations**: the platform adapter invokes owner-provided administration and diagnostics interfaces; it does not receive a general database interface.

Synchronous dependencies follow the arrows above. Cross-context writes enter through an owner command interface. External systems such as LiveKit, S3, Resend, Feishu, and AI providers are adapters inside the context that owns the use case.
