---
status: accepted
---

# Version qualitative resume evaluation without converting historical results

The qualitative resume-evaluation contract replaces configurable scoring for new evaluation attempts, but every existing result remains stored and readable under the contract version that produced it. Scores, gates, and adjustments are not mapped into the new four-level recommendation because the contracts are not semantically equivalent; a recruiter must explicitly request a reassessment before a candidate receives a qualitative result, and a failed reassessment retains the last valid result.

This contract applies only to job-bound candidate resume evaluation and its candidate-card, Overview, AI Evaluation, filtering, sorting, and recruiting-copilot consumers. Resume-pool similarity scores, human-interview scores, written-test scores, and other independent numeric measures remain numeric and are outside this decision.

Historical job weights, gates, priority conditions, and exclusion conditions remain stored for audit but are removed from normal job setup and ignored by qualitative evaluation. The rollout does not automatically reassess historical candidates because doing so would incur uncontrolled cost and silently change established recruiting evidence.

Job setup introduces no replacement AI-evaluation controls: the JD is the final recruiter-configurable evaluation input. Internal storage for immutable JD snapshots, evaluation-contract versions, and versioned results may change, but those persistence fields are not exposed as job settings.

A published job description remains directly editable. Each saved JD becomes a new immutable job-evaluation version: existing candidate evaluations keep the JD snapshot they used, while new evaluations and every recruiter-triggered reassessment always use the latest snapshot. Recruiters do not select an older JD version for reassessment.

Candidate lists replace numeric score controls with qualitative recommendation controls. Current qualitative results display and filter by recommendation level and sort as highly recommended, recommended, undecided, then not recommended, using evaluation time within each level. Historical scored results remain labeled as historical and are not converted or compared as if they shared the qualitative scale.

Candidate cards and the Overview tab show the recommendation level plus the concise overall evaluation; “view details” opens the AI Evaluation tab, which directly shows the detailed overall evaluation, six dimension narratives, and any supported seniority or team-positioning guidance. The recommendation occupies the former large-score position: not recommended uses a red X, undecided a yellow question mark, recommended a green thumbs-up, and highly recommended a purple sparkle. Text labels are always present so color is never the only signal.

The AI Evaluation tab shows the latest successful result by default and provides a read-only evaluation-history entry. Each history row identifies generation time, evaluation type, its version-specific score or recommendation level, and the JD version when the original source snapshot is provable; pre-version results remain visibly untraceable rather than being attached to whatever JD happens to exist at migration time. Opening a history row renders the complete historical result. Historical results cannot be restored as current or used to select an older JD for reassessment. A successful reassessment becomes current, while a failed reassessment leaves the previous current result visible and records the failure separately.

“Re-evaluate” starts immediately without a confirmation dialog, disables duplicate submission while running, and keeps the current result visible with an in-progress notice. Success atomically promotes the new result and moves the previous one into history; failure leaves the previous result current and offers retry. When no prior result exists, the tab shows evaluation progress rather than an empty result.

Evaluation is generated automatically when a newly parsed candidate is first bound to a job, when the candidate is rebound to another job, or when replacement/reparsed resume content changes the evaluation evidence. Changing a job's JD does not fan out reassessments to existing candidates; it affects new evaluations and explicit reassessments only. Contact details, notes, pipeline state, and other non-evidence changes never trigger evaluation.

A candidate without a bound job does not receive a qualitative evaluation or recommendation level. The AI Evaluation tab instead asks the recruiter to bind a job; that binding then triggers the first evaluation automatically.
