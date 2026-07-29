---
status: accepted
---

# Publish and freeze structured job evaluation

New structured jobs are drafts until explicitly published. Drafts are excluded from resume binding, automatic matching, referrals, recommendations, and evaluation; publication validates the configuration, pins the current deduction-rule-set version, and activates recruiting use.

After publication, job name, code, description, prompt, hard gates, dimension weights, priority/exclusion conditions, and the pinned rule-set version are immutable. Department, interviewer assignments, communication questions, and candidate forms remain editable because they are operational settings outside resume-score comparability. A changed evaluation contract requires a new job rather than silently rewriting the meaning of scores inside an active candidate population.

## Considered options

- Treat every save as publication: rejected because partially configured jobs could receive candidates.
- Allow published evaluation edits with stale markers: rejected for V1 because it creates multiple scoring contracts within one job.
