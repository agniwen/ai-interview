---
status: accepted
---

# Resume scoring policies as workspace-owned dimension weight configs

Resume review six-dimension scoring must stop using a single hard-coded weight vector for every job. Each workspace owns **resume scoring policies** that choose which of the six resume-review dimensions participate in the composite score, whether weights are equal-split or custom (sum 100%), and which job descriptions they apply to.

## Decision

- A **resume scoring policy** is a first-class workspace resource with a Studio configuration page (not embedded only on a job description form).
- Every workspace has **exactly one global default policy**: system-seeded on workspace create (and backfilled for existing workspaces), **editable, not deletable**, labeled as the default. New policies may only use **job-description scope** (one or more jobs). There is no second global policy.
- **Exclusive binding**: a job description may appear on at most one job-scoped policy. Resolution is always **job-scoped policy if bound, else the workspace global default**.
- Write access is limited to **owner/admin**. Other members see the effective policy name and snapshot summary on resume review, not the editor.
- On each resume review generation, persist a **resume scoring policy snapshot** (policy id/version/hash, enabled dimensions, weights, mode). Later policy edits do **not** silently rewrite historical composite scores. Optional “recompute composite only from stored dimension scores” is a later capability, not automatic.
- Dimension **raw scores are always produced for all six dimensions**. Composite score and default UI/ranking use only dimensions enabled on the snapshot. Raw scores remain available for later filters and diagnostics.
- Composite score is a **one-decimal-place** value in \[0, 100\], used for ranking/filtering among candidates who have cleared screening. It is **not** the semantic recommendation (vector) score.
- Legacy resume reviews stay readable without full rescoring; backfill an indexable composite column from existing scores where possible; mark pre-policy rows as historical.

## Phasing

- **Phase 1**: policy CRUD, binding rules, global seed, weighted composite from existing holistic dimension scores, snapshots, list sort/filter plumbing, UI.
- **Phase 2**: workspace-level **deduction rule set** (product-defined rule ids, workspace-editable amounts), structured LLM deductions, code-computed dimension scores, deduction detail UI. Deduction amounts are **not** per-policy (one ruler per workspace).

## Considered options (rejected)

- Weights only on the job description row: too many copies, weak “configure once, bind many” story.
- Multiple globals or overlapping job bindings with priority numbers: ambiguous at runtime.
- Always re-score all resumes when a policy changes: expensive and rewrites recruiter-read history.
- Per-policy deduction tables: operational explosion; standardization collapses inside one tenant.
