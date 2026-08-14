---
status: accepted
---

# Isolate legacy and structured resume evaluation

Jobs created before structured resume evaluation permanently use the existing legacy screening and `resume-review-workflow`; newly published jobs use a separate structured Mastra workflow. A legacy job cannot be upgraded in place because mixing evaluation contracts inside one job would make its candidates and scores incomparable; recruiters must create a new job to adopt structured evaluation. Job copying is outside V1.

The rollout explicitly backfills all existing jobs as `legacy + published`; default structured-config JSON is not evidence of evaluation mode. The runtime resolves the stored immutable mode before workflow execution. Legacy policies and results are not converted, backfilled, or automatically reassessed. All-job views must not sort or aggregate legacy and structured scores as one scale, and score sorting is available only within one selected job.

## Considered options

- Convert legacy policies into structured gates: rejected because legacy informational and warning rules cannot safely become blocking requirements.
- Let a legacy job opt in later: rejected because candidates under the same job would have two scoring lineages.
- Branch both modes inside the existing workflow: rejected because it increases coupling and makes accidental cross-mode behavior more likely.
