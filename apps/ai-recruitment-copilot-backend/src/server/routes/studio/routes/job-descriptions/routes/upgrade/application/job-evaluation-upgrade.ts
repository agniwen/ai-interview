import type {
  JobEvaluationBlueprint,
  JobEvaluationRuleDraft,
} from "@arc/db-schema/job-description-evaluation";
import { jobEvaluationBlueprintSchema } from "@arc/db-schema/job-description-evaluation";
import type {
  JobDescriptionDeductionRules,
  JobDescriptionStructuredConfig,
} from "@arc/db-schema/job-description-structured-config";
import {
  computeJobEvaluationDraftInputHash,
  computeJobEvaluationPayloadHash,
} from "@arc/ai-recruitment-copilot-backend/lib/server/job-evaluation-hash";
import { applyManualRuleDraft } from "../../../application/job-evaluation-lifecycle";

export interface JobEvaluationUpgradeDraft {
  blueprintPreview: JobEvaluationBlueprint | null;
  blueprintPreviewGeneratedAt: Date | null;
  blueprintPreviewHash: string | null;
  blueprintPreviewInputHash: string | null;
  createdAt: Date;
  createdBy: string | null;
  id: string;
  jobDescriptionId: string;
  organizationId: string;
  prompt: string;
  structuredConfig: JobDescriptionStructuredConfig;
  updatedAt: Date;
  updatedBy: string | null;
  version: number;
}

export interface JobEvaluationUpgradeKey {
  actorId: string;
  jobDescriptionId: string;
  organizationId: string;
}

export type JobEvaluationUpgradeErrorCode =
  | "JOB_ALREADY_UPGRADED"
  | "JOB_NOT_FOUND"
  | "JOB_NOT_LEGACY"
  | "JOB_NOT_PUBLISHED"
  | "UPGRADE_DRAFT_NOT_FOUND"
  | "UPGRADE_DRAFT_VERSION_CONFLICT"
  | "UPGRADE_INPUT_HASH_MISMATCH"
  | "UPGRADE_PREVIEW_STALE"
  | "UPGRADE_PUBLISH_CONFLICT";

type RepositoryFailure =
  | "already_upgraded"
  | "not_found"
  | "not_legacy"
  | "not_published"
  | "stale"
  | "version_conflict";

interface JobEvaluationUpgradeDependencies {
  compile(input: {
    description: null;
    prompt: string;
    structuredConfig: JobDescriptionStructuredConfig;
  }): Promise<JobEvaluationBlueprint>;
  createDraft(
    input: JobEvaluationUpgradeKey,
  ): Promise<
    | { draft: JobEvaluationUpgradeDraft; status: "created" | "existing" }
    | { status: RepositoryFailure }
  >;
  discardDraft(
    input: JobEvaluationUpgradeKey & { expectedVersion: number },
  ): Promise<"discarded" | RepositoryFailure>;
  getDraft(
    input: Omit<JobEvaluationUpgradeKey, "actorId">,
  ): Promise<JobEvaluationUpgradeDraft | null>;
  publishDraft(
    input: JobEvaluationUpgradeKey & {
      confirmedBlueprintHash: string;
      expectedVersion: number;
    },
  ): Promise<
    | { invalidatedLegacyAttemptCount: number; jobId: string; status: "published" }
    | { status: RepositoryFailure }
  >;
  saveManualPreview(
    input: JobEvaluationUpgradeKey & {
      blueprint: JobEvaluationBlueprint;
      blueprintHash: string;
      deductionRules: JobDescriptionDeductionRules;
      expectedBlueprintHash: string;
      expectedVersion: number;
      generatedAt: Date;
      inputHash: string;
    },
  ): Promise<JobEvaluationUpgradeDraft | null>;
  savePreview(
    input: JobEvaluationUpgradeKey & {
      blueprint: JobEvaluationBlueprint;
      blueprintHash: string;
      expectedVersion: number;
      generatedAt: Date;
      inputHash: string;
    },
  ): Promise<JobEvaluationUpgradeDraft | null>;
  updateDraft(
    input: JobEvaluationUpgradeKey & {
      expectedVersion: number;
      prompt: string;
      structuredConfig: JobDescriptionStructuredConfig;
    },
  ): Promise<JobEvaluationUpgradeDraft | null>;
}

export class JobEvaluationUpgradeError extends Error {
  readonly code: JobEvaluationUpgradeErrorCode;

  constructor(code: JobEvaluationUpgradeErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "JobEvaluationUpgradeError";
  }
}

function repositoryError(status: RepositoryFailure): JobEvaluationUpgradeError {
  const errors: Record<RepositoryFailure, [JobEvaluationUpgradeErrorCode, string]> = {
    already_upgraded: ["JOB_ALREADY_UPGRADED", "岗位已经升级为新版。"],
    not_found: ["JOB_NOT_FOUND", "岗位不存在。"],
    not_legacy: ["JOB_NOT_LEGACY", "只有老版本岗位可以创建升级草稿。"],
    not_published: ["JOB_NOT_PUBLISHED", "只有已发布岗位可以升级。"],
    stale: ["UPGRADE_PREVIEW_STALE", "升级预览已失效，请重新生成。"],
    version_conflict: ["UPGRADE_DRAFT_VERSION_CONFLICT", "升级草稿已被修改，请刷新后重试。"],
  };
  return new JobEvaluationUpgradeError(...errors[status]);
}

function assertVersion(draft: JobEvaluationUpgradeDraft, expectedVersion: number) {
  if (draft.version !== expectedVersion) {
    throw repositoryError("version_conflict");
  }
}

function draftInputHash(draft: JobEvaluationUpgradeDraft): string {
  return computeJobEvaluationDraftInputHash({
    description: null,
    prompt: draft.prompt,
    structuredConfig: draft.structuredConfig,
  });
}

export function createJobEvaluationUpgradeApplication(
  dependencies: JobEvaluationUpgradeDependencies,
) {
  return {
    async createDraft(input: JobEvaluationUpgradeKey) {
      const result = await dependencies.createDraft(input);
      if (!("draft" in result)) {
        throw repositoryError(result.status);
      }
      return result.draft;
    },

    async discardDraft(input: JobEvaluationUpgradeKey & { expectedVersion: number }) {
      const result = await dependencies.discardDraft(input);
      if (result !== "discarded") {
        throw repositoryError(result);
      }
    },

    async generatePreview(input: JobEvaluationUpgradeKey & { expectedVersion: number }) {
      const draft = await dependencies.getDraft(input);
      if (!draft) {
        throw new JobEvaluationUpgradeError("UPGRADE_DRAFT_NOT_FOUND", "升级草稿不存在。");
      }
      assertVersion(draft, input.expectedVersion);
      const blueprint = jobEvaluationBlueprintSchema.parse(
        await dependencies.compile({
          description: null,
          prompt: draft.prompt,
          structuredConfig: draft.structuredConfig,
        }),
      );
      const saved = await dependencies.savePreview({
        ...input,
        blueprint,
        blueprintHash: computeJobEvaluationPayloadHash(blueprint),
        generatedAt: new Date(blueprint.compiler.generatedAt),
        inputHash: draftInputHash(draft),
      });
      if (!saved) {
        throw repositoryError("version_conflict");
      }
      return saved;
    },

    async getDraft(input: Omit<JobEvaluationUpgradeKey, "actorId">) {
      const draft = await dependencies.getDraft(input);
      if (!draft) {
        throw new JobEvaluationUpgradeError("UPGRADE_DRAFT_NOT_FOUND", "升级草稿不存在。");
      }
      return draft;
    },

    async publish(
      input: JobEvaluationUpgradeKey & {
        confirmedBlueprintHash: string;
        expectedVersion: number;
      },
    ) {
      const result = await dependencies.publishDraft(input);
      if (result.status !== "published") {
        throw repositoryError(result.status);
      }
      return result;
    },

    async saveRuleDraft(
      input: JobEvaluationUpgradeKey & {
        deductionRules: JobDescriptionDeductionRules;
        expectedBlueprintHash: string;
        expectedVersion: number;
        ruleDraft: JobEvaluationRuleDraft;
      },
    ) {
      const draft = await dependencies.getDraft(input);
      if (!draft) {
        throw new JobEvaluationUpgradeError("UPGRADE_DRAFT_NOT_FOUND", "升级草稿不存在。");
      }
      assertVersion(draft, input.expectedVersion);
      if (
        !draft.blueprintPreview ||
        draft.blueprintPreviewHash !== input.expectedBlueprintHash ||
        draft.blueprintPreviewInputHash !== draftInputHash(draft)
      ) {
        throw new JobEvaluationUpgradeError("UPGRADE_PREVIEW_STALE", "升级预览已失效。");
      }
      const nextConfig = { ...draft.structuredConfig, deductionRules: input.deductionRules };
      const blueprint = applyManualRuleDraft(draft.blueprintPreview, input.ruleDraft);
      const saved = await dependencies.saveManualPreview({
        ...input,
        blueprint,
        blueprintHash: computeJobEvaluationPayloadHash(blueprint),
        generatedAt: new Date(blueprint.compiler.generatedAt),
        inputHash: computeJobEvaluationDraftInputHash({
          description: null,
          prompt: draft.prompt,
          structuredConfig: nextConfig,
        }),
      });
      if (!saved) {
        throw repositoryError("version_conflict");
      }
      return saved;
    },

    async updateDraft(
      input: JobEvaluationUpgradeKey & {
        expectedVersion: number;
        prompt: string;
        structuredConfig: JobDescriptionStructuredConfig;
      },
    ) {
      const saved = await dependencies.updateDraft(input);
      if (!saved) {
        throw repositoryError("version_conflict");
      }
      return saved;
    },
  };
}
