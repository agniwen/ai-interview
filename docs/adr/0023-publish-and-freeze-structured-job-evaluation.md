---
status: accepted
---

# Publish and freeze structured job evaluation

New structured jobs are drafts until explicitly published. Drafts are excluded from resume binding, automatic matching, referrals, recommendations, and evaluation. Before publication, the server stores a recruiter-confirmed blueprint preview containing source-backed stable atomic gates and normalized job-side scoring expectations; the compiler cannot invent unstated requirements, and any later evaluation-input edit clears that preview.

Publication locks the draft, verifies the stored preview and current input hashes, then atomically copies that exact preview into the immutable blueprint and pins the rule versions before activating recruiting use. After publication, job name, code, description, prompt, blueprint, hard gates, dimension weights, priority/exclusion conditions, and pinned versions are immutable. Department, interviewer assignments, communication questions, and candidate forms remain editable because they are operational settings outside resume-score comparability. A changed evaluation contract requires a new job rather than silently rewriting the meaning of scores inside an active candidate population.

The blueprint may contain at most one source-backed required-relevant-experience threshold with an explicit relevance scope. Preview generation rejects incompatible experience thresholds or scopes instead of silently selecting or combining them.

## Considered options

- Treat every save as publication: rejected because partially configured jobs could receive candidates.
- Allow published evaluation edits with stale markers: rejected for V1 because it creates multiple scoring contracts within one job.
- Atomize gates and extract job expectations for every resume: rejected because model/prompt drift could give candidates under one published job different evaluation baselines.
- Keep the confirmed preview only in the browser: rejected because the server could not prove that the published blueprint was the exact artifact the recruiter reviewed.
