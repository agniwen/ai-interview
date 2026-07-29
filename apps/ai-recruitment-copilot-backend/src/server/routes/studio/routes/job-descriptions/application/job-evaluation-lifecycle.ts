import type { JobEvaluationBlueprint } from "@arc/db-schema/job-description-evaluation";
import {
  JOB_EVALUATION_BLUEPRINT_SCHEMA_VERSION,
  jobEvaluationBlueprintSchema,
} from "@arc/db-schema/job-description-evaluation";
import type { JobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import { jobDescriptionStructuredConfigSchema } from "@arc/db-schema/job-description-structured-config";
import { STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION } from "@arc/shared/structured-resume-scoring";
import { and, eq } from "drizzle-orm";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  computeJobEvaluationDraftInputHash,
  computeJobEvaluationPayloadHash,
} from "@arc/ai-recruitment-copilot-backend/lib/server/job-evaluation-hash";
import { jobDescription } from "@arc/db-schema/schema";
import {
  compileEvaluationBlueprint,
  generateEvaluationBlueprintCandidate,
  JOB_EVALUATION_BLUEPRINT_COMPILER_PROMPT_VERSION,
} from "../utils/evaluation-blueprint-compiler";

interface JobEvaluationDraft {
  description: string | null;
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
  compile(job: JobEvaluationDraft): Promise<JobEvaluationBlueprint>;
  load(input: {
    jobDescriptionId: string;
    organizationId: string;
  }): Promise<JobEvaluationDraft | null>;
  publishStoredPreview(input: PublishInput): Promise<PublishStoredResult>;
  savePreview(input: GeneratePreviewInput & PreviewResult): Promise<boolean>;
}

export class JobEvaluationLifecycleError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
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
      "岗位已发布，不能重新生成评估蓝图。",
    );
  }
}

export function createJobEvaluationLifecycle(dependencies: LifecycleDependencies) {
  return {
    async generatePreview(input: GeneratePreviewInput): Promise<PreviewResult> {
      const job = await dependencies.load(input);
      assertDraft(job);
      const inputHash = computeJobEvaluationDraftInputHash(job);
      const blueprint = jobEvaluationBlueprintSchema.parse(await dependencies.compile(job));
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
          "岗位配置已变化，请重新生成评估蓝图。",
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
          "评估蓝图已失效，请重新生成并确认。",
        );
      }
      if (result.status !== "published") {
        throw new JobEvaluationLifecycleError("JOB_BLUEPRINT_PREVIEW_STALE", "评估蓝图状态无效。");
      }
      return result.job;
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
    structuredConfig: jobDescriptionStructuredConfigSchema.parse(row.structuredConfig),
  };
}

async function compileDefault(job: JobEvaluationDraft): Promise<JobEvaluationBlueprint> {
  const generatedAt = new Date().toISOString();
  const modelOutput = await generateEvaluationBlueprintCandidate(job);
  return compileEvaluationBlueprint(
    { ...job, modelOutput },
    {
      generatedAt,
      modelId: "configured-structured-model",
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
    const currentConfig = jobDescriptionStructuredConfigSchema.parse(current.structuredConfig);
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
    const config = jobDescriptionStructuredConfigSchema.parse(current.structuredConfig);
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
  compile: compileDefault,
  load: loadDefault,
  publishStoredPreview: publishStoredPreviewDefault,
  savePreview: savePreviewDefault,
});

export const generateStructuredJobBlueprintPreview = defaultLifecycle.generatePreview;
export const publishStructuredJob = defaultLifecycle.publish;
