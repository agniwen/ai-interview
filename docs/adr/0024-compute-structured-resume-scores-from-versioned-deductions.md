---
status: accepted
---

# Compute structured resume scores from versioned deductions

Structured resume evaluation compiles free-text gates and job-side expectations once before publication. Per-resume AI identifies evidence and reports matched frozen gates, standardized deductions, or job adjustments. Code calculates all six dimension scores from a 100-point baseline, the weighted base score, adjustment totals, the clamped integer composite score, and the score grade; the narrative Agent runs only after these values exist.

The product-owned deduction catalog provides versioned rule identities and semantics and is pinned when a job is published. Recruiters may enable/disable those fixed rules and configure each ordinary rule's integer deduction amount per draft job; they cannot change rule identity, dimension, direct-zero semantics, threshold families, or evidence contracts. Every dimension is evaluated and retains its raw score; a zero weight contributes zero only when code calculates the composite. Missing evidence uses explicit dimension fallbacks, including a score of `min(max(100 - matched deductions, 0), 50)` for capped dimensions, and every result stores job, blueprint, rules, engine, model, evidence, deduction, adjustment, and calculation snapshots.

Composite grades are 推荐 for 85–100, 匹配 for 75–84, and 不匹配 for 0–74. Gate failures and needs-verification results take AI presentation/ranking precedence without erasing the score. Models are not permanently pinned to jobs, but any model change must pass a fixed calibration suite and historical results are never automatically recomputed.

Each deduction rule records matched, not matched, insufficient evidence, or not applicable. For experience, education, potential, and stability, any applicable unresolved rule caps the post-deduction dimension score at 50; direct-zero rules still win. Relative-time rules share one stored UTC as-of date, and code calculates duration and window thresholds from a source-cited normalized timeline rather than asking the model to perform arithmetic.

An experience threshold is frozen as required years plus one source-backed relevance scope. The semantic step classifies employment episodes against that scope, while code merges and counts only relevant months. Total profile work years may substitute for missing dated intervals only when the frozen scope is total employment; it cannot stand in for a narrower role, industry, domain, or capability requirement.

Every engine/model candidate must pass a versioned calibration corpus of at least 100 representative job-resume cases before rollout: schema, deterministic calculation, and citation integrity at 100%; overall gate agreement at least 95%; per-rule four-state macro-F1 at least 90%; composite-score mean absolute error at most 3, 95th-percentile absolute error at most 8, maximum absolute error at most 15; and grade agreement at least 90%. A threshold failure blocks rollout, and every approved engine version records the corpus version it passed.

## Considered options

- Let the model output six final scores: rejected because it cannot enforce uniform deduction arithmetic.
- Store one global mutable rule set: rejected because a rule change would make candidates within a published job incomparable.
- Allow arbitrary workspace/job semantic rules: rejected because V1 keeps one standardized rule identity and evidence contract while allowing job-specific enablement and integer magnitudes.
