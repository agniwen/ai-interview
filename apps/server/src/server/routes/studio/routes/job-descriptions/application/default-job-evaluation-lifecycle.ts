import {
  JOB_EVALUATION_BLUEPRINT_SCHEMA_VERSION,
  jobEvaluationBlueprintSchema,
} from "@app/db-schema/job-description-evaluation";
import type { JobDescriptionDeductionRules } from "@app/db-schema/job-description-structured-config";
import { parseStoredJobDescriptionStructuredConfig } from "@app/db-schema/job-description-structured-config";
import { jobDescription } from "@app/db-schema/schema";
import { STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION } from "@app/shared/structured-resume-scoring";
import { and, eq } from "drizzle-orm";
import { db } from "../../../../../../lib/server/db/index";
import { computeJobEvaluationDraftInputHash } from "../../../../../../lib/server/job-evaluation-hash";
import { getMastraModelIdentifier, mastraModels } from "@app/ai-runtime/models";
import { generateEvaluationBlueprintCandidate } from "../utils/evaluation-blueprint-compiler";
import type { JobEvaluationRuleDraftProgress } from "../utils/evaluation-blueprint-compiler";
import {
  compileJobEvaluationDraft,
  createJobEvaluationLifecycle,
} from "./job-evaluation-lifecycle";
import type {
  GeneratePreviewInput,
  JobEvaluationDraft,
  PreviewResult,
  PublishInput,
  PublishStoredResult,
} from "./job-evaluation-lifecycle";

type PublishedJob = typeof jobDescription.$inferSelect;

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

function publishStoredPreviewDefault(
  input: PublishInput,
): Promise<PublishStoredResult<PublishedJob>> {
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

export function compileDefaultJobEvaluationDraft(
  job: Pick<JobEvaluationDraft, "description" | "id" | "prompt" | "structuredConfig">,
  onProgress?: JobEvaluationRuleDraftProgress,
) {
  return compileJobEvaluationDraft(job, onProgress, {
    generate: generateEvaluationBlueprintCandidate,
    getModelId: () => getMastraModelIdentifier(mastraModels.structuredModel),
  });
}

const defaultLifecycle = createJobEvaluationLifecycle<PublishedJob>({
  compile: compileDefaultJobEvaluationDraft,
  load: loadDefault,
  publishStoredPreview: publishStoredPreviewDefault,
  saveManualPreview: saveManualPreviewDefault,
  savePreview: savePreviewDefault,
});

export const generateStructuredJobBlueprintPreview = defaultLifecycle.generatePreview;
export const publishStructuredJob = defaultLifecycle.publish;
export const saveStructuredJobRuleDraft = defaultLifecycle.saveRuleDraft;
