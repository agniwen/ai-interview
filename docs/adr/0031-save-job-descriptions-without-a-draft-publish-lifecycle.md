---
status: accepted
---

# Save job descriptions without a draft-and-publish lifecycle

Job creation uses one Save action. A successful first save makes the job immediately available to recruiting workflows and creates its first immutable JD snapshot; each later save creates a new current JD snapshot. The product no longer creates recruiter-visible job drafts or requires a separate publish action.

The structured-scoring steps “generate scoring rules,” evaluation-blueprint preview, and publish confirmation are removed because qualitative evaluation has no recruiter-configurable scoring blueprint. Saving a job does not run candidate evaluation; a candidate is evaluated when the recruiting workflow requests it, and an explicit reassessment uses the latest saved JD snapshot.

A non-empty job description is required to save. Sparse or low-detail content may receive a non-blocking notice that evaluation will rely more heavily on the general professional evidence standard, but the product does not introduce an AI quality gate, structural template requirement, or minimum-detail publish check.

The existing Communication Questions and Candidate Forms tabs remain because they configure interview operations rather than AI evaluation. The removed surface is limited to the scoring-rule preview and the hard-gate, dimension-weight, deduction, priority, and exclusion controls beneath the JD.

Existing published jobs remain available. Existing legacy drafts are not activated automatically: they remain visible in job management as migration-pending, cannot receive new candidate bindings, and become immediately available with their first explicit Save under the new form, which creates the first JD snapshot. New jobs never enter a draft state.

The existing `prompt` field—already labeled “岗位 JD” in the current structured-job form—is the sole canonical JD source. The legacy `description` field is retained only as historical data: it is not shown in the new form, copied into `prompt`, used as fallback, included in JD snapshots, or consumed by qualitative evaluation.
