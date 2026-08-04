---
status: accepted
---

# Allow an explicit legacy-job upgrade to structured evaluation

A published legacy job may optionally create one separately stored structured-evaluation upgrade draft. The live job continues to use legacy evaluation while that draft is created, edited, previewed, or discarded. Only an explicit publication command atomically changes the same job from `legacy` to `structured`, preserves its original ID, lifecycle state, and `publishedAt`, records upgrade audit metadata, invalidates incomplete legacy attempts, and removes the draft. The transition is irreversible.

The structured draft is initialized and compiled from the legacy job's public `prompt`. The legacy `description` and screening policy remain read-only reference material and are not converted into structured hard gates or scoring rules. Publication does not automatically reassess historical candidates. New attempts use the job's current mode, while every candidate persists both the mode of its current valid artifact and the mode of its current or latest attempt. A failed structured reassessment therefore leaves a valid legacy result visible; a successful one atomically replaces it with the structured artifact.

Legacy and structured scores remain different contracts. A list that contains both groups orders structured artifacts before legacy artifacts and candidates without an artifact, and applies each score only inside its own group. It never treats the two numeric scores as one comparable scale.

After upgrade publication, evaluation-owned fields are frozen under the same rules as any other published structured job. Department, interviewer assignment, cross-department interviewer permission, communication questions, candidate forms, and other explicitly operational fields remain editable. The server enforces these field allowlists; the browser does not define the boundary. The ordinary `jd.update` permission authorizes the upgrade workflow.

This decision supersedes ADR-0022 only where that ADR says a legacy job can never upgrade in place. ADR-0022's separation of legacy and structured artifacts, prohibition on automatic policy/score conversion, and prohibition on cross-mode score comparison remain in force. ADR-0023's structured-publication freeze remains in force after the upgrade transition.

## Considered options

- Edit the live legacy row as a structured draft: rejected because partially edited configuration could change active evaluation behavior before publication.
- Automatically convert the legacy description or screening policy: rejected because legacy informational and warning rules cannot safely become structured gates or scoring requirements.
- Automatically reassess all historical candidates: rejected because it is expensive, changes established candidate evidence without an explicit recruiter action, and would erase the distinction between existing and new scoring lineages.
- Clear the legacy result before a structured reassessment: rejected because a failed replacement would remove the recruiter's last valid AI reference result.
- Allow structured evaluation fields to change after upgrade: rejected because candidates evaluated at different times would silently use different contracts under the same published structured job.
- Support downgrade or product-level rollback: rejected because restoring the job mode cannot safely restore every candidate, queued attempt, and external recruiting side effect to one coherent lineage.
