# Structured Resume Evaluation V1

## Goal

Use the structured configuration of a newly published job to produce an evidence-backed resume evaluation with hard-gate findings, standardized six-dimension deductions, a deterministic integer composite score, and an AI narrative that explains the already-computed result. The evaluation is advisory; the recruiter owns the final pass/fail decision and manually starts an AI interview.

## Scope

This delivery includes:

- draft and published states for new job descriptions;
- immutable resume-evaluation settings after publication;
- a publish-time, recruiter-confirmed evaluation blueprint;
- permanent separation between legacy and structured job evaluation;
- a dedicated structured Mastra workflow;
- atomic hard-gate judgments and evidence;
- versioned, product-owned six-dimension deduction rules;
- code-computed dimension, weighted-base, adjustment, and final scores;
- AI match grades and post-score narrative;
- evaluation snapshots and engine/model metadata;
- a structured-result schema and queryable score/gate summary fields separate from legacy v4 results;
- recruiter-facing detail, single-job sorting, and filtering;
- recording recruiter pass when an AI interview is launched.

This delivery excludes:

- upgrading a legacy job in place;
- converting legacy screening policies or scores;
- automatically reassessing historical candidates;
- automatic candidate-stage progression;
- comparing or sorting scores across jobs or evaluation modes;
- workspace or job editors for the standardized deduction catalog;
- cross-job evaluation history when a resume is rebound;
- aggregate scoring reports.

## Job lifecycle and compatibility

### Evaluation modes

Every job has one immutable evaluation mode:

- `legacy`: every job that existed before structured evaluation. It permanently uses the existing screening and resume-review flow.
- `structured`: every new job published through the structured configuration flow. It permanently uses the new structured workflow.

A legacy job cannot enable structured evaluation. To use the new rules for the same role, the recruiter creates a new job, producing a separate candidate population and score lineage. Job copying is not part of V1.

### Migration identity

Evaluation mode and lifecycle state are stored explicitly; the presence of `structuredConfig` never determines either value.

The rollout migration applies these values:

- every job row that exists before the migration becomes `evaluationMode = legacy` and `lifecycleStatus = published`;
- its synthetic `publishedAt` is set to its existing `createdAt` for compatibility and is not presented as a historically verified publication event;
- every job created after the migration is server-assigned `evaluationMode = structured` and begins with `lifecycleStatus = draft`;
- clients cannot submit or change evaluation mode;
- legacy jobs retain `resumeScreeningPolicy`; structured jobs neither require nor execute that legacy policy.

The job record adds explicit lifecycle fields plus two distinct sets of structured publication data:

- draft preview fields: server-generated blueprint preview, preview-input hash, preview-blueprint hash, and preview-generated time;
- published fields: immutable evaluation blueprint, blueprint hash, pinned deduction-rule-set version, and publication time.

The published blueprint is absent for drafts and legacy jobs. Draft preview fields are absent for legacy and published jobs.

The synthetic `published` state does not retroactively apply structured-field freezing to legacy jobs. Legacy editing and versioning behavior remains unchanged; structured publication rules are enforced only when `evaluationMode = structured`.

Job-management responses always expose evaluation mode and lifecycle state. The legacy UI continues to show the legacy settings and never offers structured publication or the structured editor; any backfilled default `structuredConfig` on a legacy row is ignored.

### Draft and publication

A structured job begins as a draft. Creating it stores the draft only; it does not enqueue the job for semantic matching. Drafts are visible only in job management and explicit pre-publication setup surfaces, never in candidate-facing or recruiting-use selectors. Drafts cannot:

- receive or bind resumes;
- participate in automatic JD matching or talent recommendation;
- produce referral/application links;
- run resume evaluation.

The draft publication flow calls a server-owned preview operation. It compiles and validates a blueprint, then atomically stores the complete preview plus hashes on the draft before returning it to the recruiter. Clients cannot submit or replace preview content.

The recruiter confirms that stored preview. Any subsequent change to the job description, prompt, gates, weights, or adjustments atomically clears all preview fields and requires regeneration. Operational-only draft changes do not invalidate it.

Publishing is one atomic transition from `draft` to `published`. It:

1. locks the draft row and loads the server-stored preview;
2. recomputes the current draft-input hash and verifies both the submitted preview-blueprint hash and stored preview-input hash;
3. validates all structured configuration, including integer weights totaling 100;
4. pins the current deduction-rule-set and blueprint-schema versions;
5. copies the exact stored preview into the published blueprint fields and clears the preview fields;
6. writes `publishedAt` and makes the job eligible for recruiting workflows.

If preview generation, validation, or persistence fails, the job remains a draft. A failed preview does not replace the last valid preview, while a failed publication retains the confirmed preview for retry and writes no partial published fields. Missing/stale preview returns `409 JOB_BLUEPRINT_PREVIEW_STALE`; repeated or concurrent publication of a non-draft returns `409 JOB_ALREADY_PUBLISHED`. Semantic indexing is enqueued only after the publishing transaction commits.

### Published evaluation blueprint

The evaluation blueprint is compiled once from the draft's frozen description, prompt, hard-gate configuration, weights, and adjustments. It contains:

- stable IDs and source mappings for every atomized hard-gate requirement;
- de-duplicated core and auxiliary skill expectations;
- zero or one normalized `requiredRelevantExperience` requirement where an explicit experience threshold is configured;
- normalized education thresholds where explicitly configured;
- stable job-side expectations needed by the six dimensions, such as industry/domain, responsibility level, project scale, business complexity, and ownership expectations;
- the original priority and exclusion conditions;
- blueprint schema, compiler prompt, and compiler model metadata.

`requiredRelevantExperience` contains `years`, `relevanceScope`, `sourceText`, and `sourceRef`. `relevanceScope` states which role, industry, domain, or capability experience counts toward the threshold; it is `total_employment` only when the source explicitly requires total work experience without a narrower scope. The compiler may de-duplicate equivalent statements, but V1 publishes at most one experience threshold. If explicit source statements contain incompatible thresholds or scopes, preview generation fails with `422 JOB_BLUEPRINT_EXPERIENCE_CONFLICT` and asks the recruiter to simplify the JD instead of choosing or combining them.

Every compiled expectation retains its source text and location. The compiler may normalize and de-duplicate what the job says, but cannot invent an unstated requirement. Soft wording such as "优先", "加分", "最好", or equivalent is excluded from blocking gates and may become an auxiliary skill. It affects score adjustments only when the recruiter separately configured the same meaning as an explicit priority or exclusion condition; the compiler never creates adjustment conditions. The confirmed blueprint and its hash are immutable after publication. Later model or prompt changes cannot recompile it; correcting the published evaluation contract requires a new job.

V1 publication allows at most 20 atomic requirements in one hard-gate category and 60 in the full blueprint. Preview generation that exceeds either limit fails with a validation error and asks the recruiter to simplify the source text; it never silently drops requirements.

After publication, the following fields are immutable:

- job name and code;
- job description and prompt;
- all seven hard-gate fields;
- all six weights;
- priority and exclusion conditions;
- the pinned deduction-rule-set version.

Department, interviewer assignment, cross-department interviewer permission, communication questions, and candidate forms remain operationally editable.

Draft updates may edit the full job configuration. Published-job updates accept only the operational fields listed above. Any request that attempts to change a frozen field returns `409 JOB_EVALUATION_FROZEN`; the server does not silently ignore or partially apply it.

The API/shared layer uses separate request schemas instead of reusing one base schema:

- structured create input: job basics, structured configuration, and operational assignments; no legacy screening policy;
- structured draft update input: all draft-editable fields;
- structured publish input: the confirmed preview-blueprint hash only;
- published operational update input: only the operationally editable fields;
- legacy update input: the existing legacy contract.

Mode and lifecycle state are always server-owned response fields.

### Job availability boundary

Job access is capability-specific rather than a generic "ID exists" check:

- management/configuration access may load draft or published jobs and is used by job management plus pre-publication interviewer, question-template, and candidate-form setup;
- recruiting access requires `lifecycleStatus = published` and is used by resume binding, direct and batch upload, resume-pool matching/binding, automatic matching, recommendations, referral-link creation/resolution, candidate/application creation, and resume evaluation.

The backend exposes separate management and recruiting loaders/validators. Recruiting endpoints never call a raw existence-only helper. Job-selection queries outside setup/management list published jobs only. Semantic indexing is created only for published jobs, and a referral resolver rechecks publication rather than relying only on a previously issued token.

## Workflow boundary

The legacy `resume-review-workflow` remains unchanged. The resume-evaluation lifecycle loads the bound job, requires it to be published, and resolves its immutable evaluation mode before entering Mastra:

```text
resume evaluation lifecycle
  ├─ legacy job     → existing legacy screening + resume-review-workflow
  └─ structured job → structured-resume-review-workflow
```

The lifecycle uses a mode-aware current-result contract:

| Mode         | Current artifact                | Legacy screening fields                    | Already-current check                              |
| ------------ | ------------------------------- | ------------------------------------------ | -------------------------------------------------- |
| `legacy`     | existing `resumeReview` v4      | existing result/status/error remain active | valid legacy artifact exists                       |
| `structured` | `structuredResumeEvaluation` V1 | never read or written                      | valid structured artifact and summary fields exist |

The common generation status/run/error/generated-at fields may be reused, but artifact existence, invalidation, readiness, and enqueue deduplication always branch by evaluation mode. A structured run cannot mark legacy screening as processing/ready/failed, and a null legacy `resumeReview` does not imply that a ready structured result is missing.

For a structured job, the lifecycle loads and validates the immutable published snapshot and passes it into Mastra together with the resume input. The workflow performs no job/configuration database lookup. Its input contains the job ID, blueprint and hash, frozen weights and adjustments, pinned deduction catalog, resume profile/text, one UTC `evaluationAsOf` calendar date captured at run start, and the run/input identity used to reject stale writes.

The structured workflow uses this order:

1. Validate the supplied immutable job snapshot, blueprint hash, and structured workflow input.
2. Judge each frozen atomic hard gate from resume evidence.
3. Judge standardized deduction-rule hits for all six dimensions against the frozen job expectations.
4. Match each frozen priority and exclusion condition as yes or no.
5. Compute all dimension scores, the weighted base score, adjustments, integer composite score, and score grade in code.
6. Generate the AI narrative and recommendation explanation from the completed calculation and evidence.
7. Return one complete, schema-valid evaluation result to the lifecycle for atomic persistence.

The AI never performs score arithmetic and never chooses a score that code later trusts.

## Hard gates

### Configuration

The seven free-text categories are:

- education;
- work experience;
- required skills;
- work location;
- language ability;
- required certificates;
- other hard requirements.

Each non-empty category is atomized when the draft evaluation blueprint is generated. The recruiter confirms those stable atoms before publication; individual resume evaluations never re-atomize the source text.

### Atomic judgment

Each published atomic requirement stores:

- stable requirement ID;
- source category and source text;
- normalized requirement;

Each resume judgment for that requirement stores:

- AI status: `passed`, `failed`, or `needs_verification`;
- cited resume evidence;
- concise reason.

Aggregation is deterministic:

- any failed atom makes its category failed;
- otherwise any needs-verification atom makes its category needs verification;
- otherwise the category passes;
- any failed category makes the overall AI gate result failed;
- otherwise any needs-verification category makes the overall result needs verification;
- otherwise the overall result passes.

Missing resume information is `needs_verification`, not an automatic failure. The AI gate result is advisory. Recruiters may optionally correct atomic results, but do not have to resolve every atom before marking the resume passed or launching an AI interview.

A correction stores the original AI status unchanged plus corrected status, recruiter, and timestamp. Category and overall effective gate status aggregate from the corrected status when present and otherwise from the AI status. Effective gate status drives current gate presentation and gate-first sorting; correction does not change dimension scores, composite score, or the original AI narrative. A correction belongs to one evaluation run and is cleared when that evaluation is invalidated or regenerated.

## Standardized dimension scoring

### Ownership and versions

The deduction catalog is product-owned, fixed-identity, and versioned. It is not configurable per workspace or job. A structured job pins the current catalog version when published, and all evaluations for that job use that version. A later catalog version applies only to newly published jobs.

Each of the six dimensions starts at 100, accumulates matched deductions, and is floored at 0. A direct-zero rule overrides ordinary deductions. Rules in the same threshold family use only the most severe matched tier; independent facts continue to accumulate.

A deduction that compares the resume with a job-side threshold or expectation is applicable only when the confirmed blueprint contains that source-backed benchmark. An absent benchmark is "not applicable", not insufficient candidate evidence, and causes no deduction.

### Rule judgments and evidence sufficiency

Every standardized rule is returned with one status:

- `matched`: sufficient resume evidence proves the deduction condition;
- `not_matched`: sufficient evidence proves the condition does not apply;
- `insufficient_evidence`: the rule is applicable, but candidate-side evidence is insufficient to decide;
- `not_applicable`: the frozen job blueprint does not contain a benchmark required by that rule.

Every result stores rule ID, status, cited evidence, and concise reason. Only `matched` subtracts points. `not_applicable` never marks the dimension as evidence-insufficient.

For experience, education, potential, and stability, ordinary matched deductions are calculated first. If any applicable rule is `insufficient_evidence`, the dimension retains its deduction details and receives:

```text
dimension score = min(max(100 - matched deduction total, 0), 50)
```

The result carries an insufficient-evidence marker naming the unresolved rules. Direct-zero rules still override this cap. This makes partial evidence deterministic and prevents an omitted material fact from increasing the score.

Skill expectations use one mutually exclusive candidate status per de-duplicated skill: `applied`, `shallow`, or `missing`. If one source classifies the same skill as core and another as auxiliary, core takes precedence. `shallow` and `missing` cannot both deduct for the same skill. The direct-zero skill rule applies only when no job-related skill has either applied or shallow evidence; when it applies, ordinary skill deductions remain visible for explanation but do not change score 0.

### Evaluation clock and normalized timeline

All relative-time rules use the stored UTC `evaluationAsOf` calendar date from the run input. Retries of the same run reuse that date. Replaying a stored result uses its original date; an explicit later reassessment creates a new run/date and may legitimately change time-window deductions.

The semantic step produces a source-cited normalized candidate timeline with month-level start/end values and an explicit current-role marker. When the blueprint contains `requiredRelevantExperience`, every resolved employment episode receives a relevance status of `relevant`, `not_relevant`, or `insufficient_evidence`, with cited resume evidence and a concise reason. For `total_employment`, code assigns every resolved employment episode `relevant`; for a narrower frozen scope, the model performs the semantic classification. The model does not calculate durations.

Code performs all duration, overlap, gap, recency, and job-change arithmetic from that timeline:

- merge overlapping employment months before calculating total employment duration;
- for the missing-years rule, merge and count only months from `relevant` episodes, then divide the non-overlapping month total by 12;
- when known relevant months already meet the requirement, unresolved episodes cannot create a missing-years deduction;
- when known relevant months are below the requirement and an `insufficient_evidence` episode could change the outcome, mark the missing-years rule `insufficient_evidence`;
- use `resumeProfile.workYears` as a fallback only when dated intervals cannot be normalized, the profile value is present, and `relevanceScope = total_employment`;
- never substitute total `resumeProfile.workYears` for a narrower role, industry, domain, or capability scope;
- otherwise mark the missing-years rule `insufficient_evidence`;
- an unparseable period cannot be guessed and is retained as unresolved evidence.

The versioned deduction catalog owns the exact timeline definitions used by jump, short-tenure, and gap threshold families. The normalized timeline and the source chosen for relevant work years are stored in the evaluation artifact.

V1 temporal definitions are:

- a one-, two-, or three-year lookback is the inclusive calendar interval ending on `evaluationAsOf`;
- a job change is a transition from one ended primary employment episode to a later primary employment episode; the first known job is not a change;
- the start of a new role counts in the window, including the current role when a prior role exists;
- overlapping concurrent roles do not create extra changes or gaps; if primary-versus-concurrent status cannot be resolved, affected rules are `insufficient_evidence`;
- short tenure is fewer than three complete calendar months in one resolved employment episode;
- an employment gap is the complete-month interval between resolved primary episodes, or between the last ended episode and `evaluationAsOf` when there is no current role;
- a gap is unexplained only when the supplied resume evidence contains no reason for that interval;
- a project is older than three years when its resolved end month precedes the inclusive three-year lookback boundary; a current project is never old under this rule.

### V1 deduction catalog

#### Skill match

| Rule                                                                        |      Deduction |
| --------------------------------------------------------------------------- | -------------: |
| Missing one core required skill                                             |   14 per skill |
| Missing one auxiliary skill                                                 |    4 per skill |
| Skill is mentioned only at shallow-awareness level with no applied evidence |    9 per skill |
| No evidence of any job-related skill                                        | Direct score 0 |

Core skills include every skill in the structured required-skills gate plus skills expressed in the published job description with strong wording such as "必须", "必备", "精通", or "熟练掌握". Auxiliary skills come only from the published job description and require explicit soft wording such as "优先", "加分", "了解", or "熟悉". The job prompt never contributes a core or auxiliary skill expectation. These de-duplicated expectations are compiled into the published evaluation blueprint and reused unchanged for every resume bound to that job.

#### Experience relevance

| Rule                                                              |          Deduction |
| ----------------------------------------------------------------- | -----------------: |
| Industry is completely unrelated                                  |                 28 |
| Relevant experience is below the job requirement                  | 9 per missing year |
| Relevant experience is fragmented, with repeated switches or gaps |                 13 |

Missing-year count is `ceil(required years - relevant years)`. For example, 3 required versus 2.5 relevant deducts 9; 3 required versus 1.5 relevant deducts 18. If the published blueprint has no `requiredRelevantExperience`, this rule is `not_applicable`. If the requirement exists but relevant years cannot be established under its frozen scope, the rule is `insufficient_evidence` and the dimension-cap rule applies.

#### Project match

| Rule                                                               |      Deduction |
| ------------------------------------------------------------------ | -------------: |
| Project scale or business complexity is below the role requirement |             18 |
| Candidate participated only at the edge and was not a core owner   |             23 |
| Most recent relevant project ended more than three years ago       |             12 |
| No evidence of a relevant business project                         | Direct score 0 |

#### Education and background

| Rule                                                             |          Deduction |
| ---------------------------------------------------------------- | -----------------: |
| Education level meets the requirement but the major is unrelated |                 14 |
| Education level is below the configured gate                     | 38 per degree tier |

The education-tier rule uses the normalized sequence associate degree → bachelor → master → doctorate. The deduction accumulates by distance and is floored at 0: master versus bachelor deducts 38, while master versus associate degree deducts 76. If the published blueprint has no explicit education-level threshold, the below-gate rule is not applicable. School-tier conditions such as 985 or 211 remain hard-gate semantics unless a future rule version explicitly adds a scoring deduction.

#### Potential

| Rule                                                                               | Deduction |
| ---------------------------------------------------------------------------------- | --------: |
| No new skill, certificate, or advanced-project growth record in the last two years |        19 |
| Repeated illogical industry switches make career direction unclear                 |        24 |
| Unexplained work gap longer than six months                                        |        14 |

#### Stability

| Rule                                                      |   Deduction |
| --------------------------------------------------------- | ----------: |
| Two job changes within two years                          |          13 |
| Two job changes within one year                           |          30 |
| Three or more job changes within one year                 |          40 |
| One role lasted less than three months                    | 12 per role |
| Unexplained gap of three to six months                    |           6 |
| Unexplained gap longer than six months                    |          12 |
| Frequent switches between completely unrelated industries |           8 |

The three job-change frequency rules are one threshold family, so only the most severe matched tier applies. The two gap-duration rules are another threshold family. Short-tenure deductions and unrelated-industry deductions describe independent facts and may accumulate.

### Conflicting source text

The later ad-hoc values `-5` for industry mismatch, `-3` for fragmented experience, and `-10` for an unrelated major are invalid and are not part of V1. Narrative examples that mention `-20`, `-8`, or `-2` without a matching catalog rule are also invalid; examples never create implicit rules.

### Insufficient evidence

The 100-point deduction baseline must not reward an empty resume:

- no evidence of any job-related skill produces skill score 0;
- no evidence of a relevant project produces project score 0;
- experience, education, potential, or stability with any applicable unresolved rule uses the deterministic 50-point cap and explicit insufficient-evidence markers defined above;
- all six dimensions are evaluated and retain their raw scores, including dimensions whose configured weight is 0.

## Weighting and adjustments

Default integer weights are:

| Dimension            | Weight |
| -------------------- | -----: |
| Skill match          |     35 |
| Experience relevance |     25 |
| Project match        |     15 |
| Education/background |     10 |
| Potential            |      8 |
| Stability            |      7 |

All six stored weight values must total 100. Weight 0 excludes a dimension from the weighted composite calculation, but the dimension is still evaluated and retains its raw score.

Calculation uses integer hundredths of a point rather than binary floating-point arithmetic:

```text
weightedBaseHundredths = Σ(all six integer dimension scores × integer configured weight)
adjustedHundredths = weightedBaseHundredths
  + priorityPointTotal × 100
  - exclusionPointTotal × 100
clampedHundredths = clamp(adjustedHundredths, 0, 10000)
composite = floor((clampedHundredths + 50) / 100)
```

`weightedBaseHundredths / 100` is the weighted base score. The final conversion rounds an exact half point upward and produces an integer without implementation-dependent decimal precision.

Each priority or exclusion condition is judged only as matched or not matched:

- missing evidence means not matched;
- only a matched priority condition adds its configured integer points;
- only a matched exclusion condition subtracts its configured integer points;
- custom conditions deliberately stack with standardized dimension deductions, even when their wording overlaps;
- dimension deductions and job adjustments remain separately visible.

Publish validation requires condition IDs to be unique across both lists, rejects duplicate normalized text inside one list, and rejects the same normalized condition appearing once as priority and once as exclusion. Each condition-match result stores the stable condition ID, frozen source text, matched boolean, cited evidence, concise reason, and applied integer points. Missing evidence is stored as `matched = false` with empty evidence and an explicit missing-evidence reason.

This integer is the sole value used for display, sorting, filtering, and grading:

- 85–100: 推荐
- 75–84: 匹配
- 0–74: 不匹配

## AI presentation and recruiter decision

Before a recruiter decides, the primary AI reference status is:

1. 未通过门槛
2. 门槛待核实
3. 推荐 / 匹配 / 不匹配

The composite score and theoretical score grade remain visible when a gate fails or needs verification. AI reference ordering groups gate-passed/no-gate candidates first, then needs-verification candidates, then failed candidates; each group sorts by composite score descending.

The AI narrative is generated after scoring and must explain the final integer score, raw AI gate evidence, dimension deductions, and job adjustments. It cannot recalculate or contradict the raw AI gate result or score grade produced in that run.

If a recruiter later corrects a gate, the UI labels the unchanged narrative as "AI 原始结论" and displays the recruiter correction separately beside the effective gate status. The product does not present the old narrative as an explanation of the corrected gate and does not silently regenerate it.

The recruiter owns the final `通过 / 不通过` decision:

- AI results never write or change the recruiter decision automatically;
- after a recruiter decides, the HR status becomes the primary label and the AI result becomes secondary;
- a disagreement is shown explicitly but does not rewrite either record;
- when AI says "未通过门槛" or "不匹配", the recruiter may still launch the interview after a confirmation prompt; no reason text is required.

No score or AI result automatically advances the candidate pipeline.

### Launching an AI interview

Clicking "AI面" is one explicit recruiter command. Question preparation that can fail without changing state completes before persistence. After any required disagreement confirmation, one database transaction:

1. locks the candidate recruiting record and revalidates that its current stage can start an AI interview;
2. verifies that the command cannot create a duplicate active round;
3. creates the AI interview round and schedule and obtains the schedule ID required by the context snapshot;
4. changes or keeps the recruiter decision at `pass`, including overwriting an existing recruiter `fail`, stores the prepared interview questions, and advances the pipeline to the AI-interview stage;
5. binds the applicable templates;
6. creates the active interview-context snapshot from the transaction-visible post-update candidate/questions and the new schedule ID;
7. writes the recruiter-decision and interview-launch audit entries.

The stage transition uses a row lock or equivalent conditional update checked inside the transaction; a concurrent loser returns `409 AI_INTERVIEW_STAGE_CONFLICT`. Snapshot creation must accept the same transaction rather than running after commit, and must not read pre-update questions through a separate connection. No reason is stored. If any transactional step fails, the recruiter status, pipeline, context snapshot, round, schedule, questions, bindings, and audit records all roll back.

## Sorting and comparability

Composite-score sorting and score filters are available only after selecting one job. The all-jobs view does not compare legacy and structured scores or aggregate their averages. Legacy jobs keep their existing labels and score interpretation; structured jobs use the new gates and three grades.

Structured ordering uses materialized result fields: gate-passed/no-gate candidates first, then needs-verification candidates, then failed candidates; candidates inside each group sort by composite score descending. Score filtering uses the materialized integer composite score. Candidates without a ready current structured result sort after ready candidates.

### Rebinding and reassessment

Rebinding a resume to another job keeps the current overwrite behavior:

- the legacy and structured current-result fields and summary columns are cleared;
- run-specific recruiter gate corrections are cleared;
- the recruiter pass/fail decision resets;
- a new evaluation is queued under the target published job;
- no cross-job evaluation history is added.

A change to resume evidence invalidates the current AI result. Resume evidence includes the resume file/text and every content-bearing `resumeProfile` field; candidate name, email, and phone are identity/contact fields and do not invalidate scoring by themselves.

On evidence invalidation:

- the current structured artifact, materialized score/gate/grade fields, and run-specific gate corrections are cleared before the replacement run is queued;
- the existing recruiter pass/fail decision is preserved because AI reassessment cannot overwrite a human decision;
- the UI shows the recruiter decision together with an AI `queued`, `processing`, or `failed` state instead of displaying a stale score;
- a successful replacement becomes the only current evaluation;
- a failed replacement leaves no current AI score and does not restore or display the invalidated result.

Concurrent completion is guarded by evaluation run ID, bound job ID, blueprint hash, and resume-input hash. A result whose identity no longer matches the current resume record is discarded rather than persisted.

## Resume-pool boundary

The resume pool remains a pre-library staging area:

- automatic matching considers published jobs only;
- legacy resume-pool behavior remains unchanged;
- a pool item matched or bound to a published structured job is parsed and may retain the job match, but it does not run or store the structured evaluation in `notes`;
- the structured workflow is queued after the item is imported into the resume library and obtains a candidate recruiting record;
- a resume uploaded directly into the resume library is queued normally.

Structured score sorting and filtering therefore apply to resume-library records, not resume-pool items.

## Persistence and audit

Legacy `resumeReview` v4 and `resumeScreeningResult` remain unchanged and are written only by the legacy flow. Structured evaluation uses a separate `StructuredResumeEvaluationV1` artifact; it is not forced into the v4 schema.

The current candidate recruiting record stores:

- `structuredResumeEvaluation`: the complete JSON artifact or null;
- `structuredCompositeScore`: materialized integer 0–100 or null;
- `structuredScoreGrade`: materialized `recommended`, `matched`, or `unmatched` or null;
- `structuredGateStatus`: materialized effective `passed`, `needs_verification`, or `failed` or null;
- `structuredGateSortRank`: materialized 0 for passed/no-gate, 1 for needs verification, or 2 for failed;
- the existing generation lifecycle status/run/error/generated-at fields, reused for whichever immutable job mode is bound.

The four structured summary fields are server-derived from the validated artifact and are written in the same transaction. They have database checks for their allowed values. An atomic recruiter correction updates only the correction data plus effective gate status/rank in one transaction. The query path has an index on organization, job, gate sort rank ascending, and composite score descending for the single-job ordering/filter contract.

Each `StructuredResumeEvaluationV1` stores:

- schema version, job ID, literal `structured` evaluation mode, and immutable published-config snapshot/hash;
- the confirmed evaluation blueprint and blueprint hash;
- pinned deduction-rule-set version;
- evaluation-engine/prompt version and model identifier;
- frozen atomic gate requirements, AI judgments, evidence, and optional recruiter corrections;
- frozen core and auxiliary skill expectations;
- frozen `requiredRelevantExperience` when present;
- UTC `evaluationAsOf`, normalized candidate timeline, per-episode relevance judgments, relevant-work-years source, and timeline evidence;
- all six raw dimension scores, per-rule four-state judgments, insufficient-evidence markers, configured weights, and matched deduction details;
- all priority/exclusion match results, evidence, reasons, and applied points;
- weighted-base hundredths, adjustment totals, clamped hundredths, final integer composite score, and grade;
- resume-input hash, run ID, AI narrative, and generated time.

The lifecycle first validates the full artifact, then atomically writes the artifact, matching summary fields, and ready state only when the run/job/input guards still match. Clients cannot submit summary fields independently.

The structured artifact and its calculations are server-generated only. Existing legacy import/read compatibility may continue accepting validated v4 data, but no client endpoint accepts a caller-supplied `StructuredResumeEvaluationV1`.

Changing the production model does not rewrite historical results or published blueprints. Each engine/model candidate must pass a versioned regression corpus containing at least 100 representative job-resume cases, including gate boundaries, every dimension, missing-evidence cases, and all supported rule-status classes. The corpus, human-approved gold judgments, approved production-engine baseline outputs, and thresholds are reviewed and versioned together.

Rollout is blocked unless all V1 acceptance thresholds pass:

- schema-valid complete artifacts: 100%;
- deterministic calculation, clamping, rounding, and persisted-summary invariants: 100%;
- evidence-citation integrity against supplied job/resume source anchors: 100%;
- overall hard-gate status agreement with human-approved gold labels: at least 95%;
- macro-F1 across supported per-rule four-state judgments: at least 90%;
- composite-score mean absolute error against the approved production-engine baseline: at most 3 points;
- composite-score 95th-percentile absolute error against that baseline: at most 8 points;
- maximum composite-score absolute error against that baseline: at most 15 points;
- score-grade agreement with that baseline: at least 90%.

Changing prompts, output schemas, or semantic matching behavior increments the evaluation-engine version. Changing corpus cases, gold labels, baseline outputs, or tolerances requires explicit review and increments the corpus version; every approved engine version records the exact corpus version it passed. The product promises controlled scoring variance, not identical semantic judgments across every model.

## Failure behavior

A structured evaluation becomes ready only when the gate, scoring, calculation, narrative, artifact validation, and summary-field derivation are complete.

- A failed publication leaves the job as a draft.
- A failed initial evaluation writes only failed lifecycle status/error metadata and leaves all structured result/summary fields null.
- A failed reassessment behaves the same after the invalidated old result has been cleared; stale scores are never presented as current.
- A stale concurrent run writes nothing.
- No failed run writes a partial ready result, changes recruiter status, or advances the candidate pipeline.
