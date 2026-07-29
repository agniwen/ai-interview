# Structured Resume Evaluation V1

## Goal

Use the structured configuration of a newly published job to produce an evidence-backed resume evaluation with hard-gate findings, standardized six-dimension deductions, a deterministic integer composite score, and an AI narrative that explains the already-computed result. The evaluation is advisory; the recruiter owns the final pass/fail decision and manually starts an AI interview.

## Scope

This delivery includes:

- draft and published states for new job descriptions;
- immutable resume-evaluation settings after publication;
- permanent separation between legacy and structured job evaluation;
- a dedicated structured Mastra workflow;
- atomic hard-gate judgments and evidence;
- versioned, product-owned six-dimension deduction rules;
- code-computed dimension, weighted-base, adjustment, and final scores;
- AI match grades and post-score narrative;
- evaluation snapshots and engine/model metadata;
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

A legacy job cannot enable structured evaluation. To use the new rules for the same role, the recruiter creates or copies a new job, producing a separate candidate population and score lineage.

### Draft and publication

A structured job begins as a draft. Drafts are visible only in job management and cannot:

- receive or bind resumes;
- participate in automatic JD matching or talent recommendation;
- produce referral/application links;
- run resume evaluation.

Publishing performs full configuration validation, pins the current deduction-rule-set version, and makes the job available to recruiting workflows.

After publication, the following fields are immutable:

- job name and code;
- job description and prompt;
- all seven hard-gate fields;
- all six weights;
- priority and exclusion conditions;
- the pinned deduction-rule-set version.

Department, interviewer assignment, cross-department interviewer permission, communication questions, and candidate forms remain operationally editable.

## Workflow boundary

The legacy `resume-review-workflow` remains unchanged. A dispatcher resolves the job evaluation mode before entering Mastra:

```text
resume evaluation lifecycle
  ├─ legacy job     → existing legacy screening + resume-review-workflow
  └─ structured job → structured-resume-review-workflow
```

The structured workflow uses this order:

1. Load the published immutable job evaluation snapshot.
2. Atomize and judge configured hard gates from resume evidence.
3. Extract core/auxiliary skill expectations and judge standardized deduction-rule hits for enabled dimensions.
4. Match each priority and exclusion condition as yes or no.
5. Compute all dimension scores, the weighted base score, adjustments, integer composite score, and score grade in code.
6. Generate the AI narrative and recommendation explanation from the completed calculation and evidence.
7. Persist one complete evaluation result and its snapshots.

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

Each non-empty category is atomized at evaluation time. Soft wording such as "优先", "加分", "最好", or equivalent does not become a blocking gate.

### Atomic judgment

Each atomic requirement stores:

- source category and source text;
- normalized requirement;
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

## Standardized dimension scoring

### Ownership and versions

The deduction catalog is product-owned, fixed-identity, and versioned. It is not configurable per workspace or job. A structured job pins the current catalog version when published, and all evaluations for that job use that version. A later catalog version applies only to newly published jobs.

Each enabled dimension starts at 100, accumulates matched deductions, and is floored at 0. A direct-zero rule overrides ordinary deductions. Rules in the same threshold family use only the most severe matched tier; independent facts continue to accumulate.

### V1 deduction catalog

#### Skill match

| Rule                                                                        |      Deduction |
| --------------------------------------------------------------------------- | -------------: |
| Missing one core required skill                                             |   14 per skill |
| Missing one auxiliary skill                                                 |    4 per skill |
| Skill is mentioned only at shallow-awareness level with no applied evidence |    9 per skill |
| No evidence of any job-related skill                                        | Direct score 0 |

Core skills include every skill in the structured required-skills gate plus skills expressed in the published description or prompt with strong wording such as "必须", "必备", "精通", or "熟练掌握". Auxiliary skills require explicit soft wording such as "优先", "加分", "了解", or "熟悉". Extracted expectations are de-duplicated and saved in the evaluation snapshot.

#### Experience relevance

| Rule                                                              |          Deduction |
| ----------------------------------------------------------------- | -----------------: |
| Industry is completely unrelated                                  |                 28 |
| Actual experience is below the job requirement                    | 9 per missing year |
| Relevant experience is fragmented, with repeated switches or gaps |                 13 |

Missing-year count is `ceil(required years - actual years)`. For example, 3 required versus 2.5 actual deducts 9; 3 required versus 1.5 actual deducts 18. If actual years cannot be established, use the insufficient-evidence fallback instead of guessing.

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

The education-tier rule uses the normalized sequence associate degree → bachelor → master → doctorate. The deduction accumulates by distance and is floored at 0: master versus bachelor deducts 38, while master versus associate degree deducts 76. School-tier conditions such as 985 or 211 remain hard-gate semantics unless a future rule version explicitly adds a scoring deduction.

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
- experience, education, potential, or stability that cannot be judged from available evidence receives score 50 with an explicit insufficient-evidence marker;
- disabled dimensions are not evaluated and have no score, rather than score 0.

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

All six stored values must total 100. Weight 0 disables a dimension.

The weighted base score is:

```text
weighted base = Σ(enabled dimension score × weight / 100)
```

Each priority or exclusion condition is judged only as matched or not matched:

- missing evidence means not matched;
- only a matched priority condition adds its configured integer points;
- only a matched exclusion condition subtracts its configured integer points;
- custom conditions deliberately stack with standardized dimension deductions, even when their wording overlaps;
- dimension deductions and job adjustments remain separately visible.

The final score is:

```text
composite = round(clamp(weighted base + priority points - exclusion points, 0, 100))
```

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

The AI narrative is generated after scoring and must explain the final integer score, gate evidence, dimension deductions, and job adjustments. It cannot recalculate or contradict the grade.

The recruiter owns the final `通过 / 不通过` decision:

- AI results never write or change the recruiter decision automatically;
- after a recruiter decides, the HR status becomes the primary label and the AI result becomes secondary;
- a disagreement is shown explicitly but does not rewrite either record;
- clicking "AI面" records recruiter pass and launches the existing manual AI-interview flow;
- when AI says "未通过门槛" or "不匹配", the recruiter may still launch the interview after a confirmation prompt; no reason text is required.

No score or AI result automatically advances the candidate pipeline.

## Sorting and comparability

Composite-score sorting and score filters are available only after selecting one job. The all-jobs view does not compare legacy and structured scores or aggregate their averages. Legacy jobs keep their existing labels and score interpretation; structured jobs use the new gates and three grades.

Rebinding a resume to another job keeps the current overwrite behavior: the old evaluation is cleared, the recruiter evaluation resets, and the target job generates the new current evaluation. This delivery does not add cross-job evaluation history.

## Persistence and audit

Each structured evaluation stores:

- job ID, evaluation mode, and immutable published-config snapshot/hash;
- pinned deduction-rule-set version;
- evaluation-engine/prompt version and model identifier;
- atomized gate requirements, AI judgments, evidence, and optional recruiter corrections;
- extracted core and auxiliary skill expectations;
- enabled dimension scores, insufficient-evidence markers, and matched deduction details;
- all priority/exclusion match results and applied points;
- weighted base score, adjustment totals, final integer composite score, and grade;
- AI narrative and generated time.

Changing the production model does not rewrite historical results. A model change must pass a fixed regression/calibration set before rollout; the product promises controlled scoring variance, not identical semantic judgments across every model.

## Failure behavior

A structured evaluation becomes ready only when the gate, scoring, calculation, narrative, and snapshot are complete. A failed run does not write a partial ready result, does not change recruiter status, and does not advance the candidate.
