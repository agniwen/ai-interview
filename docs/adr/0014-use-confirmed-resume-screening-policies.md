---
status: accepted
---

# Use confirmed resume screening policies

Resume screening rules should be configured as confirmed job-description policy, not extracted from the job description by a runtime hard-filter agent for each resume review. AI may suggest draft resume screening rules, but a recruiter must confirm them before they become active; this keeps screening standards stable across candidates and prevents model extraction drift from becoming an automatic candidate outcome.

## Consequences

Resume screening is distinct from resume review and from the final candidate outcome. A resume screening result may recommend pass, flag, or hold, but it must not automatically close a candidate as rejected.

Job descriptions own the current resume screening policy. Each resume screening result stores a screening snapshot with the policy version, rule results, and evidence used for that evaluation, so later job-description changes do not silently reinterpret historical results.

Only semantic changes to the active resume screening policy should change the policy version or policy hash. Editing draft rules, unrelated job-description fields, timestamps, or UI-only state must not make historical screening snapshots stale.

Resume reassessment after job-description screening changes should regenerate both resume screening and resume review together. The regenerated resume review may use the screening result as context for bias scan, next-step guidance, and conclusion wording, but the six-dimension score remains a match-quality score rather than a hidden hard-filter score.

The first version does not include bulk reassessment. Job-description policy changes may make existing screening snapshots stale, but reassessment is a single-resume action on eligible in-pipeline resume records.

When reassessment fails, the last successful screening result and resume review remain visible. The failed run records status and error details separately, and the UI should make clear that the visible result is the last successful one.

Resume review is system-generated and read-only. Recruiters who disagree with the generated review should record a separate HR resume assessment instead of editing the generated resume review.

Screening rules have three practical kinds. Field rules, such as education level or work years, are evaluated from structured resume profile fields. Skill rules are configured as required skills by the recruiter, while a narrow screening evidence agent evaluates semantically equivalent resume evidence. Semantic rules ask whether the resume provides evidence for qualitative job expectations.

The first field rules are minimum education and minimum work years. Minimum education may be shown as "不限" in the form, but an unrestricted education setting should not create an active rule. Missing resume information is always unknown in the first version, never an automatic failure.

Skill rules support all skills required or at least N skills required. Semantic rules are independent one-rule judgments and do not support match modes in the first version.

The screening evidence agent is not the resume review agent and is not the final decision maker. It only extracts evidence for skill and semantic rules; overall screening recommendation is aggregated by deterministic code from rule status and rule severity.

The screening evidence agent is called only when active skill or semantic rules exist. Field-only policies run without an AI evidence call, and an empty or disabled policy produces an empty screening result rather than an error.

New and existing job descriptions do not enable screening policy by default. AI-generated screening suggestions remain draft rules until explicitly confirmed by a recruiter.

Resume screening results are stored separately from the generated resume review. Resume lists may show a lightweight stale marker when a job-description policy has changed; resume detail views own the full stale explanation, reassessment action, and failure details.
