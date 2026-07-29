# Structured Resume Evaluation V1 Implementation Plan

> **For agentic workers:** Execute this plan task by task. Use the checkbox steps as the progress log, write the named failing tests before implementation, and do not start a later task until the current task's focused verification passes.

**Goal:** Implement the accepted `Structured Resume Evaluation V1` design: freeze a recruiter-confirmed evaluation blueprint when a new structured job is published, permanently isolate legacy and structured jobs, evaluate structured-job resumes through a dedicated Mastra workflow, calculate all scores in code, persist a separate versioned artifact plus sortable summaries, and keep the recruiter as the final pass/fail decision maker.

**Source of truth:**

- `docs/superpowers/specs/2026-07-29-structured-resume-evaluation-design.md`
- `docs/adr/0022-isolate-legacy-and-structured-resume-evaluation.md`
- `docs/adr/0023-publish-and-freeze-structured-job-evaluation.md`
- `docs/adr/0024-compute-structured-resume-scores-from-versioned-deductions.md`
- `docs/adr/0025-keep-ai-resume-evaluation-advisory.md`
- `docs/adr/0026-store-structured-resume-evaluation-separately.md`
- `CONTEXT.md`

**Architecture:** Introduce three deep modules behind narrow interfaces:

1. **Job evaluation lifecycle** — owns blueprint preview generation, stale-preview detection, publication, and immutable structured-job state.
2. **Structured scoring engine** — accepts a frozen job snapshot plus schema-valid semantic judgments and deterministically returns gate aggregation, six dimension scores, adjustments, integer composite score, grade, and persistence summaries.
3. **Mode-aware resume evaluation lifecycle** — resolves a published job's immutable mode before Mastra, dispatches legacy jobs unchanged, dispatches structured jobs to a dedicated workflow, and atomically persists only the matching artifact.

Mastra owns semantic judgment and narrative generation. It never loads live job configuration from the database and never performs score, duration, threshold, clamping, rounding, or grade arithmetic.

**Tech stack:** TypeScript, Zod, Drizzle/PostgreSQL, Hono RPC, BullMQ, Mastra workflows/Agents, Vitest, React 19, TanStack Query, shadcn/ui.

---

## Preconditions

- [ ] Commit the accepted design, ADR, glossary, and this plan as a docs-only commit before implementation. Start Task 0 from a clean worktree so implementation commits cannot accidentally absorb documentation edits.
- [ ] Record the implementation base commit in the PR description.
- [ ] Do not execute the superseded `2026-07-17-resume-scoring-policy-p1.md` plan.
- [ ] If a task starts changing TanStack Start or Router interfaces rather than only feature components, run the matching `pnpm dlx @tanstack/intent@latest load ...` command from `AGENTS.md` before editing.

## Non-negotiable contracts

- Existing jobs migrate to `legacy + published`; they keep the current screening and `resume-review-workflow`.
- New jobs are server-owned `structured + draft`; evaluation mode never comes from request data or the presence of `structuredConfig`.
- A legacy job cannot be upgraded. A published structured job's evaluation inputs cannot be edited.
- Draft jobs are management/setup resources only. They never appear in recruiting selectors, bindings, matching, referrals, recommendations, semantic indexes, or evaluation.
- `resumeReview` v4 and `resumeScreeningResult` remain legacy-only. Structured results use `StructuredResumeEvaluationV1` and separate summary columns.
- All six dimensions always receive raw integer scores. Weight `0` only removes that score's contribution to the composite.
- The job prompt never contributes core or auxiliary skill expectations. Skills come from the structured required-skills gate and published JD description.
- Missing gate evidence is `needs_verification`; missing priority/exclusion evidence is `matched = false`.
- The model never outputs trusted points, durations, totals, composite score, or grade.
- The displayed, sorted, filtered, and graded structured score is the same server-calculated integer.
- AI output never writes the recruiter pass/fail status or advances the pipeline.
- Clicking `AI面` is the only command in this scope that may set recruiter status to `pass` and advance to `ai_interview`; all launch writes and the context snapshot must share one transaction.
- Historical results are not automatically converted or reassessed.

---

## Target data model

### `job_description`

Add:

| Column                                      | Type        | Contract                                                    |
| ------------------------------------------- | ----------- | ----------------------------------------------------------- |
| `evaluation_mode`                           | text        | `legacy` or `structured`; not null, server-owned, immutable |
| `lifecycle_status`                          | text        | `draft` or `published`; not null                            |
| `published_at`                              | timestamptz | synthetic `created_at` for migrated legacy rows             |
| `evaluation_blueprint_preview`              | jsonb       | server-generated draft preview only                         |
| `evaluation_blueprint_preview_input_hash`   | text        | hash of current evaluation-owned draft inputs               |
| `evaluation_blueprint_preview_hash`         | text        | hash of the complete canonical preview                      |
| `evaluation_blueprint_preview_generated_at` | timestamptz | null outside a confirmed draft preview                      |
| `evaluation_blueprint`                      | jsonb       | immutable published structured blueprint                    |
| `evaluation_blueprint_hash`                 | text        | immutable hash of the published blueprint                   |
| `evaluation_blueprint_schema_version`       | integer     | pinned blueprint schema version                             |
| `deduction_rule_set_version`                | integer     | pinned product deduction catalog version                    |

Database checks must enforce valid mode/state pairs:

- `legacy` rows are always `published`; every structured preview and published-blueprint field is null.
- `structured + draft` has no published blueprint/hash/version/published time.
- `structured + published` has a complete blueprint/hash/schema version/rule-set version/published time and no preview fields.

### `studio_interview`

Add:

| Column                         | Type    | Contract                                              |
| ------------------------------ | ------- | ----------------------------------------------------- |
| `structured_resume_evaluation` | jsonb   | complete `StructuredResumeEvaluationV1` or null       |
| `structured_composite_score`   | integer | null or 0–100                                         |
| `structured_score_grade`       | text    | `recommended`, `matched`, or `unmatched`              |
| `structured_gate_status`       | text    | effective `passed`, `needs_verification`, or `failed` |
| `structured_gate_sort_rank`    | integer | 0 passed/no-gate, 1 needs verification, 2 failed      |

The structured fields are either all null or a complete consistent summary. Add an index ordered by organization, job, gate rank ascending, and composite score descending.

Reuse `resume_review_status`, `resume_review_run_id`, queued/generated/error timestamps as the common generation lifecycle. Do not add a second queue-status family.

---

## Task 0: Define strict schemas and the deterministic scoring engine

**Files:**

- Create: `packages/db-schema/src/job-description-evaluation.ts`
- Create: `packages/db-schema/src/structured-resume-evaluation.ts`
- Modify: `packages/db-schema/src/job-description-structured-config.ts`
- Create: `packages/shared/src/structured-resume-scoring.ts`
- Create: `packages/shared/src/structured-resume-presentation.ts`
- Create: `packages/shared/src/__tests__/structured-resume-scoring.test.ts`
- Create: `packages/shared/src/__tests__/structured-resume-presentation.test.ts`
- Modify only if needed: `packages/db-schema/package.json`, `packages/shared/package.json` exports

**Public interfaces:**

```ts
export const jobEvaluationModeSchema = z.enum(["legacy", "structured"]);
export const jobLifecycleStatusSchema = z.enum(["draft", "published"]);

export const jobEvaluationBlueprintSchema = z.object({
  schemaVersion: z.literal(JOB_EVALUATION_BLUEPRINT_SCHEMA_VERSION),
  hardGateRequirements: z.array(atomicGateRequirementSchema),
  coreSkills: z.array(jobSkillExpectationSchema),
  auxiliarySkills: z.array(jobSkillExpectationSchema),
  requiredRelevantExperience: requiredRelevantExperienceSchema.nullable(),
  educationExpectation: educationExpectationSchema.nullable(),
  dimensionExpectations: dimensionExpectationsSchema,
  priorityConditions: z.array(frozenScoringConditionSchema),
  exclusionConditions: z.array(frozenScoringConditionSchema),
  compiler: blueprintCompilerMetadataSchema,
});

export function computeStructuredResumeEvaluation(
  input: StructuredResumeCalculationInput,
): StructuredResumeCalculation;

export function applyGateCorrection(
  evaluation: StructuredResumeEvaluationV1,
  correction: RecruiterGateCorrectionInput,
): StructuredResumeEvaluationV1;

export function deriveStructuredResumeSummaries(
  evaluation: StructuredResumeEvaluationV1,
): StructuredResumeSummaryFields;
```

`StructuredResumeEvaluationV1` must contain every field required by the accepted design, including:

- immutable job/config/blueprint snapshots and hashes;
- engine, prompt, model, rule-set, and schema versions;
- raw AI gate judgments plus optional run-specific corrections;
- source-cited skill evidence and all rule judgments;
- `evaluationAsOf`, normalized timeline, episode relevance, and relevant-years source;
- all six raw scores and configured integer weights;
- adjustment matches and applied integer points;
- exact hundredths calculation fields, integer composite, and grade;
- input hash, run ID, narrative, and generated timestamp.

**Step 1: Write failing schema and scoring tests**

- [ ] Reject duplicate condition IDs across priority and exclusion lists.
- [ ] Reject duplicate normalized text within one list and the same normalized condition across both lists.
- [ ] Require every configured adjustment to use non-empty free text and a non-zero integer magnitude from 1 to 100.
- [ ] Preserve the new-job default weights `35/25/15/10/8/7`.
- [ ] Keep all six raw scores when one or more weights are `0`.
- [ ] Require integer weights totaling exactly `100`.
- [ ] Apply threshold-family exclusivity for jump and gap rules.
- [ ] Floor ordinary deductions at `0`.
- [ ] Apply direct-zero skill/project rules after retaining explanatory deductions.
- [ ] Apply insufficient-evidence score `min(max(100 - matched deductions, 0), 50)` only to experience, education, potential, and stability when an applicable rule is unresolved.
- [ ] Count only merged `relevant` employment months.
- [ ] Treat resolved episodes as relevant by code for `total_employment`.
- [ ] Allow `resumeProfile.workYears` fallback only for `total_employment`.
- [ ] Use `ceil(required years - relevant years)` for missing-year deductions and let known sufficient relevant months override unresolved episodes.
- [ ] Derive lookback windows, project recency, job changes, short tenure, and unexplained gaps from the stored UTC `evaluationAsOf` date using the exact temporal definitions in the design.
- [ ] Do not count the first known job as a change; do count a later/current role start, merge overlaps, and return insufficient evidence when primary versus concurrent work cannot be resolved.
- [ ] Derive `not_applicable` when the blueprint has no required benchmark.
- [ ] Use exact hundredths arithmetic for weighted base plus integer priority/exclusion points, then clamp and half-up round the final composite.
- [ ] Clamp the adjusted composite to 0–100 without discarding the stored adjustment totals.
- [ ] Derive grades at 85/75 boundaries.
- [ ] Aggregate raw and corrected gates independently.
- [ ] Derive the exact persisted gate status/rank mapping.

Run and confirm failure:

```bash
pnpm --filter @arc/shared test structured-resume
pnpm --filter @arc/db-schema typecheck
```

**Step 2: Implement the product-owned V1 deduction catalog**

- [ ] Encode stable rule IDs and the accepted deduction values.
- [ ] Keep rule applicability, semantic judgment, arithmetic, and display labels separate.
- [ ] Make code derive every duration/threshold-family result from normalized semantic input.
- [ ] Do not reuse `computeResumeReviewBaseScore`; legacy v4 semantics remain untouched.

**Step 3: Implement artifact validation and presentation helpers**

- [ ] Validate all evidence references and rule/status combinations.
- [ ] Ensure the narrative cannot change calculation fields.
- [ ] Add a pure primary-label helper: recruiter status first; otherwise gate precedence; otherwise score grade.
- [ ] Add a pure correction helper that preserves raw AI status and narrative.

**Step 4: Verify**

```bash
pnpm --filter @arc/shared test structured-resume
pnpm --filter @arc/shared typecheck
pnpm --filter @arc/db-schema typecheck
```

**Step 5: Commit**

```bash
git add packages/db-schema packages/shared
git commit -m "feat(resume-evaluation): add structured evaluation contracts and scoring engine"
```

---

## Task 1: Add explicit job lineage and structured-result persistence

**Files:**

- Modify: `packages/db-schema/src/schema.ts`
- Modify if relations expose job/candidate fields: `packages/db-schema/src/relations.ts`
- Generate: `apps/ai-recruitment-copilot/drizzle/<generated_migration>/migration.sql`
- Review: generated `snapshot.json`

**Step 1: Add Drizzle fields and checks**

- [ ] Add the job lifecycle columns from the target model.
- [ ] Add the structured result and materialized summary columns.
- [ ] Add checks for enum values, score range, complete-null/complete-ready summary shape, and gate status/rank agreement.
- [ ] Add the single-job structured ordering index.

**Step 2: Generate the migration**

```bash
pnpm db:generate
```

**Step 3: Correctly order the migration backfill**

The generated SQL must be reviewed and, if necessary, edited so it:

1. adds job mode/state columns without applying structured defaults to old rows;
2. updates every existing job to `evaluation_mode = 'legacy'`, `lifecycle_status = 'published'`, and `published_at = created_at`;
3. clears any preview/published blueprint fields on legacy rows;
4. sets not-null constraints;
5. sets defaults of `structured` and `draft` for future inserts only;
6. adds structured-result columns/checks/indexes without touching legacy `resume_review` or screening data.

- [ ] Add SQL assertions or a migration test fixture proving an old row becomes `legacy + published`.
- [ ] Prove a new default insert becomes `structured + draft`.
- [ ] Prove the migration never interprets existing `structured_config` as the mode.

**Step 4: Verify**

Create an isolated disposable PostgreSQL database containing an upgraded-data fixture with at least one existing legacy job and legacy resume result. Pass its URL explicitly; never run this task against the application `.env` database:

```bash
pnpm --filter @arc/db-schema typecheck
env DATABASE_URL="$STRUCTURED_EVAL_MIGRATION_DATABASE_URL" pnpm db:migrate
```

- [ ] Assert the seeded job/result survives with `legacy + published` identity and unchanged legacy JSON.
- [ ] Assert a post-migration default insert is `structured + draft`.
- [ ] Drop the disposable database after assertions.

If `STRUCTURED_EVAL_MIGRATION_DATABASE_URL` is absent or does not identify a verified disposable database, do not run `db:migrate`; record the migration test as blocked and at minimum inspect generated SQL plus run schema typecheck. Do not claim migration execution passed.

**Step 5: Commit**

```bash
git add packages/db-schema apps/ai-recruitment-copilot/drizzle
git commit -m "feat(db): add structured job lifecycle and resume evaluation storage"
```

---

## Task 2: Build the server-owned blueprint preview and publication module

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/lib/server/job-evaluation-hash.ts`
- Create: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/application/job-evaluation-lifecycle.ts`
- Create: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/application/__tests__/job-evaluation-lifecycle.test.ts`
- Create: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/utils/evaluation-blueprint-compiler.ts`
- Create: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/utils/evaluation-blueprint-compiler.test.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/agents/mastra/agents/simple-generators.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/agents/mastra/index.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/dao.ts`

**Module interface:**

```ts
export function generateStructuredJobBlueprintPreview(input: {
  organizationId: string;
  jobDescriptionId: string;
  actorId: string;
}): Promise<JobEvaluationBlueprintPreview>;

export function publishStructuredJob(input: {
  organizationId: string;
  jobDescriptionId: string;
  confirmedBlueprintHash: string;
  actorId: string;
}): Promise<PublishedStructuredJob>;
```

All Agent calls, canonicalization, hashing, row locks, stale checks, and persistence stay behind these interfaces.

**Step 1: Write failing compiler tests**

- [ ] Atomize only non-empty hard-gate fields.
- [ ] Generate stable server IDs; never trust model-generated IDs.
- [ ] Extract core skills from required-skills gate plus strong wording in JD description.
- [ ] Extract auxiliary skills only from soft wording in JD description.
- [ ] Prove prompt-only skills never enter either list.
- [ ] Preserve source text and source reference for every expectation.
- [ ] Reject invented expectations.
- [ ] Reject more than 20 atoms in one category or 60 total.
- [ ] Produce zero or one `{ years, relevanceScope, sourceText, sourceRef }`.
- [ ] Reject incompatible required-year thresholds/scopes with `JOB_BLUEPRINT_EXPERIENCE_CONFLICT`.
- [ ] Preserve configured priority/exclusion conditions without creating new adjustments.

**Step 2: Implement canonical hashes**

- [ ] Hash only blueprint/scoring inputs for preview invalidation: description, prompt, seven gates, six weights, priority conditions, and exclusion conditions.
- [ ] Exclude name, code, department, interviewer assignment, communication questions, and candidate forms. Name and code still freeze at publication, but changing them on a draft does not invalidate a blueprint they do not influence.
- [ ] Canonicalize object keys and condition ordering before hashing.
- [ ] Keep Node crypto in backend `lib/server`; do not pull `node:*` into `@arc/shared`.

**Step 3: Write failing lifecycle tests**

- [ ] Draft-only preview generation.
- [ ] Compiler failure leaves the last valid preview unchanged.
- [ ] Evaluation-input edit clears every preview field.
- [ ] Name/code and operational-only edits preserve preview.
- [ ] Preview persistence conditionally updates the draft only when its current input hash still matches the hash captured before the Agent call.
- [ ] An evaluation-input edit while compilation is in flight discards the generated preview, leaves the edited draft's preview fields clear, and returns `409 JOB_BLUEPRINT_PREVIEW_STALE`.
- [ ] Publish locks the row, verifies current input hash and submitted blueprint hash, and copies the exact stored preview.
- [ ] Stale/missing preview returns `JOB_BLUEPRINT_PREVIEW_STALE`.
- [ ] Concurrent/repeated publish returns `JOB_ALREADY_PUBLISHED`.
- [ ] Publish pins blueprint schema and deduction rule-set versions atomically.
- [ ] Any publish failure leaves the row draft with no partial published fields.

**Step 4: Implement and verify**

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend test evaluation-blueprint
pnpm --filter @arc/ai-recruitment-copilot-backend test job-evaluation-lifecycle
pnpm --filter @arc/ai-recruitment-copilot-backend typecheck
```

**Step 5: Commit**

```bash
git add apps/ai-recruitment-copilot-backend
git commit -m "feat(jobs): compile preview and publish structured evaluation blueprints"
```

---

## Task 3: Split job request contracts and implement draft/publish UI

**Files:**

- Modify: `packages/shared/src/job-descriptions.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/route.ts`
- Add route tests under: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/__tests__/`
- Modify: `apps/ai-recruitment-copilot/src/components/features/studio/job-descriptions/job-description-form-dialog.tsx`
- Modify: `apps/ai-recruitment-copilot/src/components/features/studio/job-descriptions/job-description-structured-fields.tsx`
- Create: `apps/ai-recruitment-copilot/src/components/features/studio/job-descriptions/job-evaluation-blueprint-preview.tsx`
- Create tests beside the feature components
- Thin wiring only if required: `apps/ai-recruitment-copilot/src/routes/w.$slug.studio.job-descriptions.tsx`

**Step 1: Replace the shared base request schema**

Create distinct schemas:

- `structuredJobDescriptionCreateSchema`: job basics + structured config + operational assignment; no mode and no legacy policy.
- `structuredJobDescriptionDraftUpdateSchema`: all draft-editable fields.
- `structuredJobDescriptionPublishSchema`: confirmed preview blueprint hash only.
- `publishedJobOperationalUpdateSchema`: only job-row-owned operational fields — department, interviewer assignment, and cross-department interviewer permission.
- `legacyJobDescriptionUpdateSchema`: current legacy contract.

Mode and lifecycle remain response-only.

Communication questions and candidate forms remain owned by their existing `interview-questions` and `forms` routes and request schemas. Do not add either resource to the job-description PATCH body; instead, keep their existing job-binding operations available for both structured drafts and published jobs.

**Step 2: Add route behavior with failing tests**

- [ ] `POST /job-descriptions` always creates `structured + draft`.
- [ ] Creation does not enqueue semantic indexing.
- [ ] `POST /:id/evaluation-blueprint-preview` returns/stores the server preview.
- [ ] `POST /:id/publish` accepts only the confirmed preview hash.
- [ ] Successful publication enqueues semantic indexing only after commit.
- [ ] Published structured updates reject frozen fields with `409 JOB_EVALUATION_FROZEN`.
- [ ] Published operational updates still work.
- [ ] Legacy update behavior remains unchanged.
- [ ] Management detail/list responses expose mode, lifecycle, publication time, and preview state.

**Step 3: Implement the lifecycle UI**

- [ ] New job save creates a draft, not an active recruiting job.
- [ ] Show draft/published/legacy badges in job management.
- [ ] For a structured draft, allow editing and show `生成配置预览`.
- [ ] Render atomized gates, skill expectations, relevant-experience requirement, education expectation, weights, and adjustments from the stored preview.
- [ ] Publish only after the recruiter confirms the displayed preview hash.
- [ ] Any later evaluation-input edit visibly invalidates the preview.
- [ ] After publication, disable name/code/description/prompt/gates/weights/adjustments; keep department/interviewer controls editable and keep the existing communication-question/candidate-form management links usable.
- [ ] Legacy jobs continue to render the legacy settings path and never show a structured publish action.
- [ ] Update the old “本期仅保存配置，不执行筛选” copy.

**Step 4: Verify**

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend test job-descriptions
pnpm --filter @arc/ai-recruitment-copilot test job-description
pnpm --filter @arc/ai-recruitment-copilot-backend typecheck
pnpm --filter @arc/ai-recruitment-copilot typecheck
```

**Step 5: Commit**

```bash
git add packages/shared apps/ai-recruitment-copilot-backend apps/ai-recruitment-copilot
git commit -m "feat(jobs): add structured draft preview and publication flow"
```

---

## Task 4: Enforce management versus recruiting job availability

**Files:**

- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/dao.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/job-descriptions/dao/referral-links.ts`
- Modify call sites found by:

```bash
rg -n "listAllJobDescriptions|loadJobDescriptionById|jobDescriptionIdsExist|fetchJobDescriptionsByCodes" apps packages
```

- Modify high-risk recruiting callers:
  - `.../studio/routes/resumes/route.ts`
  - `.../studio/routes/resumes/utils/review-worker.ts`
  - `.../studio/routes/resume-pool/route.ts`
  - `.../studio/routes/resume-upload-batches/route.ts`
  - `.../studio/routes/resume-upload-batches/utils/processor.ts`
  - `.../studio/routes/interviews/collection-route.ts`
  - `.../routes/interview/routes/analysis/route.ts`
  - `.../routes/chat/routes/conversations/actions.ts`
  - `.../server/agents/mastra/tools/recruiting-copilot.ts`
  - `apps/ai-recruitment-copilot-worker/src/mail-ingest/processor.ts`
  - public referral routes and recommendation/indexing paths
- Audit direct job-table reads that bypass the named DAO helpers:

```bash
rg -n "\\.(from|leftJoin|innerJoin)\\(jobDescription\\)" apps packages
```

- Modify relevant frontend job selectors to call a published-only endpoint
- Add/modify tests at each owned route

**Required DAO interfaces:**

```ts
loadManagedJobDescriptionById(...)
listManagedJobDescriptions(...)
managedJobDescriptionIdsExist(...)

loadRecruitingJobDescriptionById(...) // published only
listRecruitingJobDescriptions(...) // published only
recruitingJobDescriptionIdsExist(...) // published only
fetchPublishedJobDescriptionsByCodes(...)
```

Do not add an `includeDrafts` boolean to one generic loader.

**Step 1: Write failing availability tests**

- [ ] Management/setup can load structured drafts.
- [ ] Direct and batch resume binding/upload cannot bind a draft.
- [ ] Batch bind mode rejects a structured draft before creating the batch, while the same request succeeds for a published job.
- [ ] Batch processor input cannot retain or evaluate a job that fails the published recruiting loader.
- [ ] Automatic matching never receives drafts.
- [ ] Resume-pool matching/binding never accepts drafts.
- [ ] Interview creation cannot select a draft.
- [ ] Referral-link creation fails for a draft.
- [ ] An old token stops resolving if its job is not published.
- [ ] Recommendations and semantic-index backfills include published jobs only.
- [ ] Forms and interview-question setup can bind both a structured draft and a published job through their existing resource routes.

**Step 2: Implement explicit loaders and audit every caller**

- [ ] Keep `/job-descriptions` management list unchanged in purpose.
- [ ] Add an explicit published/recruiting list endpoint for recruiting selectors.
- [ ] Rename callers rather than aliasing old generic functions indefinitely.
- [ ] Ensure caches distinguish management and recruiting lists.

**Step 3: Verify**

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend test job-description
pnpm --filter @arc/ai-recruitment-copilot-backend test referral
pnpm --filter @arc/ai-recruitment-copilot-backend test resume-pool
pnpm --filter @arc/ai-recruitment-copilot-backend test resume-upload-batches
pnpm --filter @arc/ai-recruitment-copilot-worker test
```

**Step 4: Commit**

```bash
git add apps packages
git commit -m "feat(jobs): exclude draft jobs from recruiting workflows"
```

---

## Task 5: Implement the dedicated structured Mastra workflow

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/server/agents/structured-resume-evaluation.ts`
- Create: `apps/ai-recruitment-copilot-backend/src/server/agents/mastra/workflows/structured-resume-review-workflow.ts`
- Create: `apps/ai-recruitment-copilot-backend/src/server/agents/mastra/__tests__/structured-resume-review-workflow.test.ts`
- Create prompt/schema tests under `src/server/agents/__tests__/`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/agents/mastra/agents/simple-generators.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/agents/mastra/workflows/index.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/agents/mastra/index.ts`
- Preserve and regression-test: existing `resume-review-workflow.ts`

**Workflow input:**

```ts
{
  jobSnapshot: {
    jobId,
    evaluationMode: "structured",
    publishedConfig,
    blueprint,
    blueprintHash,
    deductionRuleSetVersion,
  },
  resumeInput: {
    resumeProfile,
    resumeText,
    resumeInputHash,
    runId,
    evaluationAsOf, // UTC YYYY-MM-DD
  },
  engine: {
    version,
    promptVersion,
    modelId,
  },
}
```

No organization ID is needed by workflow logic, and no step may query the database.

**Workflow steps:**

1. `validate-structured-input`
2. `judge-hard-gates`
3. `judge-dimension-evidence`
4. `judge-adjustments`
5. `compute-structured-score`
6. `generate-structured-narrative`
7. `assemble-structured-evaluation`

**Step 1: Write failing workflow tests**

- [ ] Reject mode/hash/rule-version mismatches before Agent calls.
- [ ] Hard-gate Agent returns only statuses/evidence/reasons.
- [ ] Dimension Agent returns only source-cited semantic facts: normalized timeline intervals, primary/concurrent-role evidence, episode relevance for narrow scopes, skill/project/education facts, and non-arithmetic semantic relationships.
- [ ] The Agent output schema has no duration totals or derived statuses for missing years, job-change frequency, short tenure, employment gaps, or project recency.
- [ ] Code derives those five temporal/numeric rule families and their four-state judgments from the normalized facts, frozen benchmark, and `evaluationAsOf`.
- [ ] A workflow test rejects or ignores an Agent attempt to provide a trusted duration, threshold tier, temporal rule status, deduction amount, dimension score, composite, or grade.
- [ ] Adjustment Agent returns only boolean matches/evidence/reasons.
- [ ] Compute step calls the Task 0 scoring engine.
- [ ] Narrative Agent receives the completed integer score, grade, raw gate result, deductions, and adjustments.
- [ ] Narrative output cannot overwrite score/grade/gates.
- [ ] Final output passes the strict V1 artifact schema.
- [ ] Missing priority/exclusion evidence is not matched.
- [ ] All six dimensions exist even at weight `0`.
- [ ] Workflow stream labels and Mastra registration expose every step.

**Step 2: Implement focused Agents**

- [ ] Use short Agent instructions in `simple-generators.ts`.
- [ ] Keep long prompts and output schemas in `structured-resume-evaluation.ts`.
- [ ] Require source anchors for all semantic claims.
- [ ] Tell the model explicitly that total work years cannot satisfy a narrower relevant-experience scope.
- [ ] For `total_employment`, code assigns resolved episodes as relevant without asking the Agent; for a narrower scope, the Agent classifies relevance but never sums months.
- [ ] Keep core/auxiliary skills frozen from the blueprint; the resume Agent never re-extracts job requirements.

**Step 3: Preserve the legacy workflow**

- [ ] Existing workflow IDs, schemas, prompts, and v4 output remain unchanged.
- [ ] Add a regression test proving a legacy invocation never imports or calls structured Agents.

**Step 4: Verify**

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend test structured-resume-review-workflow
pnpm --filter @arc/ai-recruitment-copilot-backend test resume-review-workflow
pnpm --filter @arc/ai-recruitment-copilot-backend typecheck
```

**Step 5: Commit**

```bash
git add apps/ai-recruitment-copilot-backend
git commit -m "feat(mastra): add structured resume evaluation workflow"
```

---

## Task 6: Make the generation lifecycle mode-aware and atomically persist results

**Files:**

- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/utils/review-lifecycle.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/utils/review-lifecycle.test.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/utils/review-generation.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/utils/review-generation.test.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/utils/review-worker.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/utils/review-worker.test.ts`
- Create: `apps/ai-recruitment-copilot-backend/src/lib/server/resume-evaluation-input-hash.ts`
- Add tests for input hashing

**Target lifecycle result:**

```ts
type GeneratedResumeAssessment =
  | {
      mode: "legacy";
      review: string;
      resumeReview: ResumeReview;
      screeningResult: ResumeScreeningResult;
    }
  | {
      mode: "structured";
      evaluation: StructuredResumeEvaluationV1;
      summaries: StructuredResumeSummaryFields;
    };
```

**Step 1: Write failing dispatcher tests**

- [ ] Missing/unpublished bound job cannot evaluate.
- [ ] Legacy job calls only the existing screening + v4 workflow.
- [ ] Structured job calls only the dedicated structured workflow.
- [ ] Existing-ready check uses the artifact for the resolved mode.
- [ ] Structured processing never changes legacy screening fields.
- [ ] Legacy processing never changes structured fields.
- [ ] Same queued run and its worker retries reuse one persisted run ID and one `evaluationAsOf` date; a retry never generates a new identity.
- [ ] Replacing a resume file changes the input identity and rejects an in-flight completion even when the replacement produces identical resume text/profile.

**Step 2: Add immutable input loading**

- [ ] Load the published job and full immutable evaluation snapshot before entering Mastra.
- [ ] Compute `resumeInputHash` from `resumeContentHash` (or an equivalent stable file digest), resume text, and every content-bearing `resumeProfile` field, excluding only candidate name/email/phone from the profile projection.
- [ ] Treat missing file digest as an explicit canonical null value so hashing is deterministic; never substitute storage path or filename for content identity.
- [ ] Change the lifecycle contract to require an already-persisted `resumeReviewRunId` plus `resumeReviewQueuedAt` and never generate a new identity after dequeue. Task 7's scheduler owns creating and persisting them together before enqueue or in-process fallback.
- [ ] Derive the UTC `evaluationAsOf` date from that run's unchanged `resumeReviewQueuedAt` on every attempt and never recalculate it from retry time.
- [ ] Pass snapshots to the workflow; workflow does no database lookup.

**Step 3: Implement guarded persistence**

Within one database transaction:

1. lock/reload the candidate;
2. verify run ID and bound job ID;
3. recompute and compare the current resume input hash;
4. reload/verify published job mode and blueprint hash;
5. validate the complete output artifact;
6. derive summaries on the server;
7. write artifact, summaries, ready status, and timestamps together.

- [ ] A stale run writes nothing.
- [ ] Structured `markReady` leaves `notes`, `resumeReview`, and all legacy screening fields untouched.
- [ ] Legacy `markReady` keeps current behavior and leaves structured fields untouched.
- [ ] Failed structured initial generation leaves structured artifact/summaries null.
- [ ] Failed reassessment does not restore an invalidated result.

**Step 4: Verify**

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend test review-lifecycle
pnpm --filter @arc/ai-recruitment-copilot-backend test review-generation
pnpm --filter @arc/ai-recruitment-copilot-backend test review-worker
pnpm --filter @arc/ai-recruitment-copilot-backend typecheck
```

**Step 5: Commit**

```bash
git add apps/ai-recruitment-copilot-backend
git commit -m "feat(resume-evaluation): dispatch and persist mode-specific evaluations"
```

---

## Task 7: Fix upload, resume-pool, rebind, and reassessment boundaries

**Files:**

- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/route.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/utils/create-from-storage.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/utils/review-queue.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-pool/dao.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resume-pool/utils/admission.ts`
- Modify: `packages/resume-parse-queue/src/resume-review-generation.ts`
- Modify: `packages/resume-parse-queue/src/resume-review-generation.test.ts`
- Modify mode-aware pool handling in `review-worker.ts`
- Modify relevant tests under `resumes/__tests__`, `resumes/utils`, and `resume-pool`
- Audit and modify every existing-library evidence writer found by:

```bash
rg -n -U "\\.set\\(\\{[\\s\\S]{0,500}(resumeContentHash|resumeProfile|resumeText|targetRole)" \
  apps/ai-recruitment-copilot-backend/src \
  apps/ai-recruitment-copilot-worker/src
```

**Step 1: Write failing boundary tests**

- [ ] A direct structured-job upload inserts the candidate first and then queues structured evaluation.
- [ ] With no configured review queue, a direct structured-job upload inserts first, marks the common lifecycle for one run, and starts that same lifecycle through the existing in-process fallback instead of leaving the result `idle`.
- [ ] Queue unavailability or enqueue failure has an explicit return state; callers never treat `false` as a successful scheduled evaluation.
- [ ] A client cannot supply `StructuredResumeEvaluationV1`.
- [ ] Validated legacy v4 import compatibility remains available only for a legacy job.
- [ ] A structured-bound resume-pool item never writes structured output to `notes`.
- [ ] A legacy-bound pool item keeps its current behavior.
- [ ] Importing a structured-bound pool item into the library queues evaluation after the candidate record exists.
- [ ] Auto-matching considers published jobs only.

**Step 2: Make queue state and deduplication mode-aware**

- [ ] Resolve the bound job through the published recruiting loader before any queue-status write.
- [ ] For a legacy job, preserve the current `resumeReview` readiness check and legacy screening processing/failed status behavior.
- [ ] For a structured job, existing-ready/deduplication checks require a valid `StructuredResumeEvaluationV1` plus all materialized summaries; a null legacy `resumeReview` is irrelevant.
- [ ] Structured queueing, enqueue failure, processing, ready, and failed transitions update only the shared `resumeReview*` generation lifecycle and never write `resumeScreeningStatus`, `resumeScreeningError`, `resumeScreeningResult`, or its evaluated time.
- [ ] Queue tests cover successful enqueue, enqueue failure, already-current, force reassessment, and unpublished/stale job binding for both modes.
- [ ] Factor one post-insert scheduling operation used by direct upload, batch-library admission, and resume-pool import. It returns a discriminated result such as `enqueued | already_current | fallback_sync | failed`, not an ambiguous boolean.
- [ ] Add the persisted expected run ID to library-record queue payloads and job identity; the worker rejects a job when the current record's run ID no longer matches.
- [ ] `fallback_sync` reuses the persisted queued time/run identity and invokes the same mode-aware lifecycle in process; it does not reimplement scoring in the route.

**Step 3: Centralize invalidation**

Create one mode-aware invalidation helper used by all candidate mutations:

- Job rebind clears legacy and structured current artifacts, summaries, corrections, lifecycle fields, and recruiter pass/fail status; then queues under the target published job.
- Resume evidence change clears the current AI artifact/summaries/corrections before queueing but preserves recruiter pass/fail status.
- Name/email/phone-only changes do not invalidate.
- Changes to target role, age, gender, work years, work/project/education/skills, resume text, or resume file do invalidate.
- Reassessment never creates cross-job evaluation history.
- Initial inserts may write evidence without invalidating an absent result; every update to an existing library record, including maintenance/backfill writers, must either call the helper or prove by test that no current result can exist.

**Step 4: Guard concurrent completion**

- [ ] Queue job identity and worker guard include current job ID; runtime artifact includes run ID, blueprint hash, and resume input hash.
- [ ] A rebind/evidence edit during generation causes the old completion to be discarded.
- [ ] A failed replacement leaves lifecycle `failed` and no current structured score.

**Step 5: Verify**

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend test route-behavior
pnpm --filter @arc/ai-recruitment-copilot-backend test resume-pool
pnpm --filter @arc/ai-recruitment-copilot-backend test review-queue
pnpm --filter @arc/resume-parse-queue test
```

**Step 6: Commit**

```bash
git add apps packages/resume-parse-queue
git commit -m "feat(resume-evaluation): enforce structured upload and reassessment boundaries"
```

---

## Task 8: Add structured list DTOs, single-job sorting, and filtering

**Files:**

- Modify: `packages/shared/src/studio-resumes.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/dao/resumes.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/read-route.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/__tests__/dao.test.ts`
- Modify: `apps/ai-recruitment-copilot/src/lib/client/api/endpoints/studio-resumes.ts`
- Modify: `apps/ai-recruitment-copilot/src/components/features/studio/resumes/resume-library-page.tsx`
- Modify focused list/card components and tests

**Step 1: Extend list/detail DTOs**

Return:

- bound job evaluation mode;
- current artifact mode;
- structured composite score, grade, gate status/rank;
- lifecycle status/error/timestamps;
- full structured artifact only in detail, never list.

Keep legacy `resumeReviewBaseScore`/next-step fields for legacy cards.

**Step 2: Write query tests**

- [ ] Default all-job ordering remains unchanged.
- [ ] Structured score sort/filter requires exactly one selected job.
- [ ] Invalid all-job or multi-job score request returns a stable 400 error.
- [ ] Selected legacy job keeps legacy ordering and labels; structured sort is unavailable.
- [ ] Selected structured job orders gate rank ascending, composite descending, then stable candidate tie-breaker.
- [ ] Ready results precede non-ready results; null scores sort last.
- [ ] Min/max filters use the materialized integer column.
- [ ] DAO does not parse/sort the JSON artifact.

**Step 3: Implement UI controls**

- [ ] Show structured score controls only when exactly one structured job is selected.
- [ ] Use the integer value without decimal formatting.
- [ ] Do not compare or aggregate legacy and structured scores in metrics/charts.
- [ ] Keep vector recommendation score visually and semantically separate.

**Step 4: Verify**

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend test resumes/dao
pnpm --filter @arc/ai-recruitment-copilot test resume-library
pnpm --filter @arc/shared typecheck
```

**Step 5: Commit**

```bash
git add packages/shared apps
git commit -m "feat(resumes): add structured score ordering and filters"
```

---

## Task 9: Implement recruiter presentation and gate corrections

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/routes/structured-evaluation/route.ts`
- Create route and mutation tests beside it
- Mount from: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/route.ts`
- Modify: `apps/ai-recruitment-copilot/src/components/features/studio/resumes/resume-overview-panel.tsx`
- Create: `apps/ai-recruitment-copilot/src/components/features/studio/resumes/structured-resume-evaluation-panel.tsx`
- Add focused component tests

**Endpoints:**

- `PATCH /resumes/:id/structured-evaluation/gates/:requirementId`
  - body: `expectedRunId` plus corrected `passed | failed | needs_verification`, or `null` to remove correction;
  - requires `requirePermission("resumeLibrary", "update")`, an active organization, and the current recruiting visibility scope;
  - scopes candidate, artifact, and requirement lookup plus the guarded update by `activeOrg.id`; inaccessible cross-organization records return the same not-found response as missing records;
  - preserves raw AI status/narrative;
  - requires current run ID match;
  - atomically writes correction plus effective gate status/rank.
- Reuse the existing reassessment command; do not add a client artifact write endpoint.

**Step 1: Write failing correction tests**

- [ ] Correction requires a ready current structured artifact.
- [ ] Unknown requirement or stale run returns conflict/not-found.
- [ ] Missing update permission is rejected before the mutation.
- [ ] A record outside the active organization or recruiting visibility scope cannot be read or corrected.
- [ ] Correction stores recruiter and timestamp but no reason.
- [ ] Raw status, dimension scores, composite score, grade, and narrative are unchanged.
- [ ] Effective category/overall gate and materialized rank update together.
- [ ] Removing the correction restores raw aggregation.
- [ ] Rebind/evidence invalidation clears corrections with the artifact.

**Step 2: Build the structured detail panel**

- [ ] Before HR acts: show `未通过门槛`, `门槛待核实`, or score grade by precedence.
- [ ] After HR acts: `通过/不通过` is primary; AI result remains secondary.
- [ ] Show the integer composite used for sorting/grading.
- [ ] Render all six raw dimensions in the radar/details, including weight-0 dimensions.
- [ ] Gray a weight-0 dimension and label its contribution as `0`, without hiding its raw score.
- [ ] Show hard-gate evidence and optional correction controls.
- [ ] Show standardized deduction details, adjustments, and source citations.
- [ ] Label unchanged post-correction narrative as `AI 原始结论`.
- [ ] Never require recruiters to resolve every `needs_verification` item before pass/fail.
- [ ] Preserve the current legacy review UI for legacy jobs.

**Step 3: Verify**

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend test structured-evaluation
pnpm --filter @arc/ai-recruitment-copilot test structured-resume
pnpm --filter @arc/ai-recruitment-copilot typecheck
```

**Step 4: Commit**

```bash
git add apps
git commit -m "feat(resumes): show structured evaluation and gate corrections"
```

---

## Task 10: Make `AI面` one locked, atomic recruiter command

**Files:**

- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/application/launch-ai-interview-round.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/application/default-launch-ai-interview-round.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/application/__tests__/launch-ai-interview-round.test.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/dao/evaluation.ts`
- Modify/add focused tests for the tx-aware recruiter-decision/audit helper
- Reuse without changing unless a focused test exposes a missing transaction contract: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/interviews/dao/context-snapshots.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/interviews/dao/__tests__/context-snapshots.test.ts`
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/interviews/__tests__/context-snapshot-boundary-source.test.ts`
- Add a database integration test for rollback/concurrency
- Modify: `apps/ai-recruitment-copilot-backend/src/server/routes/studio/routes/resumes/read-route.ts`
- Modify: `apps/ai-recruitment-copilot/src/components/features/studio/resumes/launch-interview-dialog.tsx`
- Modify: `apps/ai-recruitment-copilot/src/lib/client/api/endpoints/studio-resumes.ts`

**Step 1: Remove the post-commit snapshot seam**

Replace separate `commit` then `createSnapshot` dependencies with one persistence interface whose production adapter owns the complete database transaction. Question generation/preparation remains outside the transaction.

- [ ] Reuse the existing `refreshInterviewContextSnapshot(tx, ...)` primitive. Do not introduce another snapshot abstraction and do not call `loadOrCreateActiveInterviewContextSnapshot`.
- [ ] Keep every refresh read/write on the caller's existing Drizzle transaction; it must not call `db.transaction`, `loadActiveInterviewContextSnapshot`, or any other default-connection reader internally.
- [ ] Extract a tx-aware recruiter-decision/audit helper from `resumes/dao/evaluation.ts`; the launch transaction uses it to set/overwrite `pass` and write the attributable decision audit without opening a nested transaction.
- [ ] Keep the existing standalone HR decision commands as wrappers that open their own transaction and delegate to the tx-aware primitive.
- [ ] Make the production launch adapter perform row lock/revalidation, schedule insert, HR decision/questions/stage update, template binding, snapshot creation, and both audits through that one transaction.

**Step 2: Write failing transaction tests**

- [ ] Candidate row is locked before stage/recruiter validation.
- [ ] Closed/later-stage candidate returns `AI_INTERVIEW_STAGE_CONFLICT`.
- [ ] Duplicate active round is rejected under the same lock.
- [ ] Transaction creates round/schedule before snapshot.
- [ ] It sets or overwrites recruiter status to `pass`.
- [ ] It writes prepared questions and advances the stage before snapshot reads.
- [ ] It binds templates before snapshot reads.
- [ ] Snapshot uses the new schedule ID and transaction-visible updated questions.
- [ ] When an active snapshot already exists, launch marks it `superseded` and creates a new active version for the new schedule rather than reusing it.
- [ ] Snapshot creation performs no read or write through the default database connection.
- [ ] The source-boundary test requires the launch production adapter to call `refreshInterviewContextSnapshot(tx, ...)` and forbids `loadOrCreateActiveInterviewContextSnapshot`.
- [ ] Recruiter-decision and launch audit records are attributable.
- [ ] No reason is stored.
- [ ] Snapshot/binding/audit failure rolls back recruiter status, stage, schedule, questions, bindings, and audit rows.
- [ ] Concurrent launch loser returns `409 AI_INTERVIEW_STAGE_CONFLICT`.

**Step 3: Add advisory confirmation UX**

- [ ] If current structured AI gate is failed or grade is `unmatched`, show a confirmation before launching.
- [ ] Confirmation sends no reason.
- [ ] A recruiter may still launch after confirming.
- [ ] Recommended/matched results do not auto-launch.

**Step 4: Verify**

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend test launch-ai-interview-round
pnpm --filter @arc/ai-recruitment-copilot-backend test context-snapshots
pnpm --filter @arc/ai-recruitment-copilot-backend test context-snapshot-boundary-source
pnpm --filter @arc/ai-recruitment-copilot test launch-interview
```

**Step 5: Commit**

```bash
git add apps
git commit -m "fix(interviews): launch AI interview in one locked transaction"
```

---

## Task 11: Build the versioned calibration and rollout gate

**Files:**

- Create: `apps/ai-recruitment-copilot-backend/src/scripts/structured-resume-eval.ts`
- Create: `apps/ai-recruitment-copilot-backend/src/scripts/structured-resume-eval/types.ts`
- Create: `apps/ai-recruitment-copilot-backend/src/scripts/structured-resume-eval/dataset.ts`
- Create: `apps/ai-recruitment-copilot-backend/src/scripts/structured-resume-eval/metrics.ts`
- Create: `apps/ai-recruitment-copilot-backend/src/scripts/structured-resume-eval/report.ts`
- Add tests for dataset, metrics, and report
- Add sanitized/versioned corpus manifest and cases under a non-PII fixture directory
- Modify: `apps/ai-recruitment-copilot-backend/package.json`

**Step 1: Implement dataset validation**

- [ ] Require at least 100 job-resume cases.
- [ ] Require coverage metadata for gate boundaries, every dimension, missing evidence, and every supported rule-status class.
- [ ] Require immutable source anchors.
- [ ] Reject direct personal contact data and unsanitized source files.
- [ ] Version cases, gold labels, baseline outputs, thresholds, approver, and approval timestamp together.

**Step 2: Implement metrics**

- [ ] Complete schema-valid artifacts: 100%.
- [ ] Deterministic calculation/persistence invariants: 100%.
- [ ] Evidence citation integrity: 100%.
- [ ] Overall hard-gate agreement with gold: at least 95%.
- [ ] Per-rule four-state macro-F1: at least 90%.
- [ ] Composite-score MAE: at most 3.
- [ ] Composite-score P95 absolute error: at most 8.
- [ ] Maximum absolute error: at most 15.
- [ ] Grade agreement: at least 90%.
- [ ] Any failed threshold exits non-zero.

For the first V1 release, derive expected score/grade from human-approved gold rule judgments through the deterministic engine. After V1 is approved, freeze its reviewed outputs as the production baseline for later engine versions.

**Step 3: Add the CLI/report**

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend eval:structured-resumes -- \
  --corpus <versioned-corpus-path> \
  --output <report-path>
```

- [ ] Report engine/prompt/model/corpus versions and every threshold.
- [ ] Never mutate historical stored evaluations.
- [ ] Require a new engine version for prompt/schema/semantic behavior changes.
- [ ] Require a new corpus version and explicit approval for case/label/baseline/tolerance changes.

**Step 4: Human approval checkpoint**

AI may prepare sanitized/synthetic cases and the tooling, but must not self-approve gold labels or the corpus manifest. Rollout remains blocked until the designated recruiting reviewer approves the corpus.

**Step 5: Verify**

```bash
pnpm --filter @arc/ai-recruitment-copilot-backend test structured-resume-eval
pnpm --filter @arc/ai-recruitment-copilot-backend typecheck
```

**Step 6: Commit**

```bash
git add apps/ai-recruitment-copilot-backend
git commit -m "feat(evals): add structured resume calibration gate"
```

---

## Task 12: Full regression, migration rehearsal, and acceptance

**Automated verification:**

```bash
pnpm --filter @arc/db-schema typecheck
pnpm --filter @arc/shared test
pnpm --filter @arc/shared typecheck
pnpm --filter @arc/resume-parse-queue test
pnpm --filter @arc/resume-parse-queue typecheck
pnpm --filter @arc/ai-recruitment-copilot-backend test
pnpm --filter @arc/ai-recruitment-copilot-backend typecheck
pnpm --filter @arc/ai-recruitment-copilot test
pnpm --filter @arc/ai-recruitment-copilot typecheck
pnpm --filter @arc/ai-recruitment-copilot-worker test
pnpm typecheck
pnpm check
git diff --check
```

Run both the clean-database and upgraded-database migration rehearsals against explicitly named disposable PostgreSQL databases, never the application `.env` database. Confirm:

- [ ] Old job rows are `legacy + published` with unchanged policies/results.
- [ ] New job rows are `structured + draft`.
- [ ] No draft has a semantic index or recruiting reference.
- [ ] Legacy v4 generation still passes unchanged fixtures.
- [ ] Structured results never appear in legacy columns.
- [ ] Materialized summaries always match the structured artifact.
- [ ] Index-backed single-job ordering matches gate-first/score-desc behavior.

**Manual acceptance:**

1. Create a structured job and verify it is absent from resume/job selectors before publication.
2. Generate a blueprint preview; edit an evaluation field and verify the preview becomes stale.
3. Regenerate, confirm, publish, and verify frozen fields cannot be edited.
4. Upload one resume to a legacy job and verify the old workflow/result/UI.
5. Upload one resume to the structured job and verify hard gates, six raw dimensions, deductions, integer score, grade, narrative, and citations.
6. Set one dimension weight to `0` in a fresh draft job; verify the raw score remains and contribution is zero.
7. Correct one gate; verify raw AI status/narrative remain and effective ordering changes.
8. Change resume evidence; verify old AI result disappears, HR decision remains, and replacement lifecycle is visible.
9. Rebind to another published job; verify both AI result families and HR decision reset before new evaluation.
10. Select one structured job and verify gate-first score ordering/filtering; clear the job filter and verify score controls disappear.
11. Launch `AI面` from an unmatched result after confirmation; verify HR becomes pass and the snapshot includes the new schedule ID/questions.
12. Force a snapshot failure in a test environment and verify the entire launch transaction rolls back.
13. Import a structured-bound resume-pool item; verify no pool `notes` evaluation and evaluation begins only after library admission.
14. Run the approved calibration corpus and attach the passing report.

**Final commit if verification required fixes:**

```bash
git add <only-files-changed-by-verification>
git commit -m "test(resume-evaluation): complete structured evaluation regression coverage"
```

---

## Dependency graph

```text
T0 strict contracts + scoring engine
 ├─ T1 schema/migration
 │   └─ T2 blueprint lifecycle
 │       └─ T3 job API + publish UI
 │           └─ T4 recruiting availability
 └─ T5 dedicated structured workflow

T4 + T5 ── T6 mode-aware persistence
T6 ── T7 upload/pool/rebind/invalidation
T6 ── T8 list/detail DTO + sort/filter
T8 ── T9 recruiter UI/corrections
T9 + existing launch flow ── T10 atomic AI interview launch
T5 + T6 ── T11 calibration gate
all tasks ── T12 regression and acceptance
```

Execute the numbered tasks in order. The graph documents prerequisites, not authorization to run shared-worktree agents in parallel. In particular, Task 6 must consume Task 4's published-only recruiting loader, Task 9 must consume Task 8's detail DTO, and Task 10 must consume the final Task 9 presentation contract.

## Execution handoff

- Execute Task 0 through Task 12 in order; use the dependency graph only to verify prerequisites.
- Keep each commit scoped to one task.
- After each task, compare the resulting diff with the accepted design and the task's failing tests before moving on.
- Code completion does not authorize production rollout. Production rollout additionally requires the Task 11 human-approved corpus and a passing versioned report.
