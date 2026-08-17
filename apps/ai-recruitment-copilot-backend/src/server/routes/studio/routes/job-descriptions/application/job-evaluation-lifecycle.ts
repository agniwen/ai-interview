import type {
  JobEvaluationBlueprint,
  JobEvaluationRuleDraft,
} from "@arc/db-schema/job-description-evaluation";
import {
  JOB_EVALUATION_BLUEPRINT_SCHEMA_VERSION,
  jobEvaluationBlueprintSchema,
  jobEvaluationRuleDraftSchema,
} from "@arc/db-schema/job-description-evaluation";
import type {
  JobDescriptionDeductionRules,
  JobDescriptionStructuredConfig,
} from "@arc/db-schema/job-description-structured-config";
import { parseStoredJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import { STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION } from "@arc/shared/structured-resume-scoring";
import { and, eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  computeJobEvaluationDraftInputHash,
  computeJobEvaluationPayloadHash,
} from "@arc/ai-recruitment-copilot-backend/lib/server/job-evaluation-hash";
import { jobDescription } from "@arc/db-schema/schema";
import {
  getMastraModelIdentifier,
  mastraModels,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/models";
import {
  compileEvaluationBlueprint,
  generateEvaluationBlueprintCandidate,
  JOB_EVALUATION_BLUEPRINT_COMPILER_PROMPT_VERSION,
} from "../utils/evaluation-blueprint-compiler";
import type { JobEvaluationRuleDraftProgress } from "../utils/evaluation-blueprint-compiler";

export interface JobEvaluationDraft {
  description: string | null;
  evaluationBlueprintPreview: JobEvaluationBlueprint | null;
  evaluationBlueprintPreviewHash: string | null;
  evaluationMode: "legacy" | "structured";
  id: string;
  lifecycleStatus: "draft" | "published";
  prompt: string;
  structuredConfig: JobDescriptionStructuredConfig;
}

interface GeneratePreviewInput {
  actorId: string;
  jobDescriptionId: string;
  organizationId: string;
}

interface PublishInput extends GeneratePreviewInput {
  confirmedBlueprintHash: string;
}

interface SaveRuleDraftInput extends GeneratePreviewInput {
  deductionRules: JobDescriptionDeductionRules;
  expectedBlueprintHash: string;
  ruleDraft: JobEvaluationRuleDraft;
}

interface PreviewResult {
  blueprint: JobEvaluationBlueprint;
  blueprintHash: string;
  generatedAt: string;
  inputHash: string;
}

type PublishStoredResult =
  | { job: typeof jobDescription.$inferSelect; status: "published" }
  | { status: "already_published" | "not_found" | "stale" };

interface LifecycleDependencies {
  compile(
    job: JobEvaluationDraft,
    onProgress?: JobEvaluationRuleDraftProgress,
  ): Promise<JobEvaluationBlueprint>;
  load(input: {
    jobDescriptionId: string;
    organizationId: string;
  }): Promise<JobEvaluationDraft | null>;
  publishStoredPreview(input: PublishInput): Promise<PublishStoredResult>;
  saveManualPreview(
    input: GeneratePreviewInput &
      PreviewResult & {
        deductionRules: JobDescriptionDeductionRules;
        expectedBlueprintHash: string;
      },
  ): Promise<boolean>;
  savePreview(input: GeneratePreviewInput & PreviewResult): Promise<boolean>;
}

export class JobEvaluationLifecycleError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options?: ErrorOptions) {
    super(message, options);
    this.code = code;
    this.name = "JobEvaluationLifecycleError";
  }
}

function assertDraft(job: JobEvaluationDraft | null): asserts job is JobEvaluationDraft {
  if (!job) {
    throw new JobEvaluationLifecycleError("JOB_NOT_FOUND", "岗位不存在。");
  }
  if (job.evaluationMode !== "structured") {
    throw new JobEvaluationLifecycleError(
      "JOB_EVALUATION_MODE_IMMUTABLE",
      "旧岗位不能切换到新版评估流程。",
    );
  }
  if (job.lifecycleStatus !== "draft") {
    throw new JobEvaluationLifecycleError(
      "JOB_ALREADY_PUBLISHED",
      "岗位已发布，不能重新生成评分规则。",
    );
  }
}

function manualSource(path: string, sourceText: string) {
  return {
    sourceRef: { kind: "manual" as const, path },
    sourceText,
  };
}

function sameExperienceRequirement(
  left: NonNullable<JobEvaluationBlueprint["requiredRelevantExperience"]>,
  right: NonNullable<JobEvaluationBlueprint["requiredRelevantExperience"]>,
): boolean {
  return (
    left.relevanceScope === right.relevanceScope &&
    left.scopeDescription === right.scopeDescription &&
    left.sourceText === right.sourceText &&
    left.years === right.years
  );
}

function applyManualExperienceRequirement(
  blueprint: JobEvaluationBlueprint,
  draft: JobEvaluationRuleDraft,
): Pick<JobEvaluationBlueprint, "requiredRelevantExperience" | "requiredRelevantExperiences"> {
  const previousPrimary = blueprint.requiredRelevantExperience;
  const existing =
    blueprint.requiredRelevantExperiences ??
    (previousPrimary
      ? [
          {
            ...previousPrimary,
            requirementId: `experience_${computeJobEvaluationPayloadHash({
              relevanceScope: previousPrimary.relevanceScope,
              scopeDescription: previousPrimary.scopeDescription,
              years: previousPrimary.years,
            }).slice(0, 20)}`,
          },
        ]
      : []);
  const nextPrimary = draft.requiredRelevantExperience
    ? {
        ...draft.requiredRelevantExperience,
        ...manualSource(
          "requiredRelevantExperience",
          `${draft.requiredRelevantExperience.years} 年 · ${draft.requiredRelevantExperience.scopeDescription}`,
        ),
      }
    : null;
  const replacement = nextPrimary
    ? {
        ...nextPrimary,
        requirementId: `experience_${computeJobEvaluationPayloadHash({
          relevanceScope: nextPrimary.relevanceScope,
          scopeDescription: nextPrimary.scopeDescription,
          years: nextPrimary.years,
        }).slice(0, 20)}`,
      }
    : null;
  let replaced = false;
  const requiredRelevantExperiences = existing.flatMap((requirement) => {
    if (previousPrimary && sameExperienceRequirement(requirement, previousPrimary)) {
      replaced = true;
      return replacement ? [replacement] : [];
    }
    return [requirement];
  });
  if (replacement && !replaced) {
    requiredRelevantExperiences.unshift(replacement);
  }
  return { requiredRelevantExperience: nextPrimary, requiredRelevantExperiences };
}

export function applyManualRuleDraft(
  blueprint: JobEvaluationBlueprint,
  input: JobEvaluationRuleDraft,
): JobEvaluationBlueprint {
  const draft = jobEvaluationRuleDraftSchema.parse(input);
  // SAFETY: draft has passed jobEvaluationRuleDraftSchema; every key/value pair is derived
  // from its dimensionExpectations, with manual provenance added to each expectation.
  const dimensionExpectations = Object.fromEntries(
    Object.entries(draft.dimensionExpectations).map(([dimension, expectations]) => [
      dimension,
      expectations.map((expectation, index) => ({
        expectation,
        ...manualSource(`dimensionExpectations.${dimension}.${index}`, expectation),
      })),
    ]),
  ) as JobEvaluationBlueprint["dimensionExpectations"];
  const experienceRequirements = applyManualExperienceRequirement(blueprint, draft);
  return jobEvaluationBlueprintSchema.parse({
    ...blueprint,
    auxiliarySkills: draft.auxiliarySkills.map((skill, index) => ({
      normalizedSkill: skill,
      ...manualSource(`auxiliarySkills.${index}`, skill),
    })),
    coreSkills: draft.coreSkills.map((skill, index) => ({
      normalizedSkill: skill,
      ...manualSource(`coreSkills.${index}`, skill),
    })),
    dimensionExpectations,
    educationExpectation: draft.educationExpectation
      ? {
          ...draft.educationExpectation,
          ...manualSource(
            "educationExpectation",
            [draft.educationExpectation.degreeLevel, draft.educationExpectation.majorExpectation]
              .filter(Boolean)
              .join(" · ") || "未限定学历背景",
          ),
        }
      : null,
    ...experienceRequirements,
  });
}

export function createJobEvaluationLifecycle(dependencies: LifecycleDependencies) {
  return {
    async generatePreview(
      input: GeneratePreviewInput,
      options?: { onProgress?: JobEvaluationRuleDraftProgress },
    ): Promise<PreviewResult> {
      const job = await dependencies.load(input);
      assertDraft(job);
      const inputHash = computeJobEvaluationDraftInputHash(job);
      const blueprint = jobEvaluationBlueprintSchema.parse(
        await dependencies.compile(job, options?.onProgress),
      );
      const blueprintHash = computeJobEvaluationPayloadHash(blueprint);
      const { generatedAt } = blueprint.compiler;
      const saved = await dependencies.savePreview({
        ...input,
        blueprint,
        blueprintHash,
        generatedAt,
        inputHash,
      });
      if (!saved) {
        throw new JobEvaluationLifecycleError(
          "JOB_BLUEPRINT_PREVIEW_STALE",
          "岗位配置已变化，请重新生成评分规则。",
        );
      }
      return { blueprint, blueprintHash, generatedAt, inputHash };
    },

    async publish(input: PublishInput) {
      const result = await dependencies.publishStoredPreview(input);
      if (result.status === "not_found") {
        throw new JobEvaluationLifecycleError("JOB_NOT_FOUND", "岗位不存在。");
      }
      if (result.status === "already_published") {
        throw new JobEvaluationLifecycleError("JOB_ALREADY_PUBLISHED", "岗位已经发布。");
      }
      if (result.status === "stale") {
        throw new JobEvaluationLifecycleError(
          "JOB_BLUEPRINT_PREVIEW_STALE",
          "评分规则已失效，请重新生成并确认。",
        );
      }
      if (result.status !== "published") {
        throw new JobEvaluationLifecycleError("JOB_BLUEPRINT_PREVIEW_STALE", "评分规则状态无效。");
      }
      return result.job;
    },

    async saveRuleDraft(input: SaveRuleDraftInput): Promise<PreviewResult> {
      const job = await dependencies.load(input);
      assertDraft(job);
      if (
        !job.evaluationBlueprintPreview ||
        job.evaluationBlueprintPreviewHash !== input.expectedBlueprintHash
      ) {
        throw new JobEvaluationLifecycleError(
          "JOB_BLUEPRINT_PREVIEW_STALE",
          "评分规则已变化，请刷新后重试。",
        );
      }
      const inputHash = computeJobEvaluationDraftInputHash({
        ...job,
        structuredConfig: {
          ...job.structuredConfig,
          deductionRules: input.deductionRules,
        },
      });
      const blueprint = applyManualRuleDraft(job.evaluationBlueprintPreview, input.ruleDraft);
      const blueprintHash = computeJobEvaluationPayloadHash(blueprint);
      const { generatedAt } = blueprint.compiler;
      const saved = await dependencies.saveManualPreview({
        ...input,
        blueprint,
        blueprintHash,
        generatedAt,
        inputHash,
      });
      if (!saved) {
        throw new JobEvaluationLifecycleError(
          "JOB_BLUEPRINT_PREVIEW_STALE",
          "岗位或评分规则已变化，请刷新后重试。",
        );
      }
      return { blueprint, blueprintHash, generatedAt, inputHash };
    },
  };
}

async function loadDefault(input: {
  jobDescriptionId: string;
  organizationId: string;
}): Promise<JobEvaluationDraft | null> {
  const [row] = await db
    .select({
      description: jobDescription.description,
      evaluationBlueprintPreview: jobDescription.evaluationBlueprintPreview,
      evaluationBlueprintPreviewHash: jobDescription.evaluationBlueprintPreviewHash,
      evaluationMode: jobDescription.evaluationMode,
      id: jobDescription.id,
      lifecycleStatus: jobDescription.lifecycleStatus,
      prompt: jobDescription.prompt,
      structuredConfig: jobDescription.structuredConfig,
    })
    .from(jobDescription)
    .where(
      and(
        eq(jobDescription.id, input.jobDescriptionId),
        eq(jobDescription.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  if (!row) {
    return null;
  }
  return {
    ...row,
    evaluationBlueprintPreview: row.evaluationBlueprintPreview
      ? jobEvaluationBlueprintSchema.parse(row.evaluationBlueprintPreview)
      : null,
    structuredConfig: parseStoredJobDescriptionStructuredConfig(row.structuredConfig),
  };
}

function saveManualPreviewDefault(
  input: GeneratePreviewInput &
    PreviewResult & {
      deductionRules: JobDescriptionDeductionRules;
      expectedBlueprintHash: string;
    },
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(jobDescription)
      .where(
        and(
          eq(jobDescription.id, input.jobDescriptionId),
          eq(jobDescription.organizationId, input.organizationId),
        ),
      )
      .limit(1)
      .for("update");
    if (
      !current ||
      current.evaluationMode !== "structured" ||
      current.lifecycleStatus !== "draft" ||
      current.evaluationBlueprintPreviewHash !== input.expectedBlueprintHash
    ) {
      return false;
    }
    const currentConfig = parseStoredJobDescriptionStructuredConfig(current.structuredConfig);
    if (
      computeJobEvaluationDraftInputHash({
        description: current.description,
        prompt: current.prompt,
        structuredConfig: currentConfig,
      }) !== current.evaluationBlueprintPreviewInputHash
    ) {
      return false;
    }
    const nextConfig = {
      ...currentConfig,
      deductionRules: input.deductionRules,
    };
    if (
      computeJobEvaluationDraftInputHash({
        description: current.description,
        prompt: current.prompt,
        structuredConfig: nextConfig,
      }) !== input.inputHash
    ) {
      return false;
    }
    await tx
      .update(jobDescription)
      .set({
        evaluationBlueprintPreview: input.blueprint,
        evaluationBlueprintPreviewHash: input.blueprintHash,
        evaluationBlueprintPreviewInputHash: input.inputHash,
        structuredConfig: nextConfig,
        updatedAt: new Date(),
      })
      .where(eq(jobDescription.id, current.id));
    return true;
  });
}

export interface CompileJobEvaluationDraftDependencies {
  generate: typeof generateEvaluationBlueprintCandidate;
  getModelId(): string;
}

const defaultCompileDependencies: CompileJobEvaluationDraftDependencies = {
  generate: generateEvaluationBlueprintCandidate,
  getModelId: () => getMastraModelIdentifier(mastraModels.structuredModel),
};

export async function compileJobEvaluationDraft(
  job: Pick<JobEvaluationDraft, "description" | "id" | "prompt" | "structuredConfig">,
  onProgress?: JobEvaluationRuleDraftProgress,
  dependencies: CompileJobEvaluationDraftDependencies = defaultCompileDependencies,
): Promise<JobEvaluationBlueprint> {
  const startedAt = Date.now();
  const generatedAt = new Date().toISOString();
  const modelId = dependencies.getModelId();
  let modelOutput;
  try {
    modelOutput = await dependencies.generate(job, onProgress);
  } catch (error) {
    console.error("[job-evaluation-blueprint] generation failed", {
      durationMs: Date.now() - startedAt,
      error,
      jobDescriptionId: job.id,
      modelId,
      promptVersion: JOB_EVALUATION_BLUEPRINT_COMPILER_PROMPT_VERSION,
    });
    throw new JobEvaluationLifecycleError(
      "JOB_BLUEPRINT_GENERATION_FAILED",
      "AI 评估蓝图生成暂时不可用，请稍后重试。",
      { cause: error },
    );
  }
  return compileEvaluationBlueprint(
    { ...job, modelOutput },
    {
      generatedAt,
      modelId,
      promptVersion: JOB_EVALUATION_BLUEPRINT_COMPILER_PROMPT_VERSION,
    },
  );
}

function savePreviewDefault(input: GeneratePreviewInput & PreviewResult): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(jobDescription)
      .where(
        and(
          eq(jobDescription.id, input.jobDescriptionId),
          eq(jobDescription.organizationId, input.organizationId),
        ),
      )
      .limit(1)
      .for("update");
    if (
      !current ||
      current.evaluationMode !== "structured" ||
      current.lifecycleStatus !== "draft"
    ) {
      return false;
    }
    const currentConfig = parseStoredJobDescriptionStructuredConfig(current.structuredConfig);
    if (
      computeJobEvaluationDraftInputHash({
        description: current.description,
        prompt: current.prompt,
        structuredConfig: currentConfig,
      }) !== input.inputHash
    ) {
      return false;
    }
    await tx
      .update(jobDescription)
      .set({
        evaluationBlueprintPreview: input.blueprint,
        evaluationBlueprintPreviewGeneratedAt: new Date(input.generatedAt),
        evaluationBlueprintPreviewHash: input.blueprintHash,
        evaluationBlueprintPreviewInputHash: input.inputHash,
        updatedAt: new Date(),
      })
      .where(eq(jobDescription.id, current.id));
    return true;
  });
}

function publishStoredPreviewDefault(input: PublishInput): Promise<PublishStoredResult> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(jobDescription)
      .where(
        and(
          eq(jobDescription.id, input.jobDescriptionId),
          eq(jobDescription.organizationId, input.organizationId),
        ),
      )
      .limit(1)
      .for("update");
    if (!current) {
      return { status: "not_found" };
    }
    if (current.lifecycleStatus === "published") {
      return { status: "already_published" };
    }
    const config = parseStoredJobDescriptionStructuredConfig(current.structuredConfig);
    const currentInputHash = computeJobEvaluationDraftInputHash({
      description: current.description,
      prompt: current.prompt,
      structuredConfig: config,
    });
    if (
      current.evaluationMode !== "structured" ||
      !current.evaluationBlueprintPreview ||
      current.evaluationBlueprintPreviewHash !== input.confirmedBlueprintHash ||
      current.evaluationBlueprintPreviewInputHash !== currentInputHash
    ) {
      return { status: "stale" };
    }
    const blueprint = jobEvaluationBlueprintSchema.parse(current.evaluationBlueprintPreview);
    const now = new Date();
    const [published] = await tx
      .update(jobDescription)
      .set({
        deductionRuleSetVersion: STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION,
        evaluationBlueprint: blueprint,
        evaluationBlueprintHash: current.evaluationBlueprintPreviewHash,
        evaluationBlueprintPreview: null,
        evaluationBlueprintPreviewGeneratedAt: null,
        evaluationBlueprintPreviewHash: null,
        evaluationBlueprintPreviewInputHash: null,
        evaluationBlueprintSchemaVersion: JOB_EVALUATION_BLUEPRINT_SCHEMA_VERSION,
        lifecycleStatus: "published",
        publishedAt: now,
        updatedAt: now,
      })
      .where(eq(jobDescription.id, current.id))
      .returning();
    if (!published) {
      return { status: "stale" };
    }
    return { job: published, status: "published" };
  });
}

const defaultLifecycle = createJobEvaluationLifecycle({
  compile: compileJobEvaluationDraft,
  load: loadDefault,
  publishStoredPreview: publishStoredPreviewDefault,
  saveManualPreview: saveManualPreviewDefault,
  savePreview: savePreviewDefault,
});

export const generateStructuredJobBlueprintPreview = defaultLifecycle.generatePreview;
export const publishStructuredJob = defaultLifecycle.publish;
export const saveStructuredJobRuleDraft = defaultLifecycle.saveRuleDraft;
