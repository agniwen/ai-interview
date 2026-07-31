/* oxlint-disable max-lines -- the evaluator keeps its schemas, Agent prompts, deterministic normalization, scoring, and artifact assembly in one versioned module. */
import { z } from "zod";
import { resumeProfileSchema } from "@arc/db-schema/interview/types";
import { jobEvaluationBlueprintSchema } from "@arc/db-schema/job-description-evaluation";
import { jobDescriptionStructuredConfigSchema } from "@arc/db-schema/job-description-structured-config";
import {
  structuredResumeEvidenceSchema,
  structuredResumeEvaluationV1Schema,
  structuredResumeGateStatusSchema,
  structuredResumeRuleStatusSchema,
} from "@arc/db-schema/structured-resume-evaluation";
import {
  areStructuredResumeEvidenceSourcesValid,
  computeRelevantExperience,
  computeStructuredResumeEvaluation,
  deriveTimelineFacts,
  STRUCTURED_RESUME_DEDUCTION_CATALOG,
  STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION,
  STRUCTURED_RESUME_DIMENSIONS,
} from "@arc/shared/structured-resume-scoring";
import type {
  StructuredResumeAdjustmentMatch,
  StructuredResumeDimension,
  StructuredResumeGateJudgment,
  StructuredResumeRuleJudgment,
} from "@arc/shared/structured-resume-scoring";
import {
  generateStructuredWithMastraAgent,
  structuredResumeAdjustmentAgent,
  structuredResumeDimensionAgent,
  structuredResumeGateAgent,
  structuredResumeNarrativeAgent,
} from "./mastra/agents/simple-generators";
import { getMastraModelIdentifier, mastraModels } from "./mastra/models";
import { computeJobEvaluationPayloadHash } from "@arc/ai-recruitment-copilot-backend/lib/server/job-evaluation-hash";

export const STRUCTURED_RESUME_ENGINE_VERSION = "structured-resume-engine-v1";
export const STRUCTURED_RESUME_PROMPT_VERSION = "structured-resume-prompt-v1";
const STRUCTURED_RESUME_AGENT_TIMEOUT_MS = 240_000;
export const STRUCTURED_RESUME_MODEL_ID = getMastraModelIdentifier(mastraModels.structuredModel);

export const structuredResumeWorkflowInputSchema = z
  .object({
    engine: z
      .object({
        modelId: z.string().trim().min(1),
        promptVersion: z.string().trim().min(1),
        version: z.string().trim().min(1),
      })
      .strict(),
    jobSnapshot: z
      .object({
        blueprint: jobEvaluationBlueprintSchema,
        blueprintHash: z.string().trim().min(1),
        deductionRuleSetVersion: z.number().int().positive(),
        evaluationMode: z.literal("structured"),
        jobId: z.string().trim().min(1),
        publishedConfig: jobDescriptionStructuredConfigSchema,
      })
      .strict(),
    resumeInput: z
      .object({
        evaluationAsOf: z.string().date(),
        resumeInputHash: z.string().trim().min(1),
        resumeProfile: resumeProfileSchema,
        resumeText: z.string().nullable(),
        runId: z.string().trim().min(1),
      })
      .strict(),
  })
  .strict();

const gateExperienceEpisodeSchema = z
  .object({
    current: z.boolean(),
    endMonth: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .nullable(),
    evidence: z.array(structuredResumeEvidenceSchema),
    startMonth: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .nullable(),
  })
  .strict();

const gateJudgmentSchema = z
  .object({
    aiStatus: structuredResumeGateStatusSchema,
    evidence: z.array(structuredResumeEvidenceSchema),
    experienceEpisodes: z.array(gateExperienceEpisodeSchema).optional(),
    reason: z.string().trim().min(1),
    requirementId: z.string().trim().min(1),
  })
  .strict();

export const structuredGateAgentOutputSchema = z.object({
  judgments: z.array(gateJudgmentSchema),
});

const semanticRuleIds = [
  "education.below_tier",
  "education.major_unrelated",
  "experience.fragmented",
  "experience.industry_unrelated",
  "potential.illogical_switches",
  "potential.no_growth_two_years",
  "project.edge_participation",
  "project.no_relevant_project",
  "project.scale_low",
  "stability.frequent_unrelated_industries",
] as const;

const semanticRuleJudgmentSchema = z
  .object({
    dimension: z.enum(STRUCTURED_RESUME_DIMENSIONS),
    evidence: z.array(structuredResumeEvidenceSchema),
    reason: z.string().trim().min(1),
    ruleId: z.enum(semanticRuleIds),
    status: structuredResumeRuleStatusSchema,
    units: z.number().int().min(1).max(3).optional(),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.dimension !== STRUCTURED_RESUME_DEDUCTION_CATALOG[item.ruleId].dimension) {
      context.addIssue({
        code: "custom",
        message: "规则与维度不一致",
        path: ["dimension"],
      });
    }
    if (
      item.ruleId === "education.below_tier" &&
      item.status === "matched" &&
      item.units === undefined
    ) {
      context.addIssue({
        code: "custom",
        message: "学历层级扣分必须返回层级差",
        path: ["units"],
      });
    }
  });

const timelineEpisodeSchema = z
  .object({
    current: z.boolean(),
    endMonth: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .nullable(),
    evidence: z.array(structuredResumeEvidenceSchema),
    gapExplanation: z.string().trim().min(1).nullable(),
    id: z.string().trim().min(1),
    primaryStatus: z.enum(["concurrent", "primary", "unresolved"]),
    relevance: z.enum(["insufficient_evidence", "not_relevant", "relevant"]),
    relevanceReason: z.string().trim().min(1),
    startMonth: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .nullable(),
  })
  .strict();

const projectFactSchema = z
  .object({
    current: z.boolean(),
    endMonth: z
      .string()
      .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
      .nullable(),
    evidence: z.array(structuredResumeEvidenceSchema),
    id: z.string().trim().min(1),
    relevant: z.boolean(),
  })
  .strict();

const skillFactSchema = z
  .object({
    evidence: z.array(structuredResumeEvidenceSchema),
    normalizedSkill: z.string().trim().min(1),
    reason: z.string().trim().min(1),
    status: z.enum(["applied", "missing", "shallow"]),
  })
  .strict()
  .superRefine((item, context) => {
    if (item.status !== "missing" && item.evidence.length === 0) {
      context.addIssue({
        code: "custom",
        message: "applied 或 shallow 技能事实必须提供简历证据",
        path: ["evidence"],
      });
    }
  });

export const structuredDimensionAgentOutputSchema = z
  .object({
    employmentEpisodes: z.array(timelineEpisodeSchema),
    projects: z.array(projectFactSchema),
    ruleJudgments: z.array(semanticRuleJudgmentSchema),
    skillFacts: z.array(skillFactSchema),
  })
  .strict();

const adjustmentJudgmentSchema = z
  .object({
    conditionId: z.string().trim().min(1),
    evidence: z.array(structuredResumeEvidenceSchema),
    matched: z.boolean(),
    reason: z.string().trim().min(1),
  })
  .strict();

export const structuredAdjustmentAgentOutputSchema = z.object({
  judgments: z.array(adjustmentJudgmentSchema),
});

export const structuredNarrativeAgentOutputSchema = z
  .object({
    recommendation: z.string().trim().min(1),
    summary: z.string().trim().min(1),
  })
  .strict();

export type StructuredResumeWorkflowInput = z.infer<typeof structuredResumeWorkflowInputSchema>;
type DimensionFacts = z.infer<typeof structuredDimensionAgentOutputSchema>;
type GateAgentOutput = z.infer<typeof structuredGateAgentOutputSchema>;
type AdjustmentAgentOutput = z.infer<typeof structuredAdjustmentAgentOutputSchema>;
export type StructuredResumeCalculation = ReturnType<typeof computeStructuredResumeCalculation>;

const STRUCTURED_GRADE_LABELS = {
  matched: "匹配",
  recommended: "推荐",
  unmatched: "不匹配",
} as const;

const STRUCTURED_GATE_LABELS = {
  failed: "未通过",
  needs_verification: "待核实",
  passed: "通过",
} as const;

const STRUCTURED_DIMENSION_LABELS = {
  educationBackground: "学历",
  experienceRelevance: "经验",
  potential: "潜力",
  projectMatch: "项目",
  skillMatch: "技能",
  stability: "稳定",
} as const;

const STRUCTURED_DIMENSION_RULE_GUIDANCE = [
  `扣分规则目录版本：${STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION}`,
  "只判断下列规则的事实状态；不得自行创造、合并或修改规则：",
  "education.below_tier：仅在岗位蓝图有明确学历层级时适用；按 associate→bachelor→master→doctorate 比较，每低一个学历层级返回 1 units，最多 3。",
  "只有 education.below_tier 且 status=matched 时返回 units；其余所有情况必须省略 units 字段。",
  "education.major_unrelated：仅在岗位蓝图有明确专业要求且候选人学历层级达标时，判断专业是否无关。",
  "experience.industry_unrelated：仅在岗位蓝图有行业、领域、角色或能力相关性基准时，判断相关经历是否完全不匹配。",
  "experience.fragmented：仅在岗位蓝图有相关经验基准时，判断相关经历是否碎片化并伴随反复转行或断档。",
  "project.scale_low：仅在岗位蓝图有项目要求时，判断项目规模或业务复杂度是否低于要求。",
  "project.edge_participation：仅在岗位蓝图有项目要求时，判断候选人是否仅边缘参与而非核心负责人。",
  "project.no_relevant_project：仅在岗位蓝图有项目要求时，判断是否完全没有相关业务项目证据。",
  "potential.no_growth_two_years：判断最近两年是否没有新技能、证书或进阶项目成长记录。",
  "potential.illogical_switches：判断是否存在无逻辑的频繁跨行、职业方向混乱。",
  "stability.frequent_unrelated_industries：判断是否频繁切换完全无关行业。",
  "每条语义规则最多返回一次。规则适用但候选侧证据不足时返回 insufficient_evidence；岗位侧基准缺失时返回 not_applicable。",
  "技能不得通过 ruleJudgments 返回。以岗位蓝图 coreSkills 和 auxiliarySkills 去重，core 优先；每个去重后的岗位技能必须且只能返回一个 skillFacts，status 只能是 applied、shallow、missing。",
  "同一技能不得同时返回 shallow 与 missing。applied 表示有实际运用证据；shallow 表示仅提及或浅层了解、无实操；missing 表示简历中没有该岗位技能。",
  "matched、applied、shallow 必须提供来源引文；missing、not_applicable 或证据确实不足时可以返回空 evidence，禁止编造不存在的引文。",
  "每项最多 2 条证据，每条 quote 只引用能支持判断的最短原文片段；reason 保持简洁。",
  "employmentEpisodes 只输出源证据支持的月级事实，无法解析的日期保留 null。",
  "projects 只返回与岗位要求可能相关的项目；无相关项目时返回空数组，不要枚举明确无关的项目。",
].join("\n");

function buildPrompt(
  title: string,
  input: StructuredResumeWorkflowInput,
  guidance?: string,
): string {
  return [
    title,
    ...(guidance ? [guidance] : []),
    "所有判断必须引用简历原文或结构化档案证据。",
    "quote 必须是声明来源中的逐字连续片段：resume_text 引用连续原文，resume_profile 引用单个字符串叶子值；不得跨字段拼接、改写或概括。",
    "不得输出扣分、时长合计、维度分、综合分或等级。",
    JSON.stringify(input),
  ].join("\n");
}

function validateEvidenceList(
  workflowInput: StructuredResumeWorkflowInput,
  evidence: z.infer<typeof structuredResumeEvidenceSchema>[],
): void {
  const mismatches: string[] = [];
  for (const item of evidence) {
    if (
      areStructuredResumeEvidenceSourcesValid({
        evidence: [item],
        resumeProfile: workflowInput.resumeInput.resumeProfile,
        resumeText: workflowInput.resumeInput.resumeText,
      })
    ) {
      continue;
    }
    const quote = item.quote.replaceAll(/\s+/g, " ").slice(0, 120);
    mismatches.push(`${item.source} 未找到逐字引文“${quote}”`);
  }
  if (mismatches.length > 0) {
    throw new Error(`STRUCTURED_RESUME_EVIDENCE_MISMATCH：${mismatches.join("；")}`);
  }
}

function parseRequiredExperienceYears(value: string): number | null {
  const match = value.normalize("NFKC").match(/(\d+(?:\.\d+)?)\s*年/u);
  if (!match) {
    return null;
  }
  const years = Number(match[1]);
  return Number.isFinite(years) && years > 0 ? years : null;
}

function validateGateAgentOutput(
  input: StructuredResumeWorkflowInput,
  output: GateAgentOutput,
): void {
  validateEvidenceList(
    input,
    output.judgments.flatMap((gateJudgment) => [
      ...gateJudgment.evidence,
      ...(gateJudgment.experienceEpisodes ?? []).flatMap((episode) => episode.evidence),
    ]),
  );
  const outputById = new Map(output.judgments.map((item) => [item.requirementId, item]));
  for (const requirement of input.jobSnapshot.blueprint.hardGateRequirements) {
    if (
      requirement.category !== "work_experience" ||
      parseRequiredExperienceYears(requirement.normalizedRequirement) === null
    ) {
      continue;
    }
    const result = outputById.get(requirement.requirementId);
    if (result && result.experienceEpisodes === undefined) {
      throw new Error(
        `STRUCTURED_RESUME_EXPERIENCE_EPISODES_REQUIRED：${requirement.sourceText} 必须返回 experienceEpisodes`,
      );
    }
  }
}

export function judgeStructuredHardGates(input: StructuredResumeWorkflowInput) {
  return generateStructuredWithMastraAgent({
    agent: structuredResumeGateAgent,
    maxOutputTokens: 16_000,
    prompt: buildPrompt(
      "逐项判断冻结门槛，只返回 passed / failed / needs_verification。",
      input,
      [
        "简历没有写明或没有证据支持门槛要求时，判定 failed，不得仅因候选人可能补充信息而判定 needs_verification。",
        "needs_verification 仅用于简历已有相关证据但证据相互冲突、日期或含义无法可靠确定的情况。",
        "门槛写明数值范围时按闭区间精确判断；只出现高于上限或低于下限的证据不得视为命中，例如带过 8 人团队不等于带过 3-6 人团队。",
        "对每个包含明确年限的 work_experience 门槛，必须返回 experienceEpisodes：逐段列出满足该门槛特定口径的任职起止月份，不得计算总月份；完全没有相关经历时返回空数组。",
        "同一段任职可同时属于不同经验门槛，但必须分别在对应门槛下判断，例如前端研发经验与团队管理经验不能互相替代。",
      ].join("\n"),
    ),
    retryOnInvalid: true,
    schema: structuredGateAgentOutputSchema,
    temperature: 0,
    timeoutMs: STRUCTURED_RESUME_AGENT_TIMEOUT_MS,
    validate: (output) => validateGateAgentOutput(input, output),
  });
}

export function judgeStructuredDimensionEvidence(input: StructuredResumeWorkflowInput) {
  return generateStructuredWithMastraAgent({
    agent: structuredResumeDimensionAgent,
    maxOutputTokens: 16_000,
    prompt: buildPrompt(
      "提取月级工作时间线、主职/并发关系、窄口径相关性和非时间类规则语义。不要计算月份或时间窗口。",
      input,
      STRUCTURED_DIMENSION_RULE_GUIDANCE,
    ),
    retryOnInvalid: true,
    schema: structuredDimensionAgentOutputSchema,
    temperature: 0,
    timeoutMs: STRUCTURED_RESUME_AGENT_TIMEOUT_MS,
    validate: (output) =>
      validateEvidenceList(input, [
        ...output.employmentEpisodes.flatMap((episode) => episode.evidence),
        ...output.projects.flatMap((project) => project.evidence),
        ...output.ruleJudgments.flatMap((semanticJudgment) => semanticJudgment.evidence),
        ...output.skillFacts.flatMap((skill) => skill.evidence),
      ]),
  });
}

export function judgeStructuredAdjustments(
  input: StructuredResumeWorkflowInput,
  gateOutput?: GateAgentOutput,
) {
  const gateContext = gateOutput
    ? `已完成的硬性门槛判断如下；遇到同义或重叠条件时必须保持事实一致：${JSON.stringify(gateOutput)}`
    : "没有可用的硬性门槛判断上下文。";
  return generateStructuredWithMastraAgent({
    agent: structuredResumeAdjustmentAgent,
    prompt: buildPrompt(
      "逐项判断冻结的优先/排除条件。缺少证据必须 matched=false。",
      input,
      [
        "必须判断完整条件，不得只命中其中一部分。",
        "逗号、分号、且、并、同时连接的子条件默认按 AND；只有所有 AND 子条件均有明确证据时 matched=true。只有原文明确使用“或”“任一”等表达时才按 OR。",
        "“等”表示列举项是同类示例而非穷举；有明确证据属于同一类别时，不得仅因名称未逐字列出而判定未命中。",
        "硬性门槛中的 failed 或 needs_verification 事实，不得在同义或重叠的优先/排除条件中无新证据地改判为已命中。",
        gateContext,
      ].join("\n"),
    ),
    retryOnInvalid: true,
    schema: structuredAdjustmentAgentOutputSchema,
    temperature: 0,
    timeoutMs: STRUCTURED_RESUME_AGENT_TIMEOUT_MS,
    validate: (output) =>
      validateEvidenceList(
        input,
        output.judgments.flatMap((adjustmentJudgment) => adjustmentJudgment.evidence),
      ),
  });
}

function judgment(
  ruleId: StructuredResumeRuleJudgment["ruleId"],
  status: StructuredResumeRuleJudgment["status"],
  reason: string,
  units?: number,
): StructuredResumeRuleJudgment {
  return {
    evidence: [],
    reason,
    ruleId,
    status,
    ...(units ? { units } : {}),
  };
}

function normalizedSkill(value: string): string {
  return value.normalize("NFKC").replaceAll(/\s+/g, "").toLocaleLowerCase("zh-CN");
}

function semanticRuleIsApplicable(
  input: StructuredResumeWorkflowInput,
  ruleId: (typeof semanticRuleIds)[number],
): boolean {
  const { blueprint } = input.jobSnapshot;
  const hasExperienceBenchmark =
    blueprint.requiredRelevantExperience !== null ||
    blueprint.dimensionExpectations.experienceRelevance.length > 0;
  const hasProjectBenchmark = blueprint.dimensionExpectations.projectMatch.length > 0;
  switch (ruleId) {
    case "education.below_tier": {
      return (blueprint.educationExpectation?.degreeLevel ?? null) !== null;
    }
    case "education.major_unrelated": {
      return (blueprint.educationExpectation?.majorExpectation ?? null) !== null;
    }
    case "experience.fragmented": {
      return hasExperienceBenchmark;
    }
    case "experience.industry_unrelated": {
      return (
        blueprint.dimensionExpectations.experienceRelevance.length > 0 ||
        (blueprint.requiredRelevantExperience !== null &&
          blueprint.requiredRelevantExperience.relevanceScope !== "total_employment")
      );
    }
    case "project.edge_participation":
    case "project.no_relevant_project":
    case "project.scale_low": {
      return hasProjectBenchmark;
    }
    default: {
      return true;
    }
  }
}

const EDUCATION_LEVEL_RANK = {
  associate: 1,
  bachelor: 2,
  doctorate: 4,
  master: 3,
} as const;

function resumeEducationLevelRank(value: string | null | undefined): number | null {
  const normalized = value?.normalize("NFKC").toLocaleLowerCase("zh-CN").trim();
  if (!normalized) {
    return null;
  }
  if (/博士|doctor|ph\.?d/u.test(normalized)) {
    return EDUCATION_LEVEL_RANK.doctorate;
  }
  if (/硕士|研究生|master/u.test(normalized)) {
    return EDUCATION_LEVEL_RANK.master;
  }
  if (/本科|学士|bachelor/u.test(normalized)) {
    return EDUCATION_LEVEL_RANK.bachelor;
  }
  if (/大专|专科|高职|associate|college/u.test(normalized)) {
    return EDUCATION_LEVEL_RANK.associate;
  }
  return null;
}

function deriveEducationLevelJudgment(
  input: StructuredResumeWorkflowInput,
): StructuredResumeRuleJudgment {
  const requiredLevel = input.jobSnapshot.blueprint.educationExpectation?.degreeLevel ?? null;
  if (!requiredLevel) {
    return judgment("education.below_tier", "not_applicable", "岗位蓝图未设置学历层级。");
  }
  const candidates = (input.resumeInput.resumeProfile.educationExperiences ?? []).flatMap(
    (education) => {
      const values = [education.educationLevel, education.degree];
      return values.flatMap((value) => {
        const rank = resumeEducationLevelRank(value);
        return rank === null || !value ? [] : [{ quote: value, rank }];
      });
    },
  );
  const [highest] = candidates.toSorted((left, right) => right.rank - left.rank);
  if (!highest) {
    return judgment(
      "education.below_tier",
      "insufficient_evidence",
      "简历没有可归一化的学历层级。",
    );
  }
  const difference = EDUCATION_LEVEL_RANK[requiredLevel] - highest.rank;
  if (difference <= 0) {
    return {
      evidence: [{ quote: highest.quote, source: "resume_profile" }],
      reason: "由代码按标准学历层级顺序判定，候选人学历已达到岗位要求。",
      ruleId: "education.below_tier",
      status: "not_matched",
    };
  }
  return {
    evidence: [{ quote: highest.quote, source: "resume_profile" }],
    reason: `由代码按标准学历层级顺序判定，候选人学历低于岗位要求 ${difference} 档。`,
    ruleId: "education.below_tier",
    status: "matched",
    units: Math.min(difference, 3),
  };
}

function deriveSkillRuleJudgments(
  input: StructuredResumeWorkflowInput,
  facts: DimensionFacts,
  gateOutput?: GateAgentOutput,
): StructuredResumeRuleJudgment[] {
  const expectations = new Map<
    string,
    {
      kind: "auxiliary" | "core";
      sourceRef: { kind: string; path: string };
      sourceText: string;
    }
  >();
  for (const item of input.jobSnapshot.blueprint.coreSkills) {
    expectations.set(normalizedSkill(item.normalizedSkill), {
      kind: "core",
      sourceRef: item.sourceRef,
      sourceText: item.sourceText,
    });
  }
  for (const item of input.jobSnapshot.blueprint.auxiliarySkills) {
    const key = normalizedSkill(item.normalizedSkill);
    if (!expectations.has(key)) {
      expectations.set(key, {
        kind: "auxiliary",
        sourceRef: item.sourceRef,
        sourceText: item.sourceText,
      });
    }
  }
  if (expectations.size === 0) {
    return [
      judgment("skill.missing_core", "not_applicable", "岗位蓝图未设置核心技能。"),
      judgment("skill.missing_auxiliary", "not_applicable", "岗位蓝图未设置辅助技能。"),
      judgment("skill.shallow", "not_applicable", "岗位蓝图未设置技能期望。"),
      judgment("skill.no_related_skill", "not_applicable", "岗位蓝图未设置技能期望。"),
    ];
  }

  const factBySkill = new Map<string, (typeof facts.skillFacts)[number]>();
  for (const fact of facts.skillFacts) {
    const key = normalizedSkill(fact.normalizedSkill);
    if (expectations.has(key) && !factBySkill.has(key)) {
      factBySkill.set(key, fact);
    }
  }
  const gateOutputById = new Map(
    (gateOutput?.judgments ?? []).map((gateJudgment) => [gateJudgment.requirementId, gateJudgment]),
  );
  const requiredSkillGateBySource = new Map(
    input.jobSnapshot.blueprint.hardGateRequirements
      .filter((requirement) => requirement.category === "required_skills")
      .map((requirement) => [normalizedSkill(requirement.sourceText), requirement]),
  );
  const classified = [...expectations].map(([key, expectation]) => ({
    expectation,
    fact: (() => {
      if (
        expectation.kind !== "core" ||
        expectation.sourceRef.kind !== "hard_gate" ||
        expectation.sourceRef.path !== "hardGates.requiredSkills"
      ) {
        return factBySkill.get(key);
      }
      const requirement = requiredSkillGateBySource.get(normalizedSkill(expectation.sourceText));
      const gateJudgment = requirement ? gateOutputById.get(requirement.requirementId) : undefined;
      if (!gateJudgment) {
        return {
          evidence: [],
          normalizedSkill: key,
          reason: requirement
            ? "硬性门槛模型未返回该必备技能，按未命中处理。"
            : "已发布蓝图缺少该必备技能对应的原子门槛，按未命中处理。",
          status: "missing" as const,
        };
      }
      const status = {
        failed: "missing",
        needs_verification: "shallow",
        passed: "applied",
      }[gateJudgment.aiStatus] as "applied" | "missing" | "shallow";
      return {
        evidence: gateJudgment.evidence,
        normalizedSkill: key,
        reason: `沿用同一必备技能的门槛判断：${gateJudgment.reason}`,
        status,
      };
    })(),
  }));
  const unresolved = classified.some((item) => item.fact === undefined);
  const unresolvedCore = classified.some(
    (item) => item.expectation.kind === "core" && item.fact === undefined,
  );
  const unresolvedAuxiliary = classified.some(
    (item) => item.expectation.kind === "auxiliary" && item.fact === undefined,
  );
  const missingCore = classified.filter(
    (item) => item.expectation.kind === "core" && item.fact?.status === "missing",
  );
  const missingAuxiliary = classified.filter(
    (item) => item.expectation.kind === "auxiliary" && item.fact?.status === "missing",
  );
  const shallow = classified.filter((item) => item.fact?.status === "shallow");
  const hasRelatedEvidence = classified.some(
    (item) => item.fact?.status === "applied" || item.fact?.status === "shallow",
  );
  const ruleFromCount = (
    ruleId: "skill.missing_auxiliary" | "skill.missing_core" | "skill.shallow",
    items: typeof classified,
    applicable: boolean,
    hasUnresolvedFacts: boolean,
  ) => {
    if (!applicable) {
      return judgment(ruleId, "not_applicable", "岗位蓝图未设置该类技能期望。");
    }
    if (items.length > 0) {
      return {
        evidence: items.flatMap((item) => item.fact?.evidence ?? []),
        reason: `按去重后的岗位技能逐项归一化，共命中 ${items.length} 项。`,
        ruleId,
        status: "matched" as const,
        units: items.length,
      };
    }
    return judgment(
      ruleId,
      hasUnresolvedFacts ? "insufficient_evidence" : "not_matched",
      hasUnresolvedFacts ? "AI 未完整返回全部岗位技能事实。" : "逐项技能事实未命中该规则。",
    );
  };

  let noRelatedSkill = judgment(
    "skill.no_related_skill",
    "insufficient_evidence",
    "技能事实不完整，无法确认是否完全没有岗位相关技能。",
  );
  if (hasRelatedEvidence) {
    noRelatedSkill = judgment(
      "skill.no_related_skill",
      "not_matched",
      "至少一项岗位技能有应用或浅层证据。",
    );
  } else if (!unresolved) {
    noRelatedSkill = {
      evidence: classified.flatMap((item) => item.fact?.evidence ?? []),
      reason: "全部去重后的岗位技能均为 missing。",
      ruleId: "skill.no_related_skill",
      status: "matched",
    };
  }
  return [
    ruleFromCount(
      "skill.missing_core",
      missingCore,
      classified.some((item) => item.expectation.kind === "core"),
      unresolvedCore,
    ),
    ruleFromCount(
      "skill.missing_auxiliary",
      missingAuxiliary,
      classified.some((item) => item.expectation.kind === "auxiliary"),
      unresolvedAuxiliary,
    ),
    ruleFromCount("skill.shallow", shallow, true, unresolved),
    noRelatedSkill,
  ];
}

function normalizedExperienceRequirementKey(value: string, years: number): string {
  const scope = normalizedSkill(value)
    .replaceAll(/\d+(?:\.\d+)?年/gu, "")
    .replaceAll(/至少|不少于|及以上|以上|满|相关|工作|经验|要求/gu, "")
    .replaceAll(/[^\p{L}\p{N}]/gu, "");
  return `${years}:${scope || "total"}`;
}

function linkedTeamSizeQualifiers(
  input: StructuredResumeWorkflowInput,
  requirement: StructuredResumeWorkflowInput["jobSnapshot"]["blueprint"]["hardGateRequirements"][number],
) {
  if (!/管理/u.test(requirement.normalizedRequirement)) {
    return [];
  }
  const requirementText = normalizedSkill(requirement.sourceText);
  return input.jobSnapshot.blueprint.hardGateRequirements.filter((candidate) => {
    if (
      candidate.requirementId === requirement.requirementId ||
      !/(\d+)\s*(?:-|~|～|—|–|至|到)\s*(\d+)\s*人/u.test(
        candidate.normalizedRequirement.normalize("NFKC"),
      ) ||
      !/团队|小组|管理|带过/u.test(candidate.normalizedRequirement)
    ) {
      return false;
    }
    if (
      candidate.sourceRef.kind === requirement.sourceRef.kind &&
      candidate.sourceRef.path === requirement.sourceRef.path
    ) {
      return true;
    }
    const qualifierText = normalizedSkill(candidate.sourceText);
    return input.jobSnapshot.blueprint.dimensionExpectations.experienceRelevance.some(
      (expectation) => {
        const sourceText = normalizedSkill(expectation.sourceText);
        return sourceText.includes(requirementText) && sourceText.includes(qualifierText);
      },
    );
  });
}

function deriveMissingExperienceYearsJudgment(
  input: StructuredResumeWorkflowInput,
  facts: DimensionFacts,
  gateOutput?: GateAgentOutput,
): StructuredResumeRuleJudgment {
  const gateOutputById = new Map(
    (gateOutput?.judgments ?? []).map((item) => [item.requirementId, item]),
  );
  const normalizedGateById = new Map(
    gateOutput
      ? // oxlint-disable-next-line no-use-before-define -- the shared gate normalizer is declared below the rule reducer.
        buildGateJudgments(input, gateOutput).map((item) => [item.requirementId, item])
      : [],
  );
  const requirements = input.jobSnapshot.blueprint.hardGateRequirements
    .filter((requirement) => requirement.category === "work_experience")
    .flatMap((requirement) => {
      const years = parseRequiredExperienceYears(requirement.normalizedRequirement);
      return years === null ? [] : [{ requirement, years }];
    })
    .filter(
      (item, index, all) =>
        all.findIndex(
          (candidate) =>
            normalizedExperienceRequirementKey(
              candidate.requirement.normalizedRequirement,
              candidate.years,
            ) ===
            normalizedExperienceRequirementKey(item.requirement.normalizedRequirement, item.years),
        ) === index,
    );
  const primary = input.jobSnapshot.blueprint.requiredRelevantExperience;

  if (requirements.length === 0) {
    if (!primary) {
      return judgment("experience.missing_year", "not_applicable", "岗位蓝图未设置相关经验年限。");
    }
    const relevant = computeRelevantExperience({
      episodes: facts.employmentEpisodes.map((episode) => ({
        endMonth:
          episode.endMonth ??
          (episode.current ? input.resumeInput.evaluationAsOf.slice(0, 7) : null),
        relevance: episode.relevance,
        startMonth: episode.startMonth,
      })),
      profileWorkYears: input.resumeInput.resumeProfile.workYears ?? undefined,
      relevanceScope: primary.relevanceScope,
      requiredYears: primary.years,
    });
    return judgment(
      "experience.missing_year",
      relevant.status,
      "由代码按冻结口径合并相关工作月份后判定。",
      relevant.missingYearUnits || undefined,
    );
  }

  let hasInsufficientEvidence = false;
  let missingYearUnits = 0;
  const reasons: string[] = [];
  const evidence: z.infer<typeof structuredResumeEvidenceSchema>[] = [];
  for (const { requirement, years } of requirements) {
    const output = gateOutputById.get(requirement.requirementId);
    const linkedQualifiers = linkedTeamSizeQualifiers(input, requirement).map((qualifier) =>
      normalizedGateById.get(qualifier.requirementId),
    );
    if (linkedQualifiers.some((qualifier) => qualifier?.aiStatus === "needs_verification")) {
      hasInsufficientEvidence = true;
      reasons.push(`${requirement.sourceText}：关联的团队规模要求待核实`);
      continue;
    }
    const failedQualifier = linkedQualifiers.find((qualifier) => qualifier?.aiStatus === "failed");
    if (failedQualifier) {
      missingYearUnits += Math.ceil(years);
      evidence.push(...failedQualifier.evidence);
      reasons.push(`${requirement.sourceText}：未发现同时满足关联团队规模要求的管理经历`);
      continue;
    }
    if (!output) {
      missingYearUnits += Math.ceil(years);
      reasons.push(`${requirement.sourceText}：AI 未返回该经验门槛，按未命中处理`);
      continue;
    }
    if (output.aiStatus === "needs_verification") {
      hasInsufficientEvidence = true;
      reasons.push(`${requirement.sourceText}：证据待核实`);
      continue;
    }
    if (output.experienceEpisodes === undefined) {
      hasInsufficientEvidence = true;
      reasons.push(`${requirement.sourceText}：AI 未返回逐段经验时间线`);
      continue;
    }
    evidence.push(
      ...output.evidence,
      ...output.experienceEpisodes.flatMap((episode) => episode.evidence),
    );
    if (output.experienceEpisodes.length === 0) {
      missingYearUnits += Math.ceil(years);
      reasons.push(`${requirement.sourceText}：未发现相关经历`);
      continue;
    }
    const relevant = computeRelevantExperience({
      episodes: output.experienceEpisodes.map((episode) => ({
        endMonth:
          episode.endMonth ??
          (episode.current ? input.resumeInput.evaluationAsOf.slice(0, 7) : null),
        relevance: "relevant" as const,
        startMonth: episode.startMonth,
      })),
      profileWorkYears: undefined,
      relevanceScope: "capability",
      requiredYears: years,
    });
    if (relevant.status === "insufficient_evidence") {
      hasInsufficientEvidence = true;
      reasons.push(`${requirement.sourceText}：相关经历时间线不完整`);
      continue;
    }
    missingYearUnits += relevant.missingYearUnits;
    reasons.push(
      `${requirement.sourceText}：${relevant.missingYearUnits > 0 ? `缺少 ${relevant.missingYearUnits} 年` : "已达到"}`,
    );
  }

  if (hasInsufficientEvidence) {
    return {
      evidence,
      reason: reasons.join("；"),
      ruleId: "experience.missing_year",
      status: "insufficient_evidence",
    };
  }
  return {
    evidence,
    reason: reasons.join("；"),
    ruleId: "experience.missing_year",
    status: missingYearUnits > 0 ? "matched" : "not_matched",
    ...(missingYearUnits > 0 ? { units: missingYearUnits } : {}),
  };
}

// oxlint-disable-next-line complexity -- this deterministic reducer covers the complete fixed rule catalog in one auditable pass.
export function deriveStructuredRuleJudgments(
  input: StructuredResumeWorkflowInput,
  facts: DimensionFacts,
  gateOutput?: GateAgentOutput,
): Record<StructuredResumeDimension, StructuredResumeRuleJudgment[]> {
  const judgments: Record<StructuredResumeDimension, StructuredResumeRuleJudgment[]> = {
    educationBackground: [],
    experienceRelevance: [],
    potential: [],
    projectMatch: [],
    skillMatch: [],
    stability: [],
  };
  const semanticByRuleId = new Map<
    (typeof semanticRuleIds)[number],
    (typeof facts.ruleJudgments)[number]
  >();
  for (const item of facts.ruleJudgments) {
    if (!semanticByRuleId.has(item.ruleId)) {
      semanticByRuleId.set(item.ruleId, item);
    }
  }
  const educationLevelJudgment = deriveEducationLevelJudgment(input);
  const projectBenchmark =
    input.jobSnapshot.blueprint.dimensionExpectations.projectMatch.length > 0;
  const hasRelevantProject = facts.projects.some((project) => project.relevant);
  for (const ruleId of semanticRuleIds) {
    const item = semanticByRuleId.get(ruleId);
    const { dimension } = STRUCTURED_RESUME_DEDUCTION_CATALOG[ruleId];
    const applicable = semanticRuleIsApplicable(input, ruleId);
    let normalized = judgment(ruleId, "insufficient_evidence", "AI 未返回该规则的有效判断。");
    if (ruleId === "education.below_tier") {
      normalized = educationLevelJudgment;
    } else if (
      ruleId === "education.major_unrelated" &&
      educationLevelJudgment.status === "matched"
    ) {
      normalized = judgment(
        ruleId,
        "not_applicable",
        "候选人学历层级未达标，不重复应用专业不相关扣分。",
      );
    } else if (
      ruleId === "education.major_unrelated" &&
      educationLevelJudgment.status === "insufficient_evidence"
    ) {
      normalized = judgment(ruleId, "insufficient_evidence", "学历层级未决，无法判断专业匹配。");
    } else if (ruleId === "project.no_relevant_project" && applicable) {
      normalized = judgment(
        ruleId,
        hasRelevantProject ? "not_matched" : "matched",
        hasRelevantProject
          ? "归一化项目事实中至少包含一个相关项目。"
          : "归一化项目事实中没有相关项目。",
      );
    } else if (
      (ruleId === "project.edge_participation" || ruleId === "project.scale_low") &&
      applicable &&
      !hasRelevantProject
    ) {
      normalized = judgment(ruleId, "not_applicable", "没有相关项目，不重复应用项目质量扣分。");
    } else if (applicable && item) {
      normalized = {
        evidence: item.evidence,
        reason: item.reason,
        ruleId,
        status: item.status,
      };
    } else if (!applicable) {
      normalized = judgment(ruleId, "not_applicable", "岗位蓝图未包含该规则所需的来源基准。");
    }
    judgments[dimension].push(normalized);
  }
  judgments.skillMatch.push(...deriveSkillRuleJudgments(input, facts, gateOutput));

  judgments.experienceRelevance.push(
    deriveMissingExperienceYearsJudgment(input, facts, gateOutput),
  );

  const temporal = deriveTimelineFacts({
    employmentEpisodes: facts.employmentEpisodes,
    evaluationAsOf: input.resumeInput.evaluationAsOf,
    projects: facts.projects,
  });
  if (temporal.hasUnresolvedPrimaryTimeline) {
    judgments.stability.push(
      judgment(
        "stability.three_changes_one_year",
        "insufficient_evidence",
        "缺少可解析的主职工作时间线。",
      ),
      judgment(
        "stability.two_changes_one_year",
        "insufficient_evidence",
        "缺少可解析的主职工作时间线。",
      ),
      judgment(
        "stability.two_changes_two_years",
        "insufficient_evidence",
        "缺少可解析的主职工作时间线。",
      ),
      judgment("stability.short_tenure", "insufficient_evidence", "缺少可解析的主职工作时间线。"),
    );
  } else {
    const oneYear = temporal.jobChangesWithinOneYear ?? 0;
    const twoYears = temporal.jobChangesWithinTwoYears ?? 0;
    judgments.stability.push(
      judgment(
        "stability.three_changes_one_year",
        oneYear >= 3 ? "matched" : "not_matched",
        "由代码按一年回看窗口统计岗位变动。",
      ),
      judgment(
        "stability.two_changes_one_year",
        oneYear === 2 ? "matched" : "not_matched",
        "由代码按一年回看窗口统计岗位变动。",
      ),
      judgment(
        "stability.two_changes_two_years",
        twoYears >= 2 ? "matched" : "not_matched",
        "由代码按两年回看窗口统计岗位变动。",
      ),
      judgment(
        "stability.short_tenure",
        (temporal.shortTenureCount ?? 0) > 0 ? "matched" : "not_matched",
        "由代码按完整日历月计算短任职。",
        temporal.shortTenureCount || undefined,
      ),
    );
  }
  if (temporal.hasUnresolvedPrimaryTimeline) {
    judgments.stability.push(
      judgment(
        "stability.gap_over_six_months",
        "insufficient_evidence",
        "缺少可解析的主职工作时间线。",
      ),
      judgment(
        "stability.gap_three_to_six_months",
        "insufficient_evidence",
        "缺少可解析的主职工作时间线。",
      ),
    );
    judgments.potential.push(
      judgment(
        "potential.unexplained_gap_over_six_months",
        "insufficient_evidence",
        "缺少可解析的主职工作时间线。",
      ),
    );
  } else {
    const maxGap = Math.max(0, ...temporal.unexplainedGapMonths);
    judgments.stability.push(
      judgment(
        "stability.gap_over_six_months",
        maxGap > 6 ? "matched" : "not_matched",
        "由代码计算未解释的完整空档月。",
      ),
      judgment(
        "stability.gap_three_to_six_months",
        maxGap >= 3 && maxGap <= 6 ? "matched" : "not_matched",
        "由代码计算未解释的完整空档月。",
      ),
    );
    judgments.potential.push(
      judgment(
        "potential.unexplained_gap_over_six_months",
        maxGap > 6 ? "matched" : "not_matched",
        "由代码计算未解释的完整空档月。",
      ),
    );
  }
  let projectFreshness = judgment(
    "project.old_relevant_project",
    "not_applicable",
    "岗位蓝图未包含项目匹配基准。",
  );
  if (projectBenchmark && !hasRelevantProject) {
    projectFreshness = judgment(
      "project.old_relevant_project",
      "not_applicable",
      "没有相关项目，不重复应用项目新鲜度扣分。",
    );
  } else if (projectBenchmark && temporal.hasUnresolvedRelevantProjectDate) {
    projectFreshness = judgment(
      "project.old_relevant_project",
      "insufficient_evidence",
      "相关项目结束日期无法解析，项目新鲜度未决。",
    );
  } else if (projectBenchmark) {
    projectFreshness = judgment(
      "project.old_relevant_project",
      temporal.oldProjectIds.length > 0 ? "matched" : "not_matched",
      "由代码按三年回看窗口计算相关项目新鲜度。",
    );
  }
  judgments.projectMatch.push(projectFreshness);
  return judgments;
}

export function validateStructuredResumeInput(rawInput: StructuredResumeWorkflowInput) {
  const input = structuredResumeWorkflowInputSchema.parse(rawInput);
  if (
    computeJobEvaluationPayloadHash(input.jobSnapshot.blueprint) !== input.jobSnapshot.blueprintHash
  ) {
    throw new Error("STRUCTURED_BLUEPRINT_HASH_MISMATCH");
  }
  if (input.jobSnapshot.deductionRuleSetVersion !== STRUCTURED_RESUME_DEDUCTION_RULE_SET_VERSION) {
    throw new Error("STRUCTURED_RULE_SET_VERSION_MISMATCH");
  }
  return input;
}

function buildGateJudgments(
  input: StructuredResumeWorkflowInput,
  output: GateAgentOutput,
): StructuredResumeGateJudgment[] {
  const byId = new Map(output.judgments.map((item) => [item.requirementId, item]));
  const educationLevelJudgment = deriveEducationLevelJudgment(input);
  // oxlint-disable-next-line complexity -- one deterministic pass normalizes every supported gate family.
  return input.jobSnapshot.blueprint.hardGateRequirements.map((requirement) => {
    const result = byId.get(requirement.requirementId);
    const normalizedRequirement = requirement.normalizedRequirement.normalize("NFKC");
    const { educationExpectation } = input.jobSnapshot.blueprint;
    const isStandardEducationLevelGate =
      requirement.category === "education" &&
      educationExpectation !== null &&
      educationExpectation.degreeLevel !== null &&
      normalizedSkill(educationExpectation.sourceText) ===
        normalizedSkill(requirement.sourceText) &&
      /^(?:博士|硕士|研究生|本科|学士|大专|专科|高职)(?:及以上|以上)?(?:学历|学位)?$/u.test(
        normalizedRequirement.replaceAll(/\s+/g, ""),
      );
    if (isStandardEducationLevelGate) {
      return {
        aiStatus: educationLevelJudgment.status === "not_matched" ? "passed" : "failed",
        category: requirement.category,
        evidence: educationLevelJudgment.evidence,
        reason:
          educationLevelJudgment.status === "insufficient_evidence"
            ? "简历没有可归一化的学历层级，按未命中处理。"
            : educationLevelJudgment.reason,
        requirementId: requirement.requirementId,
      };
    }
    const requiredExperienceYears =
      requirement.category === "work_experience"
        ? parseRequiredExperienceYears(normalizedRequirement)
        : null;
    if (requiredExperienceYears !== null && result?.experienceEpisodes !== undefined) {
      const experienceEvidence = [
        ...result.evidence,
        ...result.experienceEpisodes.flatMap((episode) => episode.evidence),
      ];
      if (result.experienceEpisodes.length === 0) {
        return {
          aiStatus: "failed",
          category: requirement.category,
          evidence: experienceEvidence,
          reason: "简历中未发现满足该门槛口径的相关经历。",
          requirementId: requirement.requirementId,
        };
      }
      const relevant = computeRelevantExperience({
        episodes: result.experienceEpisodes.map((episode) => ({
          endMonth:
            episode.endMonth ??
            (episode.current ? input.resumeInput.evaluationAsOf.slice(0, 7) : null),
          relevance: "relevant" as const,
          startMonth: episode.startMonth,
        })),
        profileWorkYears: undefined,
        relevanceScope: "capability",
        requiredYears: requiredExperienceYears,
      });
      if (relevant.status === "insufficient_evidence") {
        return {
          aiStatus: "needs_verification",
          category: requirement.category,
          evidence: experienceEvidence,
          reason: "简历包含相关经历，但起止时间不完整或相互冲突，无法确认是否达到门槛年限。",
          requirementId: requirement.requirementId,
        };
      }
      if (relevant.missingYearUnits > 0) {
        return {
          aiStatus: "failed",
          category: requirement.category,
          evidence: experienceEvidence,
          reason: `相关经历约 ${relevant.relevantYears?.toFixed(1)} 年，少于岗位要求的 ${requiredExperienceYears} 年。`,
          requirementId: requirement.requirementId,
        };
      }
      return {
        aiStatus: "passed",
        category: requirement.category,
        evidence: experienceEvidence,
        reason: `相关经历约 ${relevant.relevantYears?.toFixed(1)} 年，达到岗位要求的 ${requiredExperienceYears} 年。`,
        requirementId: requirement.requirementId,
      };
    }
    const teamSizeRange = normalizedRequirement.match(/(\d+)\s*(?:-|~|～|—|–|至|到)\s*(\d+)\s*人/u);
    const evidenceTeamSizes = (result?.evidence ?? []).flatMap((item) =>
      Array.from(item.quote.normalize("NFKC").matchAll(/(\d+)\s*人/gu), (match) =>
        Number(match[1]),
      ),
    );
    const hasOnlyOutOfRangeTeamSizes =
      result?.aiStatus === "passed" &&
      teamSizeRange !== null &&
      evidenceTeamSizes.length > 0 &&
      evidenceTeamSizes.every(
        (size) => size < Number(teamSizeRange[1]) || size > Number(teamSizeRange[2]),
      );
    if (hasOnlyOutOfRangeTeamSizes) {
      return {
        aiStatus: "failed",
        category: requirement.category,
        evidence: result.evidence,
        reason: `简历证据仅体现 ${evidenceTeamSizes.join("、")} 人团队，不在岗位要求的 ${teamSizeRange[1]}-${teamSizeRange[2]} 人范围内。`,
        requirementId: requirement.requirementId,
      };
    }
    return {
      aiStatus: result?.aiStatus ?? "failed",
      category: requirement.category,
      evidence: result?.evidence ?? [],
      reason: result?.reason ?? "AI 未返回该门槛的有效判断，按简历未命中处理。",
      requirementId: requirement.requirementId,
    };
  });
}

function buildAdjustmentMatches(
  input: StructuredResumeWorkflowInput,
  output: AdjustmentAgentOutput,
): StructuredResumeAdjustmentMatch[] {
  const byId = new Map(output.judgments.map((item) => [item.conditionId, item]));
  return [
    ...input.jobSnapshot.publishedConfig.priorityConditions.map((condition) => ({
      condition,
      kind: "priority" as const,
    })),
    ...input.jobSnapshot.publishedConfig.exclusionConditions.map((condition) => ({
      condition,
      kind: "exclusion" as const,
    })),
  ].map(({ condition, kind }) => {
    const result = byId.get(condition.id);
    const matched = result?.matched === true && (result.evidence.length ?? 0) > 0;
    return {
      conditionId: condition.id,
      evidence: matched ? (result?.evidence ?? []) : [],
      kind,
      matched,
      points: condition.points,
      reason: result?.reason ?? "简历中没有命中该条件的证据。",
      sourceText: condition.condition,
    };
  });
}

function validateEvidenceSources(input: {
  adjustmentOutput: AdjustmentAgentOutput;
  dimensionOutput: DimensionFacts;
  gateOutput: GateAgentOutput;
  workflowInput: StructuredResumeWorkflowInput;
}): void {
  const evidenceLists = [
    ...input.gateOutput.judgments.map((item) => item.evidence),
    ...input.gateOutput.judgments.flatMap((item) =>
      (item.experienceEpisodes ?? []).map((episode) => episode.evidence),
    ),
    ...input.dimensionOutput.employmentEpisodes.map((item) => item.evidence),
    ...input.dimensionOutput.projects.map((item) => item.evidence),
    ...input.dimensionOutput.ruleJudgments.map((item) => item.evidence),
    ...input.dimensionOutput.skillFacts.map((item) => item.evidence),
    ...input.adjustmentOutput.judgments.map((item) => item.evidence),
  ];
  validateEvidenceList(input.workflowInput, evidenceLists.flat());
}

export function generateStructuredNarrative(input: {
  calculation: ReturnType<typeof computeStructuredResumeEvaluation>;
  workflowInput: StructuredResumeWorkflowInput;
}) {
  return generateStructuredWithMastraAgent({
    agent: structuredResumeNarrativeAgent,
    prompt: [
      "只解释已完成的计算，不得重算或修改结果。",
      "未命中的优先条件 appliedPoints=0，不加分也不扣分；未命中的排除条件同样不产生分数变化。",
      "只解释 appliedPoints 实际非零的加减分，不得把未应用的配置 points 写成已加分或已扣分。",
      "门槛状态不改变代码给出的分数等级；必须分别说明门槛状态和理论分数等级。",
      JSON.stringify({
        adjustments: input.calculation.adjustments,
        compositeScore: input.calculation.compositeScore,
        dimensions: input.calculation.dimensions,
        gates: input.calculation.gates,
        grade: input.calculation.grade,
      }),
    ].join("\n"),
    retryOnInvalid: true,
    schema: structuredNarrativeAgentOutputSchema,
    temperature: 0,
    timeoutMs: STRUCTURED_RESUME_AGENT_TIMEOUT_MS,
  });
}

export function computeStructuredResumeCalculation(input: {
  adjustmentOutput: AdjustmentAgentOutput;
  dimensionOutput: DimensionFacts;
  gateOutput: GateAgentOutput;
  workflowInput: StructuredResumeWorkflowInput;
}) {
  const { adjustmentOutput, dimensionOutput, gateOutput, workflowInput } = input;
  validateEvidenceSources(input);
  const normalizedDimensionOutput =
    workflowInput.jobSnapshot.blueprint.requiredRelevantExperience?.relevanceScope ===
    "total_employment"
      ? {
          ...dimensionOutput,
          employmentEpisodes: dimensionOutput.employmentEpisodes.map((episode) => ({
            ...episode,
            relevance: "relevant" as const,
            relevanceReason: "岗位采用总工作经验口径，代码将已解析任职统一计为相关经验。",
          })),
        }
      : dimensionOutput;
  const gateJudgments = buildGateJudgments(workflowInput, gateOutput);
  const dimensionRuleJudgments = deriveStructuredRuleJudgments(
    workflowInput,
    normalizedDimensionOutput,
    gateOutput,
  );
  const adjustments = buildAdjustmentMatches(workflowInput, adjustmentOutput);
  const calculation = computeStructuredResumeEvaluation({
    adjustments,
    dimensionRuleJudgments,
    gateJudgments,
    weights: workflowInput.jobSnapshot.publishedConfig.weights,
  });
  return { calculation, dimensionRuleJudgments, normalizedDimensionOutput };
}

function isStructuredNarrativeFactuallyConsistent(
  summary: string,
  calculation: ReturnType<typeof computeStructuredResumeEvaluation>,
): boolean {
  const expectedGateCounts = {
    failed: calculation.gates.judgments.filter((gateJudgment) => gateJudgment.aiStatus === "failed")
      .length,
    needsVerification: calculation.gates.judgments.filter(
      (gateJudgment) => gateJudgment.aiStatus === "needs_verification",
    ).length,
    total: calculation.gates.judgments.length,
  };
  const allMatchesEqual = (pattern: RegExp, expected: number) =>
    [...summary.matchAll(pattern)].every((match) => Number(match[1]) === expected);

  return (
    allMatchesEqual(/(?:综合评分|综合得分|最终得分)\s*(\d+)\s*分/g, calculation.compositeScore) &&
    allMatchesEqual(/(\d+)\s*项(?:硬性)?门槛/g, expectedGateCounts.total) &&
    allMatchesEqual(/(\d+)\s*项(?:门槛)?(?:未通过|失败)/g, expectedGateCounts.failed) &&
    allMatchesEqual(/(\d+)\s*项(?:门槛)?(?:待核实|需要核实)/g, expectedGateCounts.needsVerification)
  );
}

function buildDeterministicNarrativeSummary(input: {
  calculation: ReturnType<typeof computeStructuredResumeEvaluation>;
  workflowInput: StructuredResumeWorkflowInput;
}): string {
  const { calculation, workflowInput } = input;
  const failedJudgments = calculation.gates.judgments.filter(
    (gateJudgment) => gateJudgment.aiStatus === "failed",
  );
  const needsVerificationJudgments = calculation.gates.judgments.filter(
    (gateJudgment) => gateJudgment.aiStatus === "needs_verification",
  );
  const requirementById = new Map(
    workflowInput.jobSnapshot.blueprint.hardGateRequirements.map((requirement) => [
      requirement.requirementId,
      requirement.normalizedRequirement,
    ]),
  );
  const describeRequirements = (judgments: typeof calculation.gates.judgments) =>
    judgments
      .map((gateJudgment) => requirementById.get(gateJudgment.requirementId))
      .filter((requirement): requirement is string => requirement !== undefined)
      .join("、");
  const gateSummary =
    calculation.gates.judgments.length === 0
      ? "岗位未配置硬性门槛。"
      : [
          `共评估${calculation.gates.judgments.length}项硬性门槛`,
          failedJudgments.length > 0 ? `，其中${failedJudgments.length}项未通过` : "，均已通过",
          needsVerificationJudgments.length > 0
            ? `、${needsVerificationJudgments.length}项待核实`
            : "",
          "。",
          failedJudgments.length > 0 ? `未通过项：${describeRequirements(failedJudgments)}。` : "",
          needsVerificationJudgments.length > 0
            ? `待核实项：${describeRequirements(needsVerificationJudgments)}。`
            : "",
        ].join("");
  const dimensionSummaries = STRUCTURED_RESUME_DIMENSIONS.map((dimension) => {
    const result = calculation.dimensions[dimension];
    return result.deductionTotal > 0
      ? `${STRUCTURED_DIMENSION_LABELS[dimension]}${result.rawScore}分（扣${result.deductionTotal}分）`
      : `${STRUCTURED_DIMENSION_LABELS[dimension]}${result.rawScore}分`;
  }).join("、");
  const adjustmentSummary =
    calculation.priorityPointTotal !== 0 || calculation.exclusionPointTotal !== 0
      ? `岗位条件调整：优先条件${calculation.priorityPointTotal}分，排除条件${calculation.exclusionPointTotal}分。`
      : "";

  return [
    `综合评分${calculation.compositeScore}分，等级为${STRUCTURED_GRADE_LABELS[calculation.grade]}；硬性门槛${STRUCTURED_GATE_LABELS[calculation.gates.effectiveStatus]}。`,
    gateSummary,
    `六维评分：${dimensionSummaries}。`,
    adjustmentSummary,
  ].join("");
}

export function assembleStructuredResumeEvaluation(input: {
  calculationResult: StructuredResumeCalculation;
  narrative: z.infer<typeof structuredNarrativeAgentOutputSchema>;
  workflowInput: StructuredResumeWorkflowInput;
}) {
  const { calculationResult, narrative, workflowInput } = input;
  const { calculation, dimensionRuleJudgments, normalizedDimensionOutput } = calculationResult;
  const narrativeSummary = isStructuredNarrativeFactuallyConsistent(narrative.summary, calculation)
    ? `综合评分${calculation.compositeScore}分，等级为${STRUCTURED_GRADE_LABELS[calculation.grade]}；硬性门槛${STRUCTURED_GATE_LABELS[calculation.gates.effectiveStatus]}。${narrative.summary}`
    : buildDeterministicNarrativeSummary({ calculation, workflowInput });
  const required = workflowInput.jobSnapshot.blueprint.requiredRelevantExperience;
  const relevant = required
    ? computeRelevantExperience({
        episodes: normalizedDimensionOutput.employmentEpisodes.map((episode) => ({
          endMonth:
            episode.endMonth ??
            (episode.current ? workflowInput.resumeInput.evaluationAsOf.slice(0, 7) : null),
          relevance: episode.relevance,
          startMonth: episode.startMonth,
        })),
        profileWorkYears: workflowInput.resumeInput.resumeProfile.workYears ?? undefined,
        relevanceScope: required.relevanceScope,
        requiredYears: required.years,
      })
    : null;
  const artifact = {
    adjustments: {
      exclusionPointTotal: calculation.exclusionPointTotal,
      matches: calculation.adjustments,
      priorityPointTotal: calculation.priorityPointTotal,
    },
    blueprint: workflowInput.jobSnapshot.blueprint,
    blueprintHash: workflowInput.jobSnapshot.blueprintHash,
    calculations: {
      adjustedHundredths: calculation.adjustedHundredths,
      clampedHundredths: calculation.clampedHundredths,
      compositeScore: calculation.compositeScore,
      weightedBaseHundredths: calculation.weightedBaseHundredths,
    },
    deductionRuleSetVersion: workflowInput.jobSnapshot.deductionRuleSetVersion,
    dimensions: Object.fromEntries(
      STRUCTURED_RESUME_DIMENSIONS.map((dimension) => [
        dimension,
        {
          ...calculation.dimensions[dimension],
          ruleJudgments: dimensionRuleJudgments[dimension],
        },
      ]),
    ),
    engine: {
      engineVersion: workflowInput.engine.version,
      modelId: workflowInput.engine.modelId,
      promptVersion: workflowInput.engine.promptVersion,
    },
    evaluationAsOf: workflowInput.resumeInput.evaluationAsOf,
    evaluationMode: "structured",
    gates: calculation.gates,
    generatedAt: new Date().toISOString(),
    grade: calculation.grade,
    inputHash: workflowInput.resumeInput.resumeInputHash,
    jobConfig: workflowInput.jobSnapshot.publishedConfig,
    jobConfigHash: computeJobEvaluationPayloadHash(workflowInput.jobSnapshot.publishedConfig),
    jobId: workflowInput.jobSnapshot.jobId,
    narrative: {
      ...narrative,
      recommendation: STRUCTURED_GRADE_LABELS[calculation.grade],
      summary: narrativeSummary,
    },
    requiredRelevantExperience: required
      ? {
          relevanceScope: required.relevanceScope,
          years: required.years,
        }
      : null,
    runId: workflowInput.resumeInput.runId,
    schemaVersion: 1,
    skillExpectations: {
      auxiliary: workflowInput.jobSnapshot.blueprint.auxiliarySkills.map(
        (skill) => skill.normalizedSkill,
      ),
      core: workflowInput.jobSnapshot.blueprint.coreSkills.map((skill) => skill.normalizedSkill),
    },
    timeline: {
      employmentEpisodes: normalizedDimensionOutput.employmentEpisodes,
      relevantMonths: relevant?.relevantMonths ?? null,
      relevantYears: relevant?.relevantYears ?? null,
      relevantYearsSource: relevant?.source ?? null,
    },
    weights: workflowInput.jobSnapshot.publishedConfig.weights,
  };
  return structuredResumeEvaluationV1Schema.parse(artifact);
}

export async function evaluateStructuredResume(rawInput: StructuredResumeWorkflowInput) {
  const input = validateStructuredResumeInput(rawInput);
  const [gateOutput, dimensionOutput, adjustmentOutput] = await Promise.all([
    judgeStructuredHardGates(input),
    judgeStructuredDimensionEvidence(input),
    judgeStructuredAdjustments(input),
  ]);
  const calculationResult = computeStructuredResumeCalculation({
    adjustmentOutput,
    dimensionOutput,
    gateOutput,
    workflowInput: input,
  });
  const narrative = await generateStructuredNarrative({
    calculation: calculationResult.calculation,
    workflowInput: input,
  });
  return assembleStructuredResumeEvaluation({
    calculationResult,
    narrative,
    workflowInput: input,
  });
}
