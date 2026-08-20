/* oxlint-disable max-lines -- workflow contract coverage intentionally stays together for shared fixtures. */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import type { JsonObject } from "@arc/db-schema/json";
import { structuredResumeEvaluationV1Schema } from "@arc/db-schema/structured-resume-evaluation";
import {
  assembleStructuredResumeEvaluation,
  computeStructuredResumeCalculation,
  deriveStructuredRuleJudgments,
  evaluateStructuredResume,
  generateStructuredNarrative,
  judgeStructuredAdjustments,
  judgeStructuredDimensionEvidence,
  judgeStructuredHardGates,
  structuredDimensionAgentOutputSchema,
  validateStructuredResumeInput,
} from "@arc/ai-recruitment-copilot-backend/server/agents/structured-resume-evaluation";
import type { StructuredResumeGenerator } from "@arc/ai-recruitment-copilot-backend/server/agents/structured-resume-evaluation";
import { computeJobEvaluationPayloadHash } from "@arc/ai-recruitment-copilot-backend/lib/server/job-evaluation-hash";
import {
  createStructuredResumeReviewWorkflow,
  runStructuredResumeReviewWorkflow,
} from "../workflows/structured-resume-review-workflow";

interface RecordedGeneratorCall {
  maxOutputTokens?: number;
  prompt: string;
  timeoutMs?: number;
  validate?: (output: JsonObject) => void;
}

const generatorCall = vi.fn<() => Promise<JsonObject>>();
const generatorCalls: RecordedGeneratorCall[] = [];
const generator: StructuredResumeGenerator = async (input) => {
  const recordedCall: RecordedGeneratorCall = {
    maxOutputTokens: input.maxOutputTokens,
    prompt: input.prompt,
    timeoutMs: input.timeoutMs,
  };
  if (input.validate) {
    recordedCall.validate = (output) => input.validate?.(input.schema.parse(output));
  }
  generatorCalls.push(recordedCall);
  const output = input.schema.parse(await generatorCall());
  return output;
};

const testWorkflow = createStructuredResumeReviewWorkflow({
  assemble: assembleStructuredResumeEvaluation,
  compute: computeStructuredResumeCalculation,
  generateNarrative: (input) => generateStructuredNarrative(input, generator),
  judgeAdjustments: (input, gateOutput) => judgeStructuredAdjustments(input, gateOutput, generator),
  judgeDimensionEvidence: (input) => judgeStructuredDimensionEvidence(input, generator),
  judgeHardGates: (input) => judgeStructuredHardGates(input, generator),
  validate: validateStructuredResumeInput,
});

const blueprint = {
  auxiliarySkills: [],
  compiler: {
    generatedAt: "2026-07-29T10:00:00.000Z",
    modelId: "model",
    promptVersion: "v1",
  },
  coreSkills: [],
  dimensionExpectations: {
    educationBackground: [],
    experienceRelevance: [],
    potential: [],
    projectMatch: [],
    skillMatch: [],
    stability: [],
  },
  educationExpectation: null,
  exclusionConditions: [],
  hardGateRequirements: [],
  priorityConditions: [],
  requiredRelevantExperience: null,
  requiredRelevantExperiences: [],
  schemaVersion: 1 as const,
};

const workflowInput = {
  engine: {
    modelId: "model",
    promptVersion: "prompt-v1",
    version: "engine-v1",
  },
  jobSnapshot: {
    blueprint,
    blueprintHash: "wrong",
    deductionRuleSetVersion: 1,
    evaluationMode: "structured" as const,
    jobId: "job-1",
    publishedConfig: createDefaultJobDescriptionStructuredConfig(),
  },
  resumeInput: {
    evaluationAsOf: "2026-07-29",
    resumeInputHash: "input-hash",
    resumeProfile: {
      age: null,
      educationExperiences: [],
      email: null,
      gender: null,
      name: "候选人",
      personalStrengths: [],
      phone: null,
      projectExperiences: [],
      schools: [],
      skills: [],
      targetRoles: [],
      workExperiences: [],
      workYears: null,
    },
    resumeText: null,
    runId: "run-1",
  },
};

const narrativeOutput = {
  dimensionComments: {
    educationBackground: "学历背景符合岗位现有要求。",
    experienceRelevance: "相关经验能够支撑岗位职责。",
    potential: "成长轨迹与岗位发展方向基本一致。",
    projectMatch: "项目经历与岗位场景具有关联。",
    skillMatch: "技能证据覆盖岗位核心要求。",
    stability: "任职经历未触发稳定性扣分。",
  },
  levelRecommendation: {
    level: "高级",
    rationale: "结合职责范围、项目复杂度和经验综合判断。",
  },
  overallComment: "候选人的核心能力与岗位整体匹配，主要风险可在面试中继续确认。",
  recommendation: "建议进入下一轮",
  summary: "综合条件符合岗位要求",
  teamPositioning: {
    rationale: "相关项目经验可支撑核心业务交付。",
    suggestion: "核心业务研发",
  },
};

describe("structured resume workflow contracts", () => {
  beforeEach(() => {
    generatorCall.mockReset();
    generatorCalls.length = 0;
  });

  it("rejects a blueprint hash mismatch before any Agent call", async () => {
    await expect(evaluateStructuredResume(workflowInput)).rejects.toThrow(
      "STRUCTURED_BLUEPRINT_HASH_MISMATCH",
    );
    expect(generatorCall).not.toHaveBeenCalled();
  });

  it("rejects model-owned duration, score, and grade fields", () => {
    expect(
      structuredDimensionAgentOutputSchema.safeParse({
        compositeScore: 99,
        employmentEpisodes: [],
        grade: "recommended",
        projects: [],
        relevantMonths: 120,
        ruleJudgments: [],
        skillFacts: [],
      }).success,
    ).toBe(false);
  });

  it("rejects model-owned skill deductions and requires matched education units", () => {
    const base = {
      employmentEpisodes: [],
      projects: [],
      skillFacts: [],
    };
    expect(
      structuredDimensionAgentOutputSchema.safeParse({
        ...base,
        ruleJudgments: [
          {
            dimension: "skillMatch",
            evidence: [],
            reason: "模型自行聚合技能",
            ruleId: "skill.missing_core",
            status: "matched",
            units: 99,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      structuredDimensionAgentOutputSchema.safeParse({
        ...base,
        ruleJudgments: [
          {
            dimension: "educationBackground",
            evidence: [],
            reason: "学历低于岗位门槛",
            ruleId: "education.below_tier",
            status: "matched",
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      structuredDimensionAgentOutputSchema.safeParse({
        ...base,
        ruleJudgments: [
          {
            dimension: "potential",
            evidence: [],
            reason: "普通规则不允许倍数",
            ruleId: "potential.no_growth_two_years",
            status: "matched",
            units: 2,
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      structuredDimensionAgentOutputSchema.safeParse({
        ...base,
        ruleJudgments: [],
        skillFacts: [
          {
            evidence: [],
            normalizedSkill: "TypeScript",
            reason: "声称有实操但没有引文",
            status: "applied",
          },
        ],
      }).success,
    ).toBe(false);
  });

  it("sends the versioned rule definitions and frozen skill expectations to the dimension Agent", async () => {
    generatorCall.mockResolvedValue({
      employmentEpisodes: [],
      projects: [],
      ruleJudgments: [],
      skillFacts: [],
    });
    const input = {
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprint: {
          ...blueprint,
          coreSkills: [
            {
              normalizedSkill: "TypeScript",
              requirementGroupId: "skill-group-typescript",
              satisfactionMode: "all" as const,
              sourceRef: { kind: "job_description" as const, path: "description" },
              sourceText: "熟练掌握 TypeScript",
            },
          ],
        },
      },
    };

    await judgeStructuredDimensionEvidence(input, generator);

    const prompt = generatorCalls[0]?.prompt ?? "";
    expect(prompt).toContain("扣分规则目录版本：1");
    expect(prompt).toContain("education.below_tier");
    expect(prompt).toContain("每低一个学历层级");
    expect(prompt).toContain("其余所有情况必须省略 units");
    expect(prompt).toContain("每个去重后的岗位技能必须且只能返回一个 skillFacts");
    expect(prompt).toContain("每项最多 2 条证据");
    expect(prompt).toContain("projects 只返回与岗位要求可能相关的项目");
    expect(prompt).toContain("quote 必须是声明来源中的逐字连续片段");
    expect(prompt).toContain("不得跨字段拼接");
    expect(prompt).toContain("禁止把 JSON 字段名当作 quote");
    expect(prompt).toContain("禁止使用省略号");
    expect(prompt).toContain("复制粘贴");
    expect(prompt).toContain("日期、公司、职位必须分别引用各自的字符串叶子值");
    expect(prompt).toContain("禁止自行拼成简历摘要句");
    expect(prompt).toContain("证据引用白名单");
    expect(prompt).toContain('"resume_profile":["候选人"]');
    expect(prompt).toContain('"normalizedSkill":"TypeScript"');
    expect(generatorCalls[0]?.maxOutputTokens).toBe(16_000);
    expect(generatorCalls[0]?.timeoutMs).toBe(240_000);
    const validate = generatorCalls[0]?.validate;
    expect(validate).toEqual(expect.any(Function));
    if (!validate) {
      throw new Error("expected dimension output validator");
    }
    expect(() =>
      validate({
        employmentEpisodes: [],
        projects: [],
        ruleJudgments: [],
        skillFacts: [
          {
            evidence: [{ quote: "不存在的逐字引文", source: "resume_text" }],
            normalizedSkill: "TypeScript",
            reason: "存在文本证据",
            status: "applied",
          },
          {
            evidence: [{ quote: "另一条不存在的引文", source: "resume_profile" }],
            normalizedSkill: "React",
            reason: "存在结构化证据",
            status: "applied",
          },
        ],
      }),
    ).toThrow(
      /resume_text 未找到逐字引文“不存在的逐字引文”.*resume_profile 未找到逐字引文“另一条不存在的引文”/,
    );
  });

  it("treats an omitted hard-gate requirement as failed rather than pending verification", async () => {
    generatorCall.mockResolvedValue({ judgments: [] });

    await judgeStructuredHardGates(workflowInput, generator);

    const prompt = generatorCalls[0]?.prompt ?? "";
    expect(prompt).toContain("简历没有写明或没有证据支持门槛要求时，判定 failed");
    expect(prompt).toContain("needs_verification 仅用于简历已有相关证据但证据相互冲突");
    expect(prompt).toContain("即使判断为 failed 且没有相关经历，也必须显式返回空数组");

    const omittedGate = {
      category: "other" as const,
      normalizedRequirement: "可长期驻外",
      requirementId: "gate-overseas",
      sourceRef: { kind: "hard_gate" as const, path: "hardGates.other" },
      sourceText: "可长期驻外",
    };
    const calculation = computeStructuredResumeCalculation({
      adjustmentOutput: { judgments: [] },
      dimensionOutput: {
        employmentEpisodes: [],
        projects: [],
        ruleJudgments: [],
        skillFacts: [],
      },
      gateOutput: { judgments: [] },
      workflowInput: {
        ...workflowInput,
        jobSnapshot: {
          ...workflowInput.jobSnapshot,
          blueprint: {
            ...blueprint,
            hardGateRequirements: [omittedGate],
          },
        },
      },
    });
    expect(calculation.calculation.gates.judgments[0]).toMatchObject({
      aiStatus: "failed",
    });
  });

  it("reduces a model-composed evidence sentence to a long exact source fragment", async () => {
    const output = {
      employmentEpisodes: [],
      projects: [
        {
          current: true,
          endMonth: null,
          evidence: [
            {
              quote: "统筹应用商店分发与多渠道获客，策划并落地用户增长活动",
              source: "resume_text",
            },
          ],
          id: "project-1",
          relevant: true,
        },
      ],
      ruleJudgments: [],
      skillFacts: [],
    };
    const validatingGenerator: StructuredResumeGenerator = (input) => {
      const parsed = input.schema.parse(output);
      input.validate?.(parsed);
      return Promise.resolve(parsed);
    };

    const result = await judgeStructuredDimensionEvidence(
      {
        ...workflowInput,
        resumeInput: {
          ...workflowInput.resumeInput,
          resumeText: "统筹应用商店分发与多渠道获客，端内预装及外部投放。",
        },
      },
      validatingGenerator,
    );

    expect(result.projects[0]?.evidence).toEqual([
      { quote: "统筹应用商店分发与多渠道获客", source: "resume_text" },
    ]);
  });

  it("requires qualifying episodes for every returned numeric experience gate", async () => {
    const experienceGate = {
      category: "work_experience" as const,
      normalizedRequirement: "3年以上团队管理经验",
      requirementId: "gate-management",
      sourceRef: { kind: "hard_gate" as const, path: "hardGates.workExperience" },
      sourceText: "3年以上团队管理经验",
    };
    const input = {
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprint: {
          ...blueprint,
          hardGateRequirements: [experienceGate],
        },
      },
    };
    generatorCall.mockResolvedValue({ judgments: [] });

    await judgeStructuredHardGates(input, generator);

    const validate = generatorCalls[0]?.validate;
    if (!validate) {
      throw new Error("expected hard-gate output validator");
    }
    expect(() => validate({ judgments: [] })).not.toThrow();
    expect(() =>
      validate({
        judgments: [
          {
            aiStatus: "failed",
            evidence: [],
            reason: "管理经验不足",
            requirementId: experienceGate.requirementId,
          },
        ],
      }),
    ).not.toThrow();
    expect(() =>
      validate({
        judgments: [
          {
            aiStatus: "passed",
            evidence: [],
            reason: "声称经验达标但未返回经历段",
            requirementId: experienceGate.requirementId,
          },
        ],
      }),
    ).toThrow("experienceEpisodes");
    expect(() =>
      validate({
        judgments: [
          {
            aiStatus: "failed",
            evidence: [],
            experienceEpisodes: [],
            reason: "没有明确管理经历",
            requirementId: experienceGate.requirementId,
          },
        ],
      }),
    ).not.toThrow();

    const calculation = computeStructuredResumeCalculation({
      adjustmentOutput: { judgments: [] },
      dimensionOutput: {
        employmentEpisodes: [],
        projects: [],
        ruleJudgments: [],
        skillFacts: [],
      },
      gateOutput: { judgments: [] },
      workflowInput: input,
    });
    expect(
      calculation.dimensionRuleJudgments.experienceRelevance.find(
        (item) => item.ruleId === "experience.missing_year",
      ),
    ).toMatchObject({
      status: "matched",
      units: 3,
    });
  });

  it("derives temporal families in code from normalized facts", () => {
    const judgments = deriveStructuredRuleJudgments(workflowInput, {
      employmentEpisodes: [
        {
          current: false,
          endMonth: "2025-01",
          evidence: [],
          gapExplanation: null,
          id: "job-a",
          primaryStatus: "primary",
          relevance: "relevant",
          relevanceReason: "总工作经历",
          startMonth: "2024-01",
        },
        {
          current: true,
          endMonth: null,
          evidence: [],
          gapExplanation: null,
          id: "job-b",
          primaryStatus: "primary",
          relevance: "relevant",
          relevanceReason: "总工作经历",
          startMonth: "2025-03",
        },
      ],
      projects: [],
      ruleJudgments: [],
      skillFacts: [],
    });

    expect(
      judgments.stability.find((item) => item.ruleId === "stability.two_changes_two_years")?.status,
    ).toBe("not_matched");
    expect(
      judgments.experienceRelevance.find((item) => item.ruleId === "experience.missing_year")
        ?.status,
    ).toBe("not_applicable");
  });

  it("normalizes semantic rule judgments to one complete product-owned catalog", () => {
    const judgments = deriveStructuredRuleJudgments(workflowInput, {
      employmentEpisodes: [],
      projects: [],
      ruleJudgments: [
        {
          dimension: "potential",
          evidence: [],
          reason: "第一次返回",
          ruleId: "potential.no_growth_two_years",
          status: "not_matched",
          units: 2,
        },
        {
          dimension: "potential",
          evidence: [],
          reason: "重复返回",
          ruleId: "potential.no_growth_two_years",
          status: "matched",
        },
      ],
      skillFacts: [],
    });
    const all = Object.values(judgments).flat();

    expect(all.filter((item) => item.ruleId === "potential.no_growth_two_years")).toHaveLength(1);
    expect(all.find((item) => item.ruleId === "potential.no_growth_two_years")).not.toHaveProperty(
      "units",
    );
    expect(all.filter((item) => item.ruleId === "skill.missing_core")).toEqual([
      expect.objectContaining({ status: "not_applicable" }),
    ]);
    expect(new Set(all.map((item) => item.ruleId)).size).toBe(23);
  });

  it("derives mutually exclusive skill deductions and direct-zero only from frozen expectations", () => {
    const input = {
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprint: {
          ...blueprint,
          auxiliarySkills: [
            {
              normalizedSkill: "Redis",
              requirementGroupId: "skill-group-redis-auxiliary",
              satisfactionMode: "all" as const,
              sourceRef: { kind: "job_description" as const, path: "description" },
              sourceText: "熟悉 Redis 优先",
            },
          ],
          coreSkills: [
            {
              normalizedSkill: "TypeScript",
              requirementGroupId: "skill-group-typescript",
              satisfactionMode: "all" as const,
              sourceRef: { kind: "job_description" as const, path: "description" },
              sourceText: "熟练掌握 TypeScript",
            },
            {
              normalizedSkill: "Redis",
              requirementGroupId: "skill-group-redis-core",
              satisfactionMode: "all" as const,
              sourceRef: { kind: "hard_gate" as const, path: "hardGates.requiredSkills" },
              sourceText: "必须掌握 Redis",
            },
          ],
        },
      },
    };

    const judgments = deriveStructuredRuleJudgments(input, {
      employmentEpisodes: [],
      projects: [],
      ruleJudgments: [],
      skillFacts: [
        {
          evidence: [],
          normalizedSkill: "TypeScript",
          reason: "只有概念描述",
          status: "shallow",
        },
        {
          evidence: [],
          normalizedSkill: "Redis",
          reason: "简历未体现",
          status: "missing",
        },
      ],
    }).skillMatch;

    expect(judgments.find((item) => item.ruleId === "skill.missing_core")).toMatchObject({
      status: "matched",
      units: 1,
    });
    expect(judgments.find((item) => item.ruleId === "skill.missing_auxiliary")).toMatchObject({
      status: "not_applicable",
    });
    expect(judgments.find((item) => item.ruleId === "skill.shallow")).toMatchObject({
      status: "matched",
      units: 1,
    });
    expect(judgments.find((item) => item.ruleId === "skill.no_related_skill")).toMatchObject({
      status: "not_matched",
    });
  });

  it("counts an any-satisfaction skill group once and waives missing alternatives when one is applied", () => {
    const anyGroupSkills = ["React", "Vue"].map((normalizedSkill) => ({
      normalizedSkill,
      requirementGroupId: "skill-group-frontend-framework",
      satisfactionMode: "any" as const,
      sourceRef: { kind: "job_description" as const, path: "description" },
      sourceText: "熟悉 React 或 Vue 任一框架",
    }));
    const input = {
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprint: { ...blueprint, coreSkills: anyGroupSkills },
      },
    };
    const facts = {
      employmentEpisodes: [],
      projects: [],
      ruleJudgments: [],
      skillFacts: [
        {
          evidence: [],
          normalizedSkill: "React",
          reason: "简历未体现 React",
          status: "missing" as const,
        },
        {
          evidence: [{ quote: "Vue", source: "resume_text" as const }],
          normalizedSkill: "Vue",
          reason: "项目中使用 Vue",
          status: "applied" as const,
        },
      ],
    };

    const satisfied = deriveStructuredRuleJudgments(input, facts).skillMatch;
    expect(satisfied.find((item) => item.ruleId === "skill.missing_core")).toMatchObject({
      status: "not_matched",
    });

    const missing = deriveStructuredRuleJudgments(input, {
      ...facts,
      skillFacts: facts.skillFacts.map((fact) => ({
        ...fact,
        evidence: [],
        status: "missing" as const,
      })),
    }).skillMatch;
    expect(missing.find((item) => item.ruleId === "skill.missing_core")).toMatchObject({
      status: "matched",
      units: 1,
    });
  });

  it("uses required-skill gate judgments as the authoritative facts for gate-derived skills", () => {
    const tsGate = {
      category: "required_skills" as const,
      normalizedRequirement: "精通 TS/JS",
      requirementId: "gate-ts",
      sourceRef: { kind: "hard_gate" as const, path: "hardGates.requiredSkills" },
      sourceText: "精通 TS/JS",
    };
    const h5Gate = {
      category: "required_skills" as const,
      normalizedRequirement: "熟悉 H5 互动",
      requirementId: "gate-h5",
      sourceRef: { kind: "hard_gate" as const, path: "hardGates.requiredSkills" },
      sourceText: "熟悉 H5 互动",
    };
    const nodeGate = {
      category: "required_skills" as const,
      normalizedRequirement: "熟练 Node.js",
      requirementId: "gate-node",
      sourceRef: { kind: "hard_gate" as const, path: "hardGates.requiredSkills" },
      sourceText: "熟练 Node.js",
    };
    const input = {
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprint: {
          ...blueprint,
          coreSkills: [
            {
              normalizedSkill: "TS/JS",
              requirementGroupId: "skill-group-ts-js",
              satisfactionMode: "all" as const,
              sourceRef: tsGate.sourceRef,
              sourceText: tsGate.sourceText,
            },
            {
              normalizedSkill: "H5 互动",
              requirementGroupId: "skill-group-h5",
              satisfactionMode: "all" as const,
              sourceRef: h5Gate.sourceRef,
              sourceText: h5Gate.sourceText,
            },
            {
              normalizedSkill: "Node.js",
              requirementGroupId: "skill-group-node",
              satisfactionMode: "all" as const,
              sourceRef: nodeGate.sourceRef,
              sourceText: nodeGate.sourceText,
            },
          ],
          hardGateRequirements: [tsGate, h5Gate, nodeGate],
        },
      },
      resumeInput: {
        ...workflowInput.resumeInput,
        resumeText: "React、H5、Node.js",
      },
    };

    const calculationResult = computeStructuredResumeCalculation({
      adjustmentOutput: { judgments: [] },
      dimensionOutput: {
        employmentEpisodes: [],
        projects: [],
        ruleJudgments: [],
        skillFacts: [
          {
            evidence: [{ quote: "React", source: "resume_text" }],
            normalizedSkill: "TS/JS",
            reason: "模型仅凭相邻框架误判为已应用",
            status: "applied",
          },
          {
            evidence: [{ quote: "H5", source: "resume_text" }],
            normalizedSkill: "H5 互动",
            reason: "模型仅凭 H5 误判为已应用",
            status: "applied",
          },
          {
            evidence: [{ quote: "Node.js", source: "resume_text" }],
            normalizedSkill: "Node.js",
            reason: "维度模型声称已应用，但门槛模型遗漏了该要求",
            status: "applied",
          },
        ],
      },
      gateOutput: {
        judgments: [
          {
            aiStatus: "failed",
            evidence: [{ quote: "React", source: "resume_text" }],
            reason: "未体现 TS/JS",
            requirementId: "gate-ts",
          },
          {
            aiStatus: "needs_verification",
            evidence: [{ quote: "H5", source: "resume_text" }],
            reason: "只有 H5，未体现互动经验",
            requirementId: "gate-h5",
          },
        ],
      },
      workflowInput: input,
    });
    const judgments = calculationResult.dimensionRuleJudgments.skillMatch;

    expect(judgments.find((item) => item.ruleId === "skill.missing_core")).toMatchObject({
      status: "matched",
      units: 2,
    });
    expect(judgments.find((item) => item.ruleId === "skill.shallow")).toMatchObject({
      status: "matched",
      units: 1,
    });
    expect(calculationResult.skillAssessments).toEqual([
      {
        evidence: [{ quote: "React", source: "resume_text" }],
        expectationType: "core",
        normalizedSkill: "TS/JS",
        reason: "沿用同一必备技能的门槛判断：未体现 TS/JS",
        requirementGroupId: "skill-group-ts-js",
        satisfactionMode: "all",
        sourceRef: tsGate.sourceRef,
        sourceText: tsGate.sourceText,
        status: "missing",
      },
      {
        evidence: [{ quote: "H5", source: "resume_text" }],
        expectationType: "core",
        normalizedSkill: "H5 互动",
        reason: "沿用同一必备技能的门槛判断：只有 H5，未体现互动经验",
        requirementGroupId: "skill-group-h5",
        satisfactionMode: "all",
        sourceRef: h5Gate.sourceRef,
        sourceText: h5Gate.sourceText,
        status: "shallow",
      },
      {
        evidence: [],
        expectationType: "core",
        normalizedSkill: "Node.js",
        reason: "硬性门槛模型未返回该必备技能，按未命中处理。",
        requirementGroupId: "skill-group-node",
        satisfactionMode: "all",
        sourceRef: nodeGate.sourceRef,
        sourceText: nodeGate.sourceText,
        status: "missing",
      },
    ]);
    const artifact = assembleStructuredResumeEvaluation({
      calculationResult,
      narrative: narrativeOutput,
      workflowInput: input,
    });
    expect(artifact.skillAssessments).toEqual(calculationResult.skillAssessments);
    expect(
      structuredResumeEvaluationV1Schema.safeParse({
        ...artifact,
        skillAssessments: artifact.skillAssessments.slice(1),
      }).success,
    ).toBe(false);
  });

  it("does not treat team sizes above an explicit range as satisfying that gate", () => {
    const teamSizeGate = {
      category: "other" as const,
      normalizedRequirement: "带过3-6人技术小组",
      requirementId: "gate-team-size",
      sourceRef: { kind: "hard_gate" as const, path: "hardGates.other" },
      sourceText: "带过3-6人技术小组",
    };
    const calculation = computeStructuredResumeCalculation({
      adjustmentOutput: { judgments: [] },
      dimensionOutput: {
        employmentEpisodes: [],
        projects: [],
        ruleJudgments: [],
        skillFacts: [],
      },
      gateOutput: {
        judgments: [
          {
            aiStatus: "passed",
            evidence: [
              {
                quote: "担任直播(8人)、寿险培训改革组长(12人)",
                source: "resume_text",
              },
            ],
            reason: "带领过更大团队",
            requirementId: teamSizeGate.requirementId,
          },
        ],
      },
      workflowInput: {
        ...workflowInput,
        jobSnapshot: {
          ...workflowInput.jobSnapshot,
          blueprint: {
            ...blueprint,
            hardGateRequirements: [teamSizeGate],
          },
        },
        resumeInput: {
          ...workflowInput.resumeInput,
          resumeText: "担任直播(8人)、寿险培训改革组长(12人)",
        },
      },
    });

    expect(calculation.calculation.gates.judgments[0]).toMatchObject({
      aiStatus: "failed",
      reason: expect.stringContaining("3-6"),
    });
  });

  it("deducts missing years across distinct frozen experience requirements", () => {
    const frontendGate = {
      category: "work_experience" as const,
      normalizedRequirement: "8年以上前端研发经验",
      requirementId: "gate-frontend-years",
      sourceRef: { kind: "hard_gate" as const, path: "hardGates.workExperience" },
      sourceText: "8年以上前端研发经验",
    };
    const managementGate = {
      category: "work_experience" as const,
      normalizedRequirement: "3年以上团队管理经验",
      requirementId: "gate-management-years",
      sourceRef: { kind: "hard_gate" as const, path: "hardGates.workExperience" },
      sourceText: "3年以上团队管理经验",
    };
    const duplicateManagementGate = {
      category: "work_experience" as const,
      normalizedRequirement: "团队管理相关经验至少3年",
      requirementId: "gate-management-years-duplicate",
      sourceRef: { kind: "hard_gate" as const, path: "hardGates.workExperience" },
      sourceText: "团队管理相关经验至少3年",
    };
    const gateOutput = {
      judgments: [
        {
          aiStatus: "passed" as const,
          evidence: [],
          experienceEpisodes: [
            {
              current: false,
              endMonth: "2025-12",
              evidence: [],
              startMonth: "2015-01",
            },
          ],
          reason: "前端研发经验超过8年",
          requirementId: frontendGate.requirementId,
        },
        {
          aiStatus: "passed" as const,
          evidence: [],
          experienceEpisodes: [
            {
              current: false,
              endMonth: "2021-05",
              evidence: [],
              startMonth: "2018-08",
            },
          ],
          reason: "团队管理经验约2年9个月",
          requirementId: managementGate.requirementId,
        },
        {
          aiStatus: "passed" as const,
          evidence: [],
          experienceEpisodes: [
            {
              current: false,
              endMonth: "2021-05",
              evidence: [],
              startMonth: "2018-08",
            },
          ],
          reason: "同义的团队管理要求",
          requirementId: duplicateManagementGate.requirementId,
        },
      ],
    };
    const calculation = computeStructuredResumeCalculation({
      adjustmentOutput: { judgments: [] },
      dimensionOutput: {
        employmentEpisodes: [
          {
            current: false,
            endMonth: "2025-12",
            evidence: [],
            gapExplanation: null,
            id: "frontend",
            primaryStatus: "primary",
            relevance: "relevant",
            relevanceReason: "前端研发经历",
            startMonth: "2015-01",
          },
        ],
        projects: [],
        ruleJudgments: [
          {
            dimension: "experienceRelevance",
            evidence: [],
            reason: "行业相关",
            ruleId: "experience.industry_unrelated",
            status: "not_matched",
          },
          {
            dimension: "experienceRelevance",
            evidence: [],
            reason: "经历连续",
            ruleId: "experience.fragmented",
            status: "not_matched",
          },
        ],
        skillFacts: [],
      },
      gateOutput,
      workflowInput: {
        ...workflowInput,
        jobSnapshot: {
          ...workflowInput.jobSnapshot,
          blueprint: {
            ...blueprint,
            dimensionExpectations: {
              ...blueprint.dimensionExpectations,
              experienceRelevance: [
                {
                  expectation: "8年以上前端研发经验，3年以上团队管理经验",
                  sourceRef: { kind: "hard_gate" as const, path: "hardGates.workExperience" },
                  sourceText: "8年以上前端研发经验；3年以上团队管理经验",
                },
              ],
            },
            hardGateRequirements: [frontendGate, managementGate, duplicateManagementGate],
            requiredRelevantExperience: {
              relevanceScope: "role" as const,
              scopeDescription: "前端研发经验",
              sourceRef: { kind: "hard_gate" as const, path: "hardGates.workExperience" },
              sourceText: frontendGate.sourceText,
              years: 8,
            },
          },
        },
      },
    });

    expect(
      calculation.dimensionRuleJudgments.experienceRelevance.find(
        (item) => item.ruleId === "experience.missing_year",
      ),
    ).toMatchObject({ status: "matched", units: 1 });
    expect(calculation.calculation.dimensions.experienceRelevance).toMatchObject({
      deductionTotal: 9,
      rawScore: 91,
    });
    expect(
      calculation.calculation.gates.judgments.find(
        (item) => item.requirementId === managementGate.requirementId,
      ),
    ).toMatchObject({
      aiStatus: "failed",
      reason: expect.stringContaining("少于岗位要求"),
    });
  });

  it("treats a linked team-size gate as part of the management-experience scoring scope", () => {
    const managementGate = {
      category: "work_experience" as const,
      normalizedRequirement: "3年以上团队管理经验",
      requirementId: "gate-management-years",
      sourceRef: { kind: "hard_gate" as const, path: "hardGates.workExperience" },
      sourceText: "3年以上团队管理经验",
    };
    const teamSizeGate = {
      category: "work_experience" as const,
      normalizedRequirement: "带过3-6人技术小组",
      requirementId: "gate-team-size",
      sourceRef: { kind: "hard_gate" as const, path: "hardGates.workExperience" },
      sourceText: "带过3-6人技术小组",
    };
    const input = {
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprint: {
          ...blueprint,
          dimensionExpectations: {
            ...blueprint.dimensionExpectations,
            experienceRelevance: [
              {
                expectation: "3年以上团队管理经验",
                sourceRef: { kind: "job_description" as const, path: "description" },
                sourceText: "3年以上团队管理经验",
              },
              {
                expectation: "带过3-6人技术小组",
                sourceRef: { kind: "job_description" as const, path: "description" },
                sourceText: "带过3-6人技术小组",
              },
            ],
          },
          hardGateRequirements: [managementGate, teamSizeGate],
          requiredRelevantExperience: {
            relevanceScope: "capability" as const,
            scopeDescription: "团队管理经验",
            sourceRef: { kind: "hard_gate" as const, path: "hardGates.workExperience" },
            sourceText: managementGate.sourceText,
            years: 3,
          },
        },
      },
      resumeInput: {
        ...workflowInput.resumeInput,
        resumeText: "担任直播(8人)、寿险培训改革组长(12人),负责日常管理工作。",
      },
    };
    const calculation = computeStructuredResumeCalculation({
      adjustmentOutput: { judgments: [] },
      dimensionOutput: {
        employmentEpisodes: [],
        projects: [],
        ruleJudgments: [
          {
            dimension: "experienceRelevance",
            evidence: [],
            reason: "职业路径连续",
            ruleId: "experience.fragmented",
            status: "not_matched",
          },
          {
            dimension: "experienceRelevance",
            evidence: [],
            reason: "行业相关",
            ruleId: "experience.industry_unrelated",
            status: "not_matched",
          },
        ],
        skillFacts: [],
      },
      gateOutput: {
        judgments: [
          {
            aiStatus: "passed",
            evidence: [
              {
                quote: "担任直播(8人)、寿险培训改革组长(12人)",
                source: "resume_text",
              },
            ],
            experienceEpisodes: [
              {
                current: false,
                endMonth: "2021-05",
                evidence: [
                  {
                    quote: "担任直播(8人)、寿险培训改革组长(12人)",
                    source: "resume_text",
                  },
                ],
                startMonth: "2018-08",
              },
            ],
            reason: "有团队管理经历",
            requirementId: managementGate.requirementId,
          },
          {
            aiStatus: "passed",
            evidence: [
              {
                quote: "担任直播(8人)、寿险培训改革组长(12人)",
                source: "resume_text",
              },
            ],
            reason: "带过更大的团队",
            requirementId: teamSizeGate.requirementId,
          },
        ],
      },
      workflowInput: input,
    });

    expect(
      calculation.dimensionRuleJudgments.experienceRelevance.find(
        (item) => item.ruleId === "experience.missing_year",
      ),
    ).toMatchObject({
      status: "matched",
      units: 3,
    });
    expect(calculation.calculation.dimensions.experienceRelevance.rawScore).toBe(73);
  });

  it("scores every JD experience threshold instead of only the highest-year requirement", () => {
    const frontendRequirement = {
      relevanceScope: "role" as const,
      requirementId: "experience-frontend",
      scopeDescription: "前端开发",
      sourceRef: { kind: "job_description" as const, path: "prompt" },
      sourceText: "8 年以上前端开发经验",
      years: 8,
    };
    const managementRequirement = {
      relevanceScope: "capability" as const,
      requirementId: "experience-management",
      scopeDescription: "团队管理",
      sourceRef: { kind: "job_description" as const, path: "prompt" },
      sourceText: "3 年以上团队管理经验",
      years: 3,
    };
    const input = {
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprint: {
          ...blueprint,
          requiredRelevantExperience: frontendRequirement,
          requiredRelevantExperiences: [frontendRequirement, managementRequirement],
        },
      },
    };
    const facts = {
      employmentEpisodes: [
        {
          current: true,
          endMonth: null,
          evidence: [],
          gapExplanation: null,
          id: "frontend",
          primaryStatus: "primary" as const,
          relevance: "relevant" as const,
          relevanceReason: "前端开发经历",
          startMonth: "2018-07",
        },
      ],
      projects: [],
      ruleJudgments: [],
      skillFacts: [],
    };
    const gateOutput = {
      judgments: [
        {
          aiStatus: "passed" as const,
          evidence: [],
          experienceEpisodes: [
            { current: true, endMonth: null, evidence: [], startMonth: "2018-07" },
          ],
          reason: "前端经验达到要求",
          requirementId: frontendRequirement.requirementId,
        },
        {
          aiStatus: "failed" as const,
          evidence: [],
          experienceEpisodes: [
            { current: true, endMonth: null, evidence: [], startMonth: "2025-07" },
          ],
          reason: "管理经验只有一年",
          requirementId: managementRequirement.requirementId,
        },
      ],
    };

    const judgments = deriveStructuredRuleJudgments(input, facts, gateOutput);

    expect(
      judgments.experienceRelevance.find(
        (judgment) => judgment.ruleId === "experience.missing_year",
      ),
    ).toMatchObject({ status: "matched", units: 2 });
  });

  it("derives education-level deductions from the resume profile instead of a conflicting model judgment", () => {
    const educationGate = {
      category: "education" as const,
      normalizedRequirement: "本科及以上学历",
      requirementId: "gate-education",
      sourceRef: { kind: "hard_gate" as const, path: "hardGates.education" },
      sourceText: "本科及以上学历",
    };
    const input = {
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprint: {
          ...blueprint,
          educationExpectation: {
            degreeLevel: "bachelor" as const,
            majorExpectation: null,
            sourceRef: { kind: "hard_gate" as const, path: "hardGates.education" },
            sourceText: "本科及以上学历",
          },
          hardGateRequirements: [educationGate],
        },
      },
      resumeInput: {
        ...workflowInput.resumeInput,
        resumeProfile: {
          ...workflowInput.resumeInput.resumeProfile,
          educationExperiences: [
            {
              degree: null,
              educationLevel: "大专",
              graduationYear: null,
              major: "计算机",
              period: null,
              school: "测试学院",
              summary: null,
            },
          ],
        },
      },
    };
    const judgments = deriveStructuredRuleJudgments(input, {
      employmentEpisodes: [],
      projects: [],
      ruleJudgments: [
        {
          dimension: "educationBackground",
          evidence: [],
          reason: "模型错误判断学历已达标",
          ruleId: "education.below_tier",
          status: "not_matched",
        },
      ],
      skillFacts: [],
    });

    expect(
      judgments.educationBackground.find((item) => item.ruleId === "education.below_tier"),
    ).toMatchObject({
      evidence: [{ quote: "大专", source: "resume_profile" }],
      status: "matched",
      units: 1,
    });

    const calculation = computeStructuredResumeCalculation({
      adjustmentOutput: { judgments: [] },
      dimensionOutput: {
        employmentEpisodes: [],
        projects: [],
        ruleJudgments: [],
        skillFacts: [],
      },
      gateOutput: {
        judgments: [
          {
            aiStatus: "passed",
            evidence: [{ quote: "大专", source: "resume_profile" }],
            reason: "模型错误地判定学历达标",
            requirementId: educationGate.requirementId,
          },
        ],
      },
      workflowInput: input,
    });
    expect(calculation.calculation.gates.judgments[0]).toMatchObject({
      aiStatus: "failed",
      reason: expect.stringContaining("低于岗位要求"),
    });
  });

  it("gives adjustment judging the completed gate context and conjunctive-condition rule", async () => {
    generatorCall.mockResolvedValue({ judgments: [] });

    await judgeStructuredAdjustments(
      workflowInput,
      {
        judgments: [
          {
            aiStatus: "failed",
            evidence: [],
            reason: "未体现可常驻海外",
            requirementId: "gate-overseas",
          },
        ],
      },
      generator,
    );

    const prompt = generatorCalls[0]?.prompt ?? "";
    expect(prompt).toContain("逗号、分号、且、并、同时连接的子条件默认按 AND");
    expect(prompt).toContain("只有所有 AND 子条件均有明确证据时");
    expect(prompt).toContain("“等”表示列举项是同类示例而非穷举");
    expect(prompt).toContain('"requirementId":"gate-overseas"');
    expect(prompt).toContain('"aiStatus":"failed"');
    expect(generatorCalls[0]?.timeoutMs).toBe(240_000);
  });

  it("tells the narrative Agent to explain only actually applied adjustment points", async () => {
    generatorCall.mockResolvedValue(narrativeOutput);
    const calculationResult = computeStructuredResumeCalculation({
      adjustmentOutput: { judgments: [] },
      dimensionOutput: {
        employmentEpisodes: [],
        projects: [],
        ruleJudgments: [],
        skillFacts: [],
      },
      gateOutput: { judgments: [] },
      workflowInput,
    });

    await generateStructuredNarrative({ calculationResult, workflowInput }, generator);

    const prompt = generatorCalls[0]?.prompt ?? "";
    expect(prompt).toContain("未命中的优先条件 appliedPoints=0，不加分也不扣分");
    expect(prompt).toContain("只解释 appliedPoints 实际非零的加减分");
    expect(prompt).toContain("门槛状态不改变代码给出的分数等级");
    expect(prompt).toContain("dimensions.weightedContribution 的单位是分");
    expect(prompt).toContain("dimensionComments 必须覆盖六个维度");
    expect(prompt).toContain("只概括候选人在该维度的整体表现");
    expect(prompt).toContain("不要输出规则名称、规则编号或逐项规则状态");
    expect(prompt).toContain("不得复述综合分、等级、门槛状态或推荐结论");
    expect(prompt).toContain("units=1 时只能表述为一项");
    expect(prompt).toContain("teamPositioning.suggestion");
    expect(prompt).toContain("levelRecommendation.level");
    expect(prompt).toContain('"ruleJudgments":');
    expect(prompt).toContain('"weightedContribution":');
    expect(prompt).not.toContain("weightedContributionHundredths");
    expect(generatorCalls[0]?.timeoutMs).toBe(240_000);
  });

  it("replaces a factually inconsistent narrative with a deterministic explanation", () => {
    const gateRequirements = Array.from({ length: 12 }, (_, index) => ({
      category: "other" as const,
      normalizedRequirement: `门槛${index + 1}`,
      requirementId: `gate-${index + 1}`,
      sourceRef: { kind: "hard_gate" as const, path: "hardGates.other" },
      sourceText: `门槛${index + 1}`,
    }));
    const input = {
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprint: {
          ...blueprint,
          hardGateRequirements: gateRequirements,
        },
      },
    };
    const calculationResult = computeStructuredResumeCalculation({
      adjustmentOutput: { judgments: [] },
      dimensionOutput: {
        employmentEpisodes: [],
        projects: [],
        ruleJudgments: [],
        skillFacts: [],
      },
      gateOutput: {
        judgments: gateRequirements.map((gate, index) => ({
          aiStatus: index < 4 ? ("failed" as const) : ("passed" as const),
          evidence: [],
          reason: index < 4 ? "没有证据" : "已有证据",
          requirementId: gate.requirementId,
        })),
      },
      workflowInput: input,
    });

    const artifact = assembleStructuredResumeEvaluation({
      calculationResult,
      narrative: {
        ...narrativeOutput,
        recommendation: "匹配",
        summary: "7项门槛中3项未通过。",
      },
      workflowInput: input,
    });

    expect(artifact.narrative.summary).toContain("共评估12项硬性门槛，其中4项未通过");
    expect(artifact.narrative.summary).not.toContain("7项门槛中3项未通过");
  });

  it("rejects narrative contributions that treat stored hundredths as display points", () => {
    const calculationResult = computeStructuredResumeCalculation({
      adjustmentOutput: { judgments: [] },
      dimensionOutput: {
        employmentEpisodes: [],
        projects: [],
        ruleJudgments: [],
        skillFacts: [],
      },
      gateOutput: { judgments: [] },
      workflowInput,
    });

    const artifact = assembleStructuredResumeEvaluation({
      calculationResult,
      narrative: {
        ...narrativeOutput,
        recommendation: "推荐",
        summary: "技能维度加权贡献3500分。",
      },
      workflowInput,
    });

    expect(artifact.narrative.summary).toContain("六维评分：");
    expect(artifact.narrative.summary).not.toContain("加权贡献3500分");
  });

  it("marks job-benchmark rules not applicable when the blueprint has no benchmark", () => {
    const judgments = deriveStructuredRuleJudgments(workflowInput, {
      employmentEpisodes: [],
      projects: [],
      ruleJudgments: [],
      skillFacts: [],
    });

    expect(
      judgments.educationBackground.find((item) => item.ruleId === "education.below_tier"),
    ).toMatchObject({ status: "not_applicable" });
    expect(
      judgments.experienceRelevance.find((item) => item.ruleId === "experience.industry_unrelated"),
    ).toMatchObject({ status: "not_applicable" });
    expect(
      judgments.projectMatch.find((item) => item.ruleId === "project.no_relevant_project"),
    ).toMatchObject({ status: "not_applicable" });
  });

  it("omits disabled job deduction rules from the persisted judgments", () => {
    const publishedConfig = createDefaultJobDescriptionStructuredConfig();
    publishedConfig.deductionRules["stability.short_tenure"] = {
      enabled: false,
      points: 12,
    };

    const judgments = deriveStructuredRuleJudgments(
      {
        ...workflowInput,
        jobSnapshot: {
          ...workflowInput.jobSnapshot,
          publishedConfig,
        },
      },
      {
        employmentEpisodes: [],
        projects: [],
        ruleJudgments: [],
        skillFacts: [],
      },
    );

    expect(judgments.stability.some((item) => item.ruleId === "stability.short_tenure")).toBe(
      false,
    );
  });

  it("derives no-relevant-project from the normalized project facts instead of a conflicting model judgment", () => {
    const input = {
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprint: {
          ...blueprint,
          dimensionExpectations: {
            ...blueprint.dimensionExpectations,
            projectMatch: [
              {
                expectation: "负责高并发业务项目",
                sourceRef: { kind: "job_description" as const, path: "description" },
                sourceText: "负责高并发业务项目",
              },
            ],
          },
        },
      },
    };
    const judgments = deriveStructuredRuleJudgments(input, {
      employmentEpisodes: [],
      projects: [],
      ruleJudgments: [
        {
          dimension: "projectMatch",
          evidence: [],
          reason: "模型错误判断存在相关项目",
          ruleId: "project.no_relevant_project",
          status: "not_matched",
        },
      ],
      skillFacts: [],
    });

    expect(
      judgments.projectMatch.find((item) => item.ruleId === "project.no_relevant_project"),
    ).toMatchObject({
      status: "matched",
    });
    expect(
      judgments.projectMatch.find((item) => item.ruleId === "project.edge_participation"),
    ).toMatchObject({
      status: "not_applicable",
    });
    expect(
      judgments.projectMatch.find((item) => item.ruleId === "project.old_relevant_project"),
    ).toMatchObject({
      status: "not_applicable",
    });
  });

  it("does not deduct project freshness when an undated relevant project could change the outcome", () => {
    const judgments = deriveStructuredRuleJudgments(
      {
        ...workflowInput,
        jobSnapshot: {
          ...workflowInput.jobSnapshot,
          blueprint: {
            ...blueprint,
            dimensionExpectations: {
              ...blueprint.dimensionExpectations,
              projectMatch: [
                {
                  expectation: "负责高并发业务项目",
                  sourceRef: { kind: "job_description" as const, path: "description" },
                  sourceText: "负责高并发业务项目",
                },
              ],
            },
          },
        },
      },
      {
        employmentEpisodes: [],
        projects: [
          {
            current: false,
            endMonth: "2022-01",
            evidence: [],
            id: "old",
            relevant: true,
          },
          {
            current: false,
            endMonth: null,
            evidence: [],
            id: "undated",
            relevant: true,
          },
        ],
        ruleJudgments: [],
        skillFacts: [],
      },
    );

    expect(
      judgments.projectMatch.find((item) => item.ruleId === "project.old_relevant_project"),
    ).toMatchObject({ status: "insufficient_evidence" });
  });

  it("executes semantic judgment, code scoring, narrative, and assembly as real steps", async () => {
    generatorCall
      .mockResolvedValueOnce({ judgments: [] })
      .mockResolvedValueOnce({
        employmentEpisodes: [],
        projects: [],
        ruleJudgments: [],
        skillFacts: [],
      })
      .mockResolvedValueOnce({ judgments: [] })
      .mockResolvedValueOnce(narrativeOutput);

    const result = await runStructuredResumeReviewWorkflow(
      {
        ...workflowInput,
        jobSnapshot: {
          ...workflowInput.jobSnapshot,
          blueprintHash: computeJobEvaluationPayloadHash(blueprint),
        },
      },
      testWorkflow,
    );

    expect(generatorCall).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({
      calculations: { compositeScore: 93 },
      grade: "recommended",
      narrative: {
        dimensionComments: narrativeOutput.dimensionComments,
        levelRecommendation: narrativeOutput.levelRecommendation,
        overallComment: narrativeOutput.overallComment,
        recommendation: "推荐",
        summary: "综合评分93分，等级为推荐；硬性门槛通过。综合条件符合岗位要求",
        teamPositioning: narrativeOutput.teamPositioning,
      },
    });
  });

  it("preserves a readable error when Mastra serializes a failed workflow step", async () => {
    generatorCall.mockRejectedValueOnce(new Error("STRUCTURED_RESUME_EVIDENCE_MISMATCH"));

    const rejection = runStructuredResumeReviewWorkflow(
      {
        ...workflowInput,
        jobSnapshot: {
          ...workflowInput.jobSnapshot,
          blueprintHash: computeJobEvaluationPayloadHash(blueprint),
        },
      },
      testWorkflow,
    );

    await expect(rejection).rejects.toBeInstanceOf(Error);
    await expect(rejection).rejects.toThrow("STRUCTURED_RESUME_EVIDENCE_MISMATCH");
  });

  it("normalizes resolved episodes as relevant when the frozen scope is total employment", () => {
    const calculation = computeStructuredResumeCalculation({
      adjustmentOutput: { judgments: [] },
      dimensionOutput: {
        employmentEpisodes: [
          {
            current: false,
            endMonth: "2026-06",
            evidence: [],
            gapExplanation: null,
            id: "job-a",
            primaryStatus: "primary",
            relevance: "insufficient_evidence",
            relevanceReason: "模型没有判断行业相关性",
            startMonth: "2023-01",
          },
        ],
        projects: [],
        ruleJudgments: [],
        skillFacts: [],
      },
      gateOutput: { judgments: [] },
      workflowInput: {
        ...workflowInput,
        jobSnapshot: {
          ...workflowInput.jobSnapshot,
          blueprint: {
            ...blueprint,
            requiredRelevantExperience: {
              relevanceScope: "total_employment",
              scopeDescription: "总工作经验",
              sourceRef: { kind: "hard_gate", path: "hardGates.workExperience" },
              sourceText: "4 年工作经验",
              years: 4,
            },
          },
        },
      },
    });

    expect(calculation.normalizedDimensionOutput.employmentEpisodes[0]).toMatchObject({
      relevance: "relevant",
    });
    expect(
      calculation.dimensionRuleJudgments.experienceRelevance.find(
        (item) => item.ruleId === "experience.missing_year",
      ),
    ).toMatchObject({ status: "matched", units: 1 });
  });

  it("rejects evidence quotes that do not exist in either resume source", () => {
    expect(() =>
      computeStructuredResumeCalculation({
        adjustmentOutput: { judgments: [] },
        dimensionOutput: {
          employmentEpisodes: [],
          projects: [],
          ruleJudgments: [
            {
              dimension: "potential",
              evidence: [{ quote: "候选人精通 Rust", source: "resume_text" }],
              reason: "模型声称命中",
              ruleId: "potential.no_growth_two_years",
              status: "matched",
            },
          ],
          skillFacts: [],
        },
        gateOutput: { judgments: [] },
        workflowInput: {
          ...workflowInput,
          resumeInput: {
            ...workflowInput.resumeInput,
            resumeText: "候选人精通 TypeScript",
          },
        },
      }),
    ).toThrow("STRUCTURED_RESUME_EVIDENCE_MISMATCH");
  });

  it("corrects an evidence source when the exact quote exists in the other resume source", () => {
    const calculation = computeStructuredResumeCalculation({
      adjustmentOutput: { judgments: [] },
      dimensionOutput: {
        employmentEpisodes: [],
        projects: [],
        ruleJudgments: [
          {
            dimension: "potential" as const,
            evidence: [{ quote: "精通 TypeScript", source: "resume_profile" as const }],
            reason: "引用内容来自简历原文",
            ruleId: "potential.no_growth_two_years" as const,
            status: "not_matched" as const,
          },
        ],
        skillFacts: [],
      },
      gateOutput: { judgments: [] },
      workflowInput: {
        ...workflowInput,
        resumeInput: {
          ...workflowInput.resumeInput,
          resumeText: "候选人精通 TypeScript，具备项目实操经验。",
        },
      },
    });

    expect(
      calculation.dimensionRuleJudgments.potential.find(
        (judgment) => judgment.ruleId === "potential.no_growth_two_years",
      )?.evidence,
    ).toEqual([{ quote: "精通 TypeScript", source: "resume_text" }]);
  });

  it("rejects resume-profile JSON keys and null literals as fabricated evidence", () => {
    for (const quote of ["skills", "null"]) {
      expect(() =>
        computeStructuredResumeCalculation({
          adjustmentOutput: { judgments: [] },
          dimensionOutput: {
            employmentEpisodes: [],
            projects: [],
            ruleJudgments: [
              {
                dimension: "potential",
                evidence: [{ quote, source: "resume_profile" }],
                reason: "模型引用了序列化噪声",
                ruleId: "potential.no_growth_two_years",
                status: "matched",
              },
            ],
            skillFacts: [],
          },
          gateOutput: { judgments: [] },
          workflowInput,
        }),
      ).toThrow("STRUCTURED_RESUME_EVIDENCE_MISMATCH");
    }
  });

  it("accepts evidence found inside a real resume-profile leaf value", () => {
    expect(() =>
      computeStructuredResumeCalculation({
        adjustmentOutput: { judgments: [] },
        dimensionOutput: {
          employmentEpisodes: [],
          projects: [],
          ruleJudgments: [
            {
              dimension: "potential",
              evidence: [{ quote: "候选人", source: "resume_profile" }],
              reason: "引用姓名字段",
              ruleId: "potential.no_growth_two_years",
              status: "not_matched",
            },
          ],
          skillFacts: [],
        },
        gateOutput: { judgments: [] },
        workflowInput,
      }),
    ).not.toThrow();
  });
});
