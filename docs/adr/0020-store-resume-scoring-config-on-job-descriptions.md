---
status: accepted
---

# Store resume scoring configuration on job descriptions

Resume-review dimension weights belong directly to each job description and are edited as part of that job's structured configuration. New job descriptions use product defaults 35/25/15/10/8/7. Recruiters adjust non-negative integer percentages by dragging dimension boundaries; a dimension is disabled and shown muted when dragged to zero, and becomes active again when expanded above zero. There is no separate dimension checkbox, enabled field, equal/custom mode, or stored mode value, and all six stored weights must total 100%. A future equal-distribution action can rewrite the same six values without changing the data shape. This intentionally replaces the separate workspace-owned, reusable scoring-policy resource proposed in ADR-0016 because the current scope favors a single job-configuration flow over policy CRUD, global inheritance, and binding rules.

Each generated resume review must retain a snapshot of the job's scoring configuration so later JD edits do not silently rewrite historical scores.

When scoring consumes this configuration in a later delivery, matched priority and exclusion adjustments apply directly to the six-dimension weighted base score without dimension weighting, and the resulting composite score is clamped to 0–100.

## Phasing

The first delivery changes only job-description configuration. The structured gate, dimension-selection, weight, and priority/exclusion settings must be validated, persisted, and round-trip through create/edit reads, but neither the existing screening runtime nor resume scoring consumes the new configuration yet. Every priority/exclusion rule is a repeatable structured row that persists separate condition text and a non-zero integer point magnitude from 1 to 100; the rule group determines whether the adjustment is positive or negative, so the editor does not parse combined free-form lines. These dimension-independent values must not be forced to reference one of the six review dimensions. This delivery must not change screening outcomes, resume-scoring prompts, deduction execution, composite-score calculation, ranking behavior, or any existing resume result; the standardized deduction rules remain design input for a later scoring implementation.

The JD editor must disclose this phase boundary with low-emphasis copy stating that the structured configuration is saved but does not yet affect existing resume screening, scoring, or ranking.

The new structured-configuration tab is manual-only in this delivery. It does not expose the legacy screening-policy generation action and does not add AI extraction, generation, or prefill; the legacy backend endpoint remains untouched.
