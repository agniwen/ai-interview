---
status: accepted
---

# Index resumes with three semantic chunks

Each parsed resume is indexed as `resume_overview`, `work_project`, and `skill_role` chunks. This shape separates broad duplicate recall, rewritten-experience detection, and job recommendation signals without creating separate collections or source-specific vector models.

## Consequences

New semantic features should first decide which existing chunk type carries the signal. Adding a fourth chunk or a second collection requires a new decision because it changes indexing, backfill, scoring, and cleanup.
