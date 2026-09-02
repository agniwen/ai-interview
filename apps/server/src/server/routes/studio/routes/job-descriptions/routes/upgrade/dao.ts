import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@server/lib/server/db/index";
import {
  jobDescription,
  jobDescriptionEvaluationUpgradeAudit,
  jobDescriptionEvaluationUpgradeDraft,
  studioInterview,
} from "@app/db-schema/schema";
import {
  JOB_EVALUATION_BLUEPRINT_SCHEMA_VERSION,
  jobEvaluationBlueprintSchema,
} from "@app/db-schema/job-description-evaluation";
import {
  createDefaultJobDescriptionStructuredConfig,
  parseStoredJobDescriptionStructuredConfig,
} from "@app/db-schema/job-description-structured-config";
import { STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION } from "@app/shared/structured-resume-scoring";
import { computeJobEvaluationDraftInputHash } from "@server/lib/server/job-evaluation-hash";
import type {
  JobEvaluationUpgradeDraft,
  JobEvaluationUpgradeKey,
} from "./application/job-evaluation-upgrade";

function parseDraft(
  row: typeof jobDescriptionEvaluationUpgradeDraft.$inferSelect,
): JobEvaluationUpgradeDraft {
  return {
    ...row,
    blueprintPreview: row.blueprintPreview
      ? jobEvaluationBlueprintSchema.parse(row.blueprintPreview)
      : null,
    structuredConfig: parseStoredJobDescriptionStructuredConfig(row.structuredConfig),
  };
}

export async function getUpgradeDraft(input: {
  jobDescriptionId: string;
  organizationId: string;
}): Promise<JobEvaluationUpgradeDraft | null> {
  const [row] = await db
    .select()
    .from(jobDescriptionEvaluationUpgradeDraft)
    .where(
      and(
        eq(jobDescriptionEvaluationUpgradeDraft.jobDescriptionId, input.jobDescriptionId),
        eq(jobDescriptionEvaluationUpgradeDraft.organizationId, input.organizationId),
      ),
    )
    .limit(1);
  return row ? parseDraft(row) : null;
}

export function createUpgradeDraft(input: JobEvaluationUpgradeKey) {
  return db.transaction(async (tx) => {
    const [job] = await tx
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
    if (!job) {
      return { status: "not_found" as const };
    }
    if (job.evaluationMode !== "legacy") {
      return { status: "already_upgraded" as const };
    }
    if (job.lifecycleStatus !== "published") {
      return { status: "not_published" as const };
    }
    const [existing] = await tx
      .select()
      .from(jobDescriptionEvaluationUpgradeDraft)
      .where(eq(jobDescriptionEvaluationUpgradeDraft.jobDescriptionId, job.id))
      .limit(1);
    if (existing) {
      return { draft: parseDraft(existing), status: "existing" as const };
    }
    const now = new Date();
    const [created] = await tx
      .insert(jobDescriptionEvaluationUpgradeDraft)
      .values({
        createdAt: now,
        createdBy: input.actorId,
        id: crypto.randomUUID(),
        jobDescriptionId: job.id,
        organizationId: input.organizationId,
        prompt: job.prompt,
        structuredConfig: createDefaultJobDescriptionStructuredConfig(),
        updatedAt: now,
        updatedBy: input.actorId,
        version: 1,
      })
      .returning();
    if (!created) {
      return { status: "version_conflict" as const };
    }
    return { draft: parseDraft(created), status: "created" as const };
  });
}

export function updateUpgradeDraft(
  input: JobEvaluationUpgradeKey & {
    expectedVersion: number;
    prompt: string;
    structuredConfig: JobEvaluationUpgradeDraft["structuredConfig"];
  },
): Promise<JobEvaluationUpgradeDraft | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(jobDescriptionEvaluationUpgradeDraft)
      .where(
        and(
          eq(jobDescriptionEvaluationUpgradeDraft.jobDescriptionId, input.jobDescriptionId),
          eq(jobDescriptionEvaluationUpgradeDraft.organizationId, input.organizationId),
        ),
      )
      .limit(1)
      .for("update");
    if (!current || current.version !== input.expectedVersion) {
      return null;
    }
    const currentConfig = parseStoredJobDescriptionStructuredConfig(current.structuredConfig);
    const changed =
      computeJobEvaluationDraftInputHash({
        description: null,
        prompt: current.prompt,
        structuredConfig: currentConfig,
      }) !==
      computeJobEvaluationDraftInputHash({
        description: null,
        prompt: input.prompt,
        structuredConfig: input.structuredConfig,
      });
    const resetPreviewFields = changed
      ? {
          blueprintPreview: null,
          blueprintPreviewGeneratedAt: null,
          blueprintPreviewHash: null,
          blueprintPreviewInputHash: null,
        }
      : {};
    const [updated] = await tx
      .update(jobDescriptionEvaluationUpgradeDraft)
      .set({
        ...resetPreviewFields,
        prompt: input.prompt.trim(),
        structuredConfig: input.structuredConfig,
        updatedAt: new Date(),
        updatedBy: input.actorId,
        version: current.version + 1,
      })
      .where(eq(jobDescriptionEvaluationUpgradeDraft.id, current.id))
      .returning();
    return updated ? parseDraft(updated) : null;
  });
}

export function saveUpgradePreview(
  input: JobEvaluationUpgradeKey & {
    blueprint: NonNullable<JobEvaluationUpgradeDraft["blueprintPreview"]>;
    blueprintHash: string;
    expectedVersion: number;
    generatedAt: Date;
    inputHash: string;
  },
): Promise<JobEvaluationUpgradeDraft | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(jobDescriptionEvaluationUpgradeDraft)
      .where(
        and(
          eq(jobDescriptionEvaluationUpgradeDraft.jobDescriptionId, input.jobDescriptionId),
          eq(jobDescriptionEvaluationUpgradeDraft.organizationId, input.organizationId),
        ),
      )
      .limit(1)
      .for("update");
    if (!current || current.version !== input.expectedVersion) {
      return null;
    }
    const config = parseStoredJobDescriptionStructuredConfig(current.structuredConfig);
    const currentInputHash = computeJobEvaluationDraftInputHash({
      description: null,
      prompt: current.prompt,
      structuredConfig: config,
    });
    if (currentInputHash !== input.inputHash) {
      return null;
    }
    const [updated] = await tx
      .update(jobDescriptionEvaluationUpgradeDraft)
      .set({
        blueprintPreview: input.blueprint,
        blueprintPreviewGeneratedAt: input.generatedAt,
        blueprintPreviewHash: input.blueprintHash,
        blueprintPreviewInputHash: input.inputHash,
        updatedAt: new Date(),
        updatedBy: input.actorId,
        version: current.version + 1,
      })
      .where(eq(jobDescriptionEvaluationUpgradeDraft.id, current.id))
      .returning();
    return updated ? parseDraft(updated) : null;
  });
}

export function saveUpgradeManualPreview(
  input: Parameters<typeof saveUpgradePreview>[0] & {
    deductionRules: JobEvaluationUpgradeDraft["structuredConfig"]["deductionRules"];
    expectedBlueprintHash: string;
  },
): Promise<JobEvaluationUpgradeDraft | null> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(jobDescriptionEvaluationUpgradeDraft)
      .where(
        and(
          eq(jobDescriptionEvaluationUpgradeDraft.jobDescriptionId, input.jobDescriptionId),
          eq(jobDescriptionEvaluationUpgradeDraft.organizationId, input.organizationId),
        ),
      )
      .limit(1)
      .for("update");
    if (
      !current ||
      current.version !== input.expectedVersion ||
      current.blueprintPreviewHash !== input.expectedBlueprintHash
    ) {
      return null;
    }
    const currentConfig = parseStoredJobDescriptionStructuredConfig(current.structuredConfig);
    const nextConfig = { ...currentConfig, deductionRules: input.deductionRules };
    if (
      computeJobEvaluationDraftInputHash({
        description: null,
        prompt: current.prompt,
        structuredConfig: nextConfig,
      }) !== input.inputHash
    ) {
      return null;
    }
    const [updated] = await tx
      .update(jobDescriptionEvaluationUpgradeDraft)
      .set({
        blueprintPreview: input.blueprint,
        blueprintPreviewGeneratedAt: input.generatedAt,
        blueprintPreviewHash: input.blueprintHash,
        blueprintPreviewInputHash: input.inputHash,
        structuredConfig: nextConfig,
        updatedAt: new Date(),
        updatedBy: input.actorId,
        version: current.version + 1,
      })
      .where(eq(jobDescriptionEvaluationUpgradeDraft.id, current.id))
      .returning();
    return updated ? parseDraft(updated) : null;
  });
}

export function discardUpgradeDraft(input: JobEvaluationUpgradeKey & { expectedVersion: number }) {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        id: jobDescriptionEvaluationUpgradeDraft.id,
        version: jobDescriptionEvaluationUpgradeDraft.version,
      })
      .from(jobDescriptionEvaluationUpgradeDraft)
      .where(
        and(
          eq(jobDescriptionEvaluationUpgradeDraft.jobDescriptionId, input.jobDescriptionId),
          eq(jobDescriptionEvaluationUpgradeDraft.organizationId, input.organizationId),
        ),
      )
      .limit(1)
      .for("update");
    if (!current) {
      return "not_found" as const;
    }
    if (current.version !== input.expectedVersion) {
      return "version_conflict" as const;
    }
    await tx
      .delete(jobDescriptionEvaluationUpgradeDraft)
      .where(eq(jobDescriptionEvaluationUpgradeDraft.id, current.id));
    return "discarded" as const;
  });
}

export function publishUpgradeDraft(
  input: JobEvaluationUpgradeKey & {
    confirmedBlueprintHash: string;
    expectedVersion: number;
  },
) {
  return db.transaction(async (tx) => {
    const [job] = await tx
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
    if (!job) {
      return { status: "not_found" as const };
    }
    if (job.evaluationMode !== "legacy") {
      return { status: "already_upgraded" as const };
    }
    if (job.lifecycleStatus !== "published") {
      return { status: "not_published" as const };
    }
    const [draft] = await tx
      .select()
      .from(jobDescriptionEvaluationUpgradeDraft)
      .where(
        and(
          eq(jobDescriptionEvaluationUpgradeDraft.jobDescriptionId, job.id),
          eq(jobDescriptionEvaluationUpgradeDraft.organizationId, input.organizationId),
        ),
      )
      .limit(1)
      .for("update");
    if (!draft) {
      return { status: "not_found" as const };
    }
    if (draft.version !== input.expectedVersion) {
      return { status: "version_conflict" as const };
    }
    const config = parseStoredJobDescriptionStructuredConfig(draft.structuredConfig);
    const inputHash = computeJobEvaluationDraftInputHash({
      description: null,
      prompt: draft.prompt,
      structuredConfig: config,
    });
    if (
      !draft.blueprintPreview ||
      draft.blueprintPreviewHash !== input.confirmedBlueprintHash ||
      draft.blueprintPreviewInputHash !== inputHash
    ) {
      return { status: "stale" as const };
    }
    const blueprint = jobEvaluationBlueprintSchema.parse(draft.blueprintPreview);
    const now = new Date();
    await tx.insert(jobDescriptionEvaluationUpgradeAudit).values({
      blueprint,
      blueprintHash: draft.blueprintPreviewHash,
      blueprintSchemaVersion: JOB_EVALUATION_BLUEPRINT_SCHEMA_VERSION,
      createdAt: now,
      deductionRuleSetVersion: STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION,
      draftVersion: draft.version,
      id: crypto.randomUUID(),
      jobDescriptionId: job.id,
      legacySnapshot: {
        description: job.description,
        evaluationMode: job.evaluationMode,
        prompt: job.prompt,
        resumeScreeningPolicy: job.resumeScreeningPolicy,
        resumeScreeningPolicyHash: job.resumeScreeningPolicyHash,
        resumeScreeningPolicyVersion: job.resumeScreeningPolicyVersion,
      },
      organizationId: input.organizationId,
      prompt: draft.prompt,
      structuredConfig: config,
      upgradedBy: input.actorId,
    });
    await tx
      .update(jobDescription)
      .set({
        deductionRuleSetVersion: STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION,
        description: null,
        evaluationBlueprint: blueprint,
        evaluationBlueprintHash: draft.blueprintPreviewHash,
        evaluationBlueprintPreview: null,
        evaluationBlueprintPreviewGeneratedAt: null,
        evaluationBlueprintPreviewHash: null,
        evaluationBlueprintPreviewInputHash: null,
        evaluationBlueprintSchemaVersion: JOB_EVALUATION_BLUEPRINT_SCHEMA_VERSION,
        evaluationMode: "structured",
        evaluationUpgradedAt: now,
        evaluationUpgradedBy: input.actorId,
        prompt: draft.prompt,
        structuredConfig: config,
        updatedAt: now,
      })
      .where(eq(jobDescription.id, job.id));
    const invalidatedAttempts = await tx
      .update(studioInterview)
      .set({
        resumeEvaluationAttemptMode: null,
        resumeReviewError: null,
        resumeReviewQueuedAt: null,
        resumeReviewRunId: null,
        resumeReviewStatus: sql`case
          when ${studioInterview.resumeEvaluationArtifactMode} is not null then 'ready'
          else 'idle'
        end`,
        resumeScreeningError: null,
        resumeScreeningStatus: sql`case
          when ${studioInterview.resumeEvaluationArtifactMode} is not null then 'ready'
          else 'idle'
        end`,
        updatedAt: now,
      })
      .where(
        and(
          eq(studioInterview.organizationId, input.organizationId),
          eq(studioInterview.jobDescriptionId, job.id),
          inArray(studioInterview.resumeReviewStatus, ["queued", "processing"]),
        ),
      )
      .returning({ id: studioInterview.id });
    await tx
      .delete(jobDescriptionEvaluationUpgradeDraft)
      .where(eq(jobDescriptionEvaluationUpgradeDraft.id, draft.id));
    return {
      invalidatedLegacyAttemptCount: invalidatedAttempts.length,
      jobId: job.id,
      status: "published" as const,
    };
  });
}
