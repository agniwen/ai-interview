---
status: accepted
---

# Share one Feishu evaluation document per recruiting record

On 2026-09-07 the user explicitly requested a recruiting-record-owned evaluation document, including candidates who skip AI interviews. This supersedes ADR-0018's per-round Feishu document ownership and explicit-submit-only creation requirement, but not its round-scoped immutable system reports, evidence boundaries or authenticated human decisions. ADR-0033's section ownership remains intact.

`recruiting_evaluation_document` stores one canonical document and owning Feishu application per recruiting record, scoped to its workspace. Notifications retain historical links and external message identities but no longer own document lookup. The automatic AI report sender and formal human-evaluation submission processor both ensure this same document exists. A meeting ending or an AI-generated human-evaluation draft does not count as formal submission.

Human-only creation uses the candidate's available resume, qualitative resume evaluation and recommended questions, without fabricating AI interview evidence. It requires a linked Feishu account for the recruiting owner, record creator or evaluation submitter. Missing account/configuration is an actionable retryable synchronization failure, not an indefinite wait for a nonexistent AI interview. Later formal rounds update their designated sections of the same document. Existing documents are not regenerated wholesale.

Creation uses a dedicated PostgreSQL session advisory lock per workspace/record. No database transaction stays open during Feishu I/O; a dedicated connection avoids starving the application pool while callers wait. Creation intent and immutable initialization input are persisted before external creation. The document ID is checkpointed before content writes. Known document IDs resume initialization using stable existing block-operation tokens. A lost creation response or missing checkpoint does not automatically create another document. Temporary initialization content (including attachment bytes) is cleared after success. Application-specific Open IDs are never used with a different Feishu app.

Historical migration preserves all deliveries, statuses, timestamps, message IDs and document links. It chooses a document already used by formal human feedback before choosing the latest notification document. Older documents remain in historical deliveries. Multiple already-used human documents for one record require explicit content reconciliation; migration must stop rather than discard feedback. Migration changes only the live delivery type `summary_ready` to `ai_report_ready`, preserves an audit backup, and never requeues sent notifications. Archive tables are unchanged. Runtime compatibility reads accept both types during rollout; new direct and Worker paths write only `ai_report_ready`.

Rollout and recovery are documented in [the migration runbook](../plans/2026-09-07-evaluation-document-migration.md).
