---
status: accepted
---

# Store structured resume evaluation separately from legacy review v4

Legacy `resumeReview` v4 requires six scored dimensions and carries the existing qualitative-review contract, while structured evaluation adds frozen job expectations, gate atoms, standardized deductions, adjustments, calculation snapshots, and indexed ordering fields. Structured V1 therefore uses a separate versioned JSON artifact plus server-derived gate/grade/composite summary columns; it does not widen or reinterpret legacy v4.

The summary columns and complete artifact are written atomically after schema validation and guarded by the current run, job, blueprint, and resume-input identities. Shared queue state is mode-aware: legacy readiness checks the v4 artifact, structured readiness checks the V1 artifact and summaries, and structured runs never mutate legacy screening fields. Effective gate status/rank may later change atomically through a run-specific recruiter correction while the raw AI judgment remains intact. Rebinding or changing scoring evidence clears the current artifact and summaries before a replacement run, so failed or stale runs cannot present an old score as current.

## Considered options

- Extend v4 with optional structured fields: rejected because it weakens both schemas and makes mode-specific invariants ambiguous.
- Query and sort directly from JSON: rejected because single-job score filtering and gate-first ordering are product behavior and require stable, indexable values.
