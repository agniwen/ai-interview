---
status: accepted
---

# Compute structured resume scores from versioned deductions

Structured resume evaluation uses AI only to atomize free-text gates, identify evidence, and report matched standardized deductions or job adjustments. Code calculates enabled dimension scores from a 100-point baseline, the weighted base score, adjustment totals, the clamped integer composite score, and the score grade; the narrative Agent runs only after these values exist.

The product-owned deduction catalog is versioned and pinned when a job is published. Recruiters configure only job weights and priority/exclusion adjustments; deduction amounts are not editable per job or workspace. A zero-weight dimension is not evaluated, missing evidence uses explicit dimension fallbacks, and every result stores job, rules, engine, model, evidence, deduction, adjustment, and calculation snapshots.

Composite grades are 推荐 for 85–100, 匹配 for 75–84, and 不匹配 for 0–74. Gate failures and needs-verification results take AI presentation/ranking precedence without erasing the score. Models are not permanently pinned to jobs, but any model change must pass a fixed calibration suite and historical results are never automatically recomputed.

## Considered options

- Let the model output six final scores: rejected because it cannot enforce uniform deduction arithmetic.
- Store one global mutable rule set: rejected because a rule change would make candidates within a published job incomparable.
- Configure deductions per workspace: rejected because the requested V1 uses one standardized ruler across recruiting teams.
