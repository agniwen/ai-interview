/* oxlint-disable anti-slop/no-unknown-parameters, anti-slop/no-runtime-typeof, anti-slop/require-safety-comment-for-type-assertion -- Stable hashing recursively normalizes versioned JSON, while schema parsing and transactional reads establish assertion invariants before publication. */
import { createHash } from "node:crypto";
import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from "@nestjs/common";
import {
  jobEvaluationBlueprintSchema,
  toJobEvaluationRuleDraft,
} from "@arc/db-schema/job-description-evaluation";
import type {
  JobEvaluationBlueprint,
  JobEvaluationRuleDraft,
} from "@arc/db-schema/job-description-evaluation";
import { STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION } from "@arc/shared/structured-resume-scoring";
import {
  jobDescription,
  jobDescriptionEvaluationUpgradeAudit,
  jobDescriptionEvaluationUpgradeDraft,
} from "@arc/db-schema/schema";
import type {
  JobDescriptionDeductionRules,
  JobDescriptionStructuredConfig,
} from "@arc/db-schema/job-description-structured-config";
import { and, eq } from "drizzle-orm";
import { requestStructuredAiJson } from "../../../infrastructure/ai/structured-json-client.js";
import { ApiDatabaseUnitOfWork } from "../../../infrastructure/database/api-database-unit-of-work.js";
import { WORKSPACE_DATABASE_PORT } from "../../../infrastructure/workspace/workspace.ports.js";
import type { WorkspaceDatabasePort } from "../../../infrastructure/workspace/workspace.ports.js";
import { CANDIDATE_EVALUATION_COMMANDS } from "../../candidate-lifecycle/public.js";
import type { CandidateEvaluationCommands } from "../../candidate-lifecycle/public.js";
import { JobDescriptionService } from "./job-description.service.js";

function stable(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stable).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .toSorted(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}
function hash(value: unknown) {
  return createHash("sha256").update(stable(value)).digest("hex");
}
function serialize<
  T extends { blueprintPreviewGeneratedAt: Date | null; createdAt: Date; updatedAt: Date },
>(draft: T) {
  return {
    ...draft,
    blueprintPreviewGeneratedAt: draft.blueprintPreviewGeneratedAt?.toISOString() ?? null,
    createdAt: draft.createdAt.toISOString(),
    updatedAt: draft.updatedAt.toISOString(),
  };
}
function groupId(type: string, index: number) {
  return `manual-${type}-${index + 1}`;
}
function ruleDraftBlueprint(
  current: JobEvaluationBlueprint,
  ruleDraft: JobEvaluationRuleDraft,
  config: JobDescriptionStructuredConfig,
): JobEvaluationBlueprint {
  const groupBySkill = new Map<string, { id: string; mode: "all" | "any" }>();
  for (const [index, group] of ruleDraft.skillRequirementGroups.entries()) {
    for (const skill of group.skills) {
      groupBySkill.set(skill.normalize("NFKC").toLowerCase(), {
        id: groupId(group.expectationType, index),
        mode: group.satisfactionMode,
      });
    }
  }
  const skills = (items: string[], type: "auxiliary" | "core") =>
    items.map((skill, index) => {
      const group = groupBySkill.get(skill.normalize("NFKC").toLowerCase()) ?? {
        id: groupId(type, index),
        mode: "all" as const,
      };
      return {
        normalizedSkill: skill,
        requirementGroupId: group.id,
        satisfactionMode: group.mode,
        sourceRef: { kind: "manual" as const, path: `${type}Skills.${index}` },
        sourceText: skill,
      };
    });
  const dimensions = Object.fromEntries(
    Object.entries(ruleDraft.dimensionExpectations).map(([dimension, values]) => [
      dimension,
      values.map((value, index) => ({
        expectation: value,
        sourceRef: { kind: "manual" as const, path: `dimensionExpectations.${dimension}.${index}` },
        sourceText: value,
      })),
    ]),
  ) as JobEvaluationBlueprint["dimensionExpectations"];
  return jobEvaluationBlueprintSchema.parse({
    ...current,
    auxiliarySkills: skills(ruleDraft.auxiliarySkills, "auxiliary"),
    coreSkills: skills(ruleDraft.coreSkills, "core"),
    dimensionExpectations: dimensions,
    educationExpectation: ruleDraft.educationExpectation
      ? {
          ...ruleDraft.educationExpectation,
          sourceRef: { kind: "manual", path: "educationExpectation" },
          sourceText: [
            ruleDraft.educationExpectation.degreeLevel,
            ruleDraft.educationExpectation.majorExpectation,
          ]
            .filter(Boolean)
            .join(" "),
        }
      : null,
    exclusionConditions: config.exclusionConditions.map((condition) => ({
      ...condition,
      sourceText: condition.condition,
    })),
    priorityConditions: config.priorityConditions.map((condition) => ({
      ...condition,
      sourceText: condition.condition,
    })),
    requiredRelevantExperience: ruleDraft.requiredRelevantExperience
      ? {
          ...ruleDraft.requiredRelevantExperience,
          sourceRef: { kind: "manual", path: "requiredRelevantExperience" },
          sourceText: `${ruleDraft.requiredRelevantExperience.years} 年 ${ruleDraft.requiredRelevantExperience.scopeDescription}`,
        }
      : null,
  });
}

@Injectable()
export class JobEvaluationLifecycleService {
  constructor(
    @Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort,
    @Inject(JobDescriptionService) private readonly jobs: JobDescriptionService,
    @Inject(CANDIDATE_EVALUATION_COMMANDS)
    private readonly candidateEvaluations: CandidateEvaluationCommands,
    @Inject(ApiDatabaseUnitOfWork) private readonly unitOfWork: ApiDatabaseUnitOfWork,
  ) {}
  private async job(organizationId: string, id: string) {
    const rows = await this.database
      .select()
      .from(jobDescription)
      .where(and(eq(jobDescription.id, id), eq(jobDescription.organizationId, organizationId)))
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException("岗位不存在。");
    }
    return rows[0];
  }
  private async compile(job: {
    name: string;
    prompt: string;
    structuredConfig: JobDescriptionStructuredConfig;
  }) {
    const generatedAt = new Date().toISOString();
    const prompt = `你是招聘评估规则编译器。请把岗位 JD 转换成严格 JSON 评分蓝图。不得臆造 JD 没有的信息，所有 sourceText 必须是原文中的短句或等义摘录。hardGateRequirements 只放明确“必须/至少”的要求，每项 requirementId 唯一；coreSkills/auxiliarySkills 的 requirementGroupId 必须稳定，同一 any 组至少2项。schemaVersion 必须为1；compiler 固定为 {"generatedAt":"${generatedAt}","modelId":"workspace-structured-model","promptVersion":"nest-v1"}；priorityConditions/exclusionConditions 逐项复制给定配置并补 sourceText。
岗位名称：${job.name}
岗位 JD：${job.prompt}
结构化配置：${JSON.stringify(job.structuredConfig)}
输出字段必须严格匹配 JobEvaluationBlueprint：schemaVersion,compiler,hardGateRequirements,coreSkills,auxiliarySkills,dimensionExpectations(六维数组),educationExpectation,requiredRelevantExperience,priorityConditions,exclusionConditions。每个 sourceRef 为 {kind:"job_description"|"hard_gate",path:"字段路径"}。`;
    try {
      return jobEvaluationBlueprintSchema.parse(await requestStructuredAiJson(prompt));
    } catch (error) {
      throw new UnprocessableEntityException("生成评分规则失败。", {
        cause: error,
        errorCode: "JOB_BLUEPRINT_GENERATION_FAILED",
      });
    }
  }
  private result(blueprint: JobEvaluationBlueprint, inputHash: string) {
    return {
      blueprint,
      blueprintHash: hash(blueprint),
      generatedAt: blueprint.compiler.generatedAt,
      inputHash,
    };
  }
  async preview(organizationId: string, actorId: string, id: string) {
    const row = await this.job(organizationId, id);
    if (row.evaluationMode !== "structured" || row.lifecycleStatus !== "draft") {
      throw new ConflictException("只有未发布的新版岗位可以生成评分规则。");
    }
    const inputHash = hash({ prompt: row.prompt, structuredConfig: row.structuredConfig });
    const result = this.result(await this.compile(row), inputHash);
    const updated = await this.database
      .update(jobDescription)
      .set({
        evaluationBlueprintPreview: result.blueprint,
        evaluationBlueprintPreviewGeneratedAt: new Date(result.generatedAt),
        evaluationBlueprintPreviewHash: result.blueprintHash,
        evaluationBlueprintPreviewInputHash: inputHash,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(jobDescription.id, id),
          eq(jobDescription.organizationId, organizationId),
          eq(jobDescription.lifecycleStatus, "draft"),
        ),
      )
      .returning({ id: jobDescription.id });
    if (!updated[0]) {
      throw new ConflictException("岗位已被其他操作更新。");
    }
    return result;
  }
  async saveRuleDraft(
    organizationId: string,
    actorId: string,
    id: string,
    input: {
      deductionRules: JobDescriptionDeductionRules;
      expectedBlueprintHash: string;
      ruleDraft: JobEvaluationRuleDraft;
    },
  ) {
    const row = await this.job(organizationId, id);
    if (
      !row.evaluationBlueprintPreview ||
      row.evaluationBlueprintPreviewHash !== input.expectedBlueprintHash
    ) {
      throw new ConflictException("评分规则预览已更新，请刷新后重试。");
    }
    const structuredConfig = { ...row.structuredConfig, deductionRules: input.deductionRules };
    const blueprint = ruleDraftBlueprint(
      jobEvaluationBlueprintSchema.parse(row.evaluationBlueprintPreview),
      input.ruleDraft,
      structuredConfig,
    );
    const result = this.result(blueprint, hash({ prompt: row.prompt, structuredConfig }));
    await this.database
      .update(jobDescription)
      .set({
        evaluationBlueprintPreview: blueprint,
        evaluationBlueprintPreviewGeneratedAt: new Date(result.generatedAt),
        evaluationBlueprintPreviewHash: result.blueprintHash,
        evaluationBlueprintPreviewInputHash: result.inputHash,
        structuredConfig,
        updatedAt: new Date(),
      })
      .where(eq(jobDescription.id, id));
    return result;
  }
  async publish(organizationId: string, actorId: string, id: string, confirmedHash: string) {
    const row = await this.job(organizationId, id);
    if (row.lifecycleStatus === "published") {
      throw new ConflictException("岗位已经发布。");
    }
    if (!row.evaluationBlueprintPreview || row.evaluationBlueprintPreviewHash !== confirmedHash) {
      throw new ConflictException("评分规则预览已更新，请刷新后重试。");
    }
    await this.database
      .update(jobDescription)
      .set({
        deductionRuleSetVersion: STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION,
        evaluationBlueprint: row.evaluationBlueprintPreview,
        evaluationBlueprintHash: row.evaluationBlueprintPreviewHash,
        evaluationBlueprintPreview: null,
        evaluationBlueprintPreviewGeneratedAt: null,
        evaluationBlueprintPreviewHash: null,
        evaluationBlueprintPreviewInputHash: null,
        evaluationBlueprintSchemaVersion: 1,
        lifecycleStatus: "published",
        publishedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(jobDescription.id, id));
    return this.jobs.get(organizationId, id);
  }
  async createUpgrade(organizationId: string, actorId: string, id: string) {
    const row = await this.job(organizationId, id);
    if (row.evaluationMode !== "legacy") {
      throw new ConflictException("岗位已经升级为新版。");
    }
    const existing = await this.database
      .select()
      .from(jobDescriptionEvaluationUpgradeDraft)
      .where(
        and(
          eq(jobDescriptionEvaluationUpgradeDraft.jobDescriptionId, id),
          eq(jobDescriptionEvaluationUpgradeDraft.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (existing[0]) {
      throw new ConflictException("升级草稿已存在。");
    }
    const now = new Date();
    const rows = await this.database
      .insert(jobDescriptionEvaluationUpgradeDraft)
      .values({
        createdAt: now,
        createdBy: actorId,
        id: crypto.randomUUID(),
        jobDescriptionId: id,
        organizationId,
        prompt: row.prompt,
        structuredConfig: row.structuredConfig,
        updatedAt: now,
        updatedBy: actorId,
        version: 1,
      })
      .returning();
    return serialize(rows[0]);
  }
  async getUpgrade(organizationId: string, id: string) {
    await this.job(organizationId, id);
    const rows = await this.database
      .select()
      .from(jobDescriptionEvaluationUpgradeDraft)
      .where(
        and(
          eq(jobDescriptionEvaluationUpgradeDraft.jobDescriptionId, id),
          eq(jobDescriptionEvaluationUpgradeDraft.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!rows[0]) {
      throw new NotFoundException("升级草稿不存在。");
    }
    return serialize(rows[0]);
  }
  async updateUpgrade(
    organizationId: string,
    actorId: string,
    id: string,
    input: {
      expectedVersion: number;
      prompt: string;
      structuredConfig: JobDescriptionStructuredConfig;
    },
  ) {
    await this.job(organizationId, id);
    const rows = await this.database
      .update(jobDescriptionEvaluationUpgradeDraft)
      .set({
        blueprintPreview: null,
        blueprintPreviewGeneratedAt: null,
        blueprintPreviewHash: null,
        blueprintPreviewInputHash: null,
        prompt: input.prompt,
        structuredConfig: input.structuredConfig,
        updatedAt: new Date(),
        updatedBy: actorId,
        version: input.expectedVersion + 1,
      })
      .where(
        and(
          eq(jobDescriptionEvaluationUpgradeDraft.jobDescriptionId, id),
          eq(jobDescriptionEvaluationUpgradeDraft.organizationId, organizationId),
          eq(jobDescriptionEvaluationUpgradeDraft.version, input.expectedVersion),
        ),
      )
      .returning();
    if (!rows[0]) {
      throw new ConflictException("升级草稿已被其他操作更新。");
    }
    return serialize(rows[0]);
  }
  async previewUpgrade(
    organizationId: string,
    actorId: string,
    id: string,
    expectedVersion: number,
  ) {
    const job = await this.job(organizationId, id);
    const drafts = await this.database
      .select()
      .from(jobDescriptionEvaluationUpgradeDraft)
      .where(
        and(
          eq(jobDescriptionEvaluationUpgradeDraft.jobDescriptionId, id),
          eq(jobDescriptionEvaluationUpgradeDraft.organizationId, organizationId),
          eq(jobDescriptionEvaluationUpgradeDraft.version, expectedVersion),
        ),
      )
      .limit(1);
    const [draft] = drafts;
    if (!draft) {
      throw new ConflictException("升级草稿已被其他操作更新。");
    }
    const inputHash = hash({ prompt: draft.prompt, structuredConfig: draft.structuredConfig });
    const result = this.result(
      await this.compile({
        name: job.name,
        prompt: draft.prompt,
        structuredConfig: draft.structuredConfig,
      }),
      inputHash,
    );
    const rows = await this.database
      .update(jobDescriptionEvaluationUpgradeDraft)
      .set({
        blueprintPreview: result.blueprint,
        blueprintPreviewGeneratedAt: new Date(result.generatedAt),
        blueprintPreviewHash: result.blueprintHash,
        blueprintPreviewInputHash: inputHash,
        updatedAt: new Date(),
        updatedBy: actorId,
        version: expectedVersion + 1,
      })
      .where(
        and(
          eq(jobDescriptionEvaluationUpgradeDraft.id, draft.id),
          eq(jobDescriptionEvaluationUpgradeDraft.version, expectedVersion),
        ),
      )
      .returning();
    if (!rows[0]) {
      throw new ConflictException("升级草稿已被其他操作更新。");
    }
    return serialize(rows[0]);
  }
  async saveUpgradeRuleDraft(
    organizationId: string,
    actorId: string,
    id: string,
    input: {
      deductionRules: JobDescriptionDeductionRules;
      expectedBlueprintHash: string;
      expectedVersion: number;
      ruleDraft: JobEvaluationRuleDraft;
    },
  ) {
    const drafts = await this.database
      .select()
      .from(jobDescriptionEvaluationUpgradeDraft)
      .where(
        and(
          eq(jobDescriptionEvaluationUpgradeDraft.jobDescriptionId, id),
          eq(jobDescriptionEvaluationUpgradeDraft.organizationId, organizationId),
          eq(jobDescriptionEvaluationUpgradeDraft.version, input.expectedVersion),
        ),
      )
      .limit(1);
    const [draft] = drafts;
    if (!draft?.blueprintPreview || draft.blueprintPreviewHash !== input.expectedBlueprintHash) {
      throw new ConflictException("升级草稿或评分规则预览已更新。");
    }
    const structuredConfig = { ...draft.structuredConfig, deductionRules: input.deductionRules };
    const blueprint = ruleDraftBlueprint(
      jobEvaluationBlueprintSchema.parse(draft.blueprintPreview),
      input.ruleDraft,
      structuredConfig,
    );
    const rows = await this.database
      .update(jobDescriptionEvaluationUpgradeDraft)
      .set({
        blueprintPreview: blueprint,
        blueprintPreviewGeneratedAt: new Date(blueprint.compiler.generatedAt),
        blueprintPreviewHash: hash(blueprint),
        blueprintPreviewInputHash: hash({ prompt: draft.prompt, structuredConfig }),
        structuredConfig,
        updatedAt: new Date(),
        updatedBy: actorId,
        version: input.expectedVersion + 1,
      })
      .where(
        and(
          eq(jobDescriptionEvaluationUpgradeDraft.id, draft.id),
          eq(jobDescriptionEvaluationUpgradeDraft.version, input.expectedVersion),
        ),
      )
      .returning();
    if (!rows[0]) {
      throw new ConflictException("升级草稿已被其他操作更新。");
    }
    return serialize(rows[0]);
  }
  async discardUpgrade(organizationId: string, id: string, expectedVersion: number) {
    const rows = await this.database
      .delete(jobDescriptionEvaluationUpgradeDraft)
      .where(
        and(
          eq(jobDescriptionEvaluationUpgradeDraft.jobDescriptionId, id),
          eq(jobDescriptionEvaluationUpgradeDraft.organizationId, organizationId),
          eq(jobDescriptionEvaluationUpgradeDraft.version, expectedVersion),
        ),
      )
      .returning({ id: jobDescriptionEvaluationUpgradeDraft.id });
    if (!rows[0]) {
      throw new ConflictException("升级草稿已被其他操作更新。");
    }
    return { success: true as const };
  }
  async publishUpgrade(
    organizationId: string,
    actorId: string,
    id: string,
    expectedVersion: number,
    confirmedHash: string,
  ) {
    const row = await this.job(organizationId, id);
    const drafts = await this.database
      .select()
      .from(jobDescriptionEvaluationUpgradeDraft)
      .where(
        and(
          eq(jobDescriptionEvaluationUpgradeDraft.jobDescriptionId, id),
          eq(jobDescriptionEvaluationUpgradeDraft.organizationId, organizationId),
          eq(jobDescriptionEvaluationUpgradeDraft.version, expectedVersion),
        ),
      )
      .limit(1);
    const [draft] = drafts;
    const blueprintPreview = draft?.blueprintPreview;
    if (!blueprintPreview || draft.blueprintPreviewHash !== confirmedHash) {
      throw new ConflictException("升级草稿或评分规则预览已更新。");
    }
    const invalidated = await this.unitOfWork.run(async () => {
      const invalidatedCandidates = await this.candidateEvaluations.invalidateInFlightForJob(
        organizationId,
        id,
      );
      const tx = this.unitOfWork.current();
      await tx.insert(jobDescriptionEvaluationUpgradeAudit).values({
        blueprint: blueprintPreview,
        blueprintHash: confirmedHash,
        blueprintSchemaVersion: 1,
        deductionRuleSetVersion: STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION,
        draftVersion: expectedVersion,
        id: crypto.randomUUID(),
        jobDescriptionId: id,
        legacySnapshot: {
          evaluationMode: row.evaluationMode,
          lifecycleStatus: row.lifecycleStatus,
          prompt: row.prompt,
        },
        organizationId,
        prompt: draft.prompt,
        structuredConfig: draft.structuredConfig,
        upgradedBy: actorId,
      });
      await tx
        .update(jobDescription)
        .set({
          deductionRuleSetVersion: STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION,
          evaluationBlueprint: draft.blueprintPreview,
          evaluationBlueprintHash: confirmedHash,
          evaluationBlueprintSchemaVersion: 1,
          evaluationMode: "structured",
          evaluationUpgradedAt: new Date(),
          evaluationUpgradedBy: actorId,
          prompt: draft.prompt,
          structuredConfig: draft.structuredConfig,
          updatedAt: new Date(),
        })
        .where(eq(jobDescription.id, id));
      await tx
        .delete(jobDescriptionEvaluationUpgradeDraft)
        .where(eq(jobDescriptionEvaluationUpgradeDraft.id, draft.id));
      return invalidatedCandidates;
    });
    return {
      invalidatedLegacyAttemptCount: invalidated,
      jobDescription: await this.jobs.get(organizationId, id),
    };
  }
  toRuleDraft(blueprint: JobEvaluationBlueprint) {
    return toJobEvaluationRuleDraft(blueprint);
  }
}
