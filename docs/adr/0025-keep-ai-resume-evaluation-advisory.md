---
status: accepted
---

# Keep AI resume evaluation advisory to the recruiter decision

Hard-gate judgments, composite score, match grade, and AI narrative are reference evidence; the recruiter-owned pass/fail status is the final resume evaluation decision. Before a recruiter acts, the AI gate/grade may lead the UI; after a recruiter acts, HR status becomes primary and conflicting AI output remains visible as secondary context without being rewritten.

No AI score or grade automatically advances the candidate pipeline. Clicking "AI面" remains a recruiter action and, under one locked database transaction, creates the round/schedule, records HR pass and prepared questions, advances the pipeline, binds templates, and then creates the interview-context snapshot from the new schedule ID and transaction-visible post-update data; an existing HR fail is overwritten only by that explicit command. When AI reports a failed gate or 不匹配, the UI asks for confirmation but does not require a reason. Recruiters may optionally correct atomic gate judgments, but unresolved AI items cannot block an explicit HR decision.

An atomic gate correction preserves the original AI judgment and changes only the effective gate aggregation used for presentation and ordering. It is tied to that evaluation run, does not recalculate the score or narrative, and is cleared with the run when resume evidence or job binding invalidates the evaluation. After correction, the UI labels the unchanged narrative as the original AI conclusion and shows the recruiter correction separately.

## Considered options

- Automatically advance 推荐/匹配 resumes: rejected because starting an AI interview also creates rounds, questions, and snapshots and must remain an explicit recruiter action.
- Make AI gates authoritative: rejected because free-text semantic judgments can be incomplete or wrong and the product treats AI as decision support.
