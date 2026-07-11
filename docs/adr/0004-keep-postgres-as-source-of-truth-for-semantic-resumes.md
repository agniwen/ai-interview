---
status: accepted
---

# Keep Postgres as the source of truth for semantic resumes

Resume semantic search uses Qdrant for vectors and minimal payload only. PostgreSQL remains the business source of truth for resume records, resume-pool items, semantic index state, and duplicate-match snapshots, so authorization, lifecycle status, and business filtering do not depend on Qdrant payload correctness.

## Consequences

Qdrant or embedding failures must not corrupt business records. Read paths that return candidates or resumes should load full details from PostgreSQL after vector recall.
