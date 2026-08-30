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
  normalizeDimensionOutputWithReusableFacts,
  structuredDimensionAgentOutputSchema,
  structuredGateAgentOutputSchema,
  validateStructuredResumeInput,
} from "@app/server/server/agents/structured-resume-evaluation";
import type { StructuredResumeGenerator } from "@app/server/server/agents/structured-resume-evaluation";
import { computeJobEvaluationPayloadHash } from "@app/server/lib/server/job-evaluation-hash";
import {
  createStructuredResumeReviewWorkflow,
  runStructuredResumeReviewWorkflow,
} from "../workflows/structured-resume-review-workflow";
import type { StructuredResumeWorkflowLogContext } from "../workflows/structured-resume-review-workflow";

interface RecordedGeneratorCall {
  fallbackToTextGeneration?: boolean;
  maxOutputTokens?: number;
  prompt: string;
  timeoutMs?: number;
  validate?: (output: JsonObject) => void;
}

const generatorCall = vi.fn<() => Promise<JsonObject>>();
const generatorCalls: RecordedGeneratorCall[] = [];
const generator: StructuredResumeGenerator = async (input) => {
  const recordedCall: RecordedGeneratorCall = {
    fallbackToTextGeneration: input.fallbackToTextGeneration,
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

function createNormalizedGenerator(raw: JsonObject): StructuredResumeGenerator {
  return async (request) => {
    const generated = await Promise.resolve(raw);
    return request.schema.parse(request.normalizeInvalid?.(generated) ?? generated);
  };
}

const testWorkflow = createStructuredResumeReviewWorkflow({
  assemble: assembleStructuredResumeEvaluation,
  compute: computeStructuredResumeCalculation,
  generateNarrative: (input) => generateStructuredNarrative(input, generator),
  judgeAdjustments: (input, gateOutput, promptContext, dimensionOutput) =>
    judgeStructuredAdjustments(input, gateOutput, generator, promptContext, dimensionOutput),
  judgeDimensionEvidence: (input, promptContext) =>
    judgeStructuredDimensionEvidence(input, generator, promptContext),
  judgeHardGates: (input, promptContext) =>
    judgeStructuredHardGates(input, generator, promptContext),
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

const completeSemanticRuleJudgments = [
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
].map((ruleId) => ({
  evidence: [],
  missingInputs: [],
  reason: "测试输入中不适用。",
  ruleId,
  status: "not_applicable" as const,
}));

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

function createDeferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined;
  // oxlint-disable-next-line promise/avoid-new -- The concurrency test needs externally controlled completion.
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve;
  });
  return {
    promise,
    resolve(value: T) {
      if (!resolvePromise) {
        throw new Error("Deferred promise was not initialized.");
      }
      resolvePromise(value);
    },
  };
}

function skillRequirement(normalizedSkill: string) {
  return {
    normalizedSkill,
    requirementGroupId: `skill-group-${normalizedSkill}`,
    satisfactionMode: "all" as const,
    sourceRef: { kind: "job_description" as const, path: "description" },
    sourceText: `熟练掌握 ${normalizedSkill}`,
  };
}

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

  it("keeps parsed dates out of the raw dimension Agent contract", () => {
    const result = structuredDimensionAgentOutputSchema.safeParse({
      employmentEpisodes: [
        {
          current: false,
          endMonth: undefined,
          evidence: [],
          gapExplanation: undefined,
          id: "episode-1",
          primaryStatus: "unresolved",
          relevance: "insufficient_evidence",
          relevanceReason: "简历没有提供足够的任职日期信息。",
          startMonth: undefined,
        },
      ],
      projects: [],
      ruleJudgments: completeSemanticRuleJudgments,
      skillFacts: [],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.employmentEpisodes[0]).not.toHaveProperty("startMonth");
      expect(result.data.employmentEpisodes[0]).not.toHaveProperty("endMonth");
      expect(result.data.employmentEpisodes[0]).not.toHaveProperty("gapExplanation");
    }
  });

  it("normalizes common employment relevance aliases without requiring another model call", () => {
    const result = structuredDimensionAgentOutputSchema.parse({
      employmentEpisodes: [
        { evidence: [], id: "work-0", relevance: "matched" },
        { evidence: [], id: "work-1", relevance: "not_matched" },
      ],
      experienceRequirements: [
        {
          episodeIds: [],
          evidence: [],
          missingInputs: [],
          reason: "具体管理年限不足以确认。",
          requirementId: "experience-1",
          status: "insufficient_evidence",
        },
      ],
      projects: [],
      ruleJudgments: completeSemanticRuleJudgments.map((judgment, index) =>
        index === 0 ? { ...judgment, units: 0 } : judgment,
      ),
      skillFacts: [
        {
          evidence: [],
          reason: "简历未提及 Go。",
          skill: "Go",
          status: "missing",
        },
      ],
    });

    expect(result.employmentEpisodes).toMatchObject([
      { relevance: "relevant", relevanceReason: "模型判断该任职与岗位相关。" },
      { relevance: "not_relevant", relevanceReason: "模型判断该任职与岗位不相关。" },
    ]);
    expect(result.experienceRequirements[0]?.missingInputs).toHaveLength(1);
    expect(result.ruleJudgments[0]).not.toHaveProperty("units");
    expect(result.skillFacts[0]?.normalizedSkill).toBe("Go");
  });

  it("fills missing project inputs locally for insufficient evidence", () => {
    const result = structuredDimensionAgentOutputSchema.parse({
      employmentEpisodes: [],
      projects: [
        {
          id: "project-0",
          requirementJudgments: [
            {
              evidence: [],
              missingInputs: [],
              reason: "项目没有详细描述，无法判断复杂技术治理能力。",
              requirementId: "project-expectation-0",
              status: "insufficient_evidence",
            },
          ],
        },
      ],
      ruleJudgments: completeSemanticRuleJudgments,
      skillFacts: [],
    });

    expect(result.projects[0]).toMatchObject({
      requirementJudgments: [
        {
          missingInputs: ["需补充能够确认该项目要求的项目职责、实施细节或结果指标。"],
          status: "insufficient_evidence",
        },
      ],
    });
  });

  it("derives deterministic timeline and project fields instead of requiring repeated model JSON", () => {
    const result = structuredDimensionAgentOutputSchema.parse({
      employmentEpisodes: [
        {
          evidence: [],
          id: "work-0",
          relevance: "relevant",
          relevanceReason: "岗位职责相关。",
        },
      ],
      projects: [{ evidence: [], id: "project-0", relevant: true }],
      ruleJudgments: [],
      skillFacts: [],
    });
    const gates = structuredGateAgentOutputSchema.parse({
      judgments: [
        {
          aiStatus: "passed",
          evidence: [],
          experienceEpisodes: [{ evidence: [], id: "work-0" }],
          reason: "满足要求。",
          requirementId: "gate-0",
        },
      ],
    });

    expect(result.employmentEpisodes[0]).not.toHaveProperty("startMonth");
    expect(result.projects[0]).not.toHaveProperty("endMonth");
    expect(gates.judgments[0]?.experienceEpisodes?.[0]).not.toHaveProperty("startMonth");
  });

  it("hydrates compact model judgments from scoring facts before assembling the artifact", async () => {
    const experienceGate = {
      category: "work_experience" as const,
      normalizedRequirement: "3年以上相关经验",
      requirementId: "gate-experience",
      sourceRef: { kind: "hard_gate" as const, path: "hardGates.workExperience" },
      sourceText: "3年以上相关经验",
    };
    const input = {
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprint: { ...blueprint, hardGateRequirements: [experienceGate] },
      },
      resumeInput: {
        ...workflowInput.resumeInput,
        resumeProfile: {
          ...workflowInput.resumeInput.resumeProfile,
          projectExperiences: [
            {
              name: "支付平台",
              period: "2024.01-至今",
              role: "负责人",
              summary: null,
              techStack: [],
            },
          ],
          scoringFacts: {
            additionalEvidence: [],
            employmentEpisodes: [
              {
                currentStatus: "current" as const,
                endMonth: null,
                evidence: [],
                gapExplanation: "内部转岗",
                primaryStatus: "primary" as const,
                sourceIndex: 0,
                startMonth: "2022-03",
              },
            ],
            projects: [
              {
                currentStatus: "current" as const,
                endMonth: null,
                evidence: [],
                sourceIndex: 0,
                startMonth: "2024-01",
              },
            ],
            skillFacts: [],
            version: 1 as const,
          },
          workExperiences: [
            { company: "示例公司", period: "2022.03-至今", role: "工程师", summary: null },
          ],
        },
      },
    };
    generatorCall
      .mockResolvedValueOnce({
        judgments: [
          {
            aiStatus: "passed",
            evidence: [],
            experienceEpisodes: [{ evidence: [], id: "work-0" }],
            reason: "相关经历满足要求。",
            requirementId: experienceGate.requirementId,
          },
        ],
      })
      .mockResolvedValueOnce({
        employmentEpisodes: [
          {
            evidence: [],
            id: "work-0",
            relevance: "relevant",
            relevanceReason: "岗位职责相关。",
          },
        ],
        projects: [{ evidence: [], id: "project-0", relevant: true }],
        ruleJudgments: completeSemanticRuleJudgments,
        skillFacts: [],
      });
    const hydratingGenerator: StructuredResumeGenerator = async (request) => {
      const output = request.schema.parse(await generatorCall());
      request.validate?.(output);
      return output;
    };

    const gateOutput = await judgeStructuredHardGates(input, hydratingGenerator);
    const dimensionOutput = await judgeStructuredDimensionEvidence(input, hydratingGenerator);

    expect(gateOutput.judgments[0]?.experienceEpisodes?.[0]).toMatchObject({
      current: true,
      endMonth: null,
      startMonth: "2022-03",
    });
    expect(dimensionOutput.employmentEpisodes[0]).toMatchObject({
      current: true,
      gapExplanation: "内部转岗",
      primaryStatus: "primary",
      startMonth: "2022-03",
    });
    expect(dimensionOutput.projects[0]).toMatchObject({ current: true, endMonth: null });

    const calculationResult = computeStructuredResumeCalculation({
      adjustmentOutput: { judgments: [] },
      dimensionOutput,
      gateOutput,
      workflowInput: input,
    });
    const artifact = assembleStructuredResumeEvaluation({
      calculationResult,
      narrative: narrativeOutput,
      workflowInput: input,
    });
    expect(structuredResumeEvaluationV1Schema.safeParse(artifact).success).toBe(true);
    expect(artifact.timeline.employmentEpisodes[0]).toMatchObject({
      current: true,
      primaryStatus: "primary",
      startMonth: "2022-03",
    });
  });

  it("accepts omitted candidate fact collections and non-semantic evidence metadata", () => {
    const result = structuredDimensionAgentOutputSchema.safeParse({
      employmentEpisodes: [
        {
          endMonth: undefined,
          evidence: [
            {
              field: "company",
              quote: "示例公司",
              source: "resume_profile",
            },
          ],
          gapExplanation: undefined,
          id: "episode-1",
          primaryStatus: "unresolved",
          relevance: "insufficient_evidence",
          relevanceReason: "简历没有提供是否仍在职的信息。",
          startMonth: undefined,
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toMatchObject({
        projects: [],
        ruleJudgments: [],
        skillFacts: [],
      });
      expect(result.data.employmentEpisodes[0]).not.toHaveProperty("current");
      expect(result.data.employmentEpisodes[0]?.evidence[0]).toEqual({
        quote: "示例公司",
        source: "resume_profile",
      });
    }
  });

  it("normalizes equivalent provider-shaped dimension fields without changing judgments", () => {
    const result = structuredDimensionAgentOutputSchema.safeParse({
      employmentEpisodes: [
        {
          evidence: [],
          id: "episode-related",
          relevance: "related",
        },
        {
          evidence: [],
          id: "episode-unrelated",
          relevance: false,
        },
      ],
      projects: [],
      ruleJudgments: [
        {
          evidence: [],
          ruleId: "education.below_tier",
          status: "matched",
          units: 0,
        },
        {
          evidence: [],
          missingInputs: [],
          ruleId: "project.scale_low",
          status: "insufficient_evidence",
        },
      ],
      skillFacts: [
        {
          evidence: [],
          normalizedSkill: "TypeScript",
          status: "missing",
        },
      ],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.employmentEpisodes.map((episode) => episode.relevance)).toEqual([
        "relevant",
        "not_relevant",
      ]);
      expect(result.data.ruleJudgments[0]).not.toHaveProperty("units");
      expect(result.data.ruleJudgments[0]?.reason).toBeTruthy();
      expect(result.data.ruleJudgments[1]?.missingInputs).not.toHaveLength(0);
      expect(result.data.skillFacts[0]?.reason).toBeTruthy();
    }
  });

  it("conservatively normalizes unknown relevance and evidence-free project matches", () => {
    const result = structuredDimensionAgentOutputSchema.safeParse({
      employmentEpisodes: [
        {
          evidence: [],
          id: "episode-unknown",
          relevance: "possibly_relevant",
        },
      ],
      projects: [
        {
          id: "project-0",
          requirementJudgments: [
            {
              evidence: [],
              requirementId: "project-expectation-0",
              status: "matched",
            },
          ],
        },
      ],
      ruleJudgments: [],
      skillFacts: [],
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.employmentEpisodes[0]?.relevance).toBe("insufficient_evidence");
      const [project] = result.data.projects;
      expect(project && "requirementJudgments" in project).toBe(true);
      if (project && "requirementJudgments" in project) {
        expect(project.requirementJudgments[0]).toMatchObject({
          status: "insufficient_evidence",
        });
      }
    }
  });

  it("rejects malformed optional fact collections instead of degrading them to empty facts", () => {
    const dimensions = structuredDimensionAgentOutputSchema.safeParse({
      employmentEpisodes: [
        {
          current: false,
          evidence: [],
          relevanceReason: "缺少结构字段",
        },
      ],
      projects: null,
      ruleJudgments: [],
      skillFacts: undefined,
    });
    const gates = structuredGateAgentOutputSchema.safeParse({
      judgments: [
        {
          aiStatus: "failed",
          evidence: [],
          experienceEpisodes: ["没有可解析的经历"],
          reason: "简历没有相关经历证据。",
          requirementId: "gate-1",
        },
      ],
    });

    expect(dimensions.success).toBe(false);
    expect(gates.success).toBe(false);
  });

  it("repairs only representational dimension output differences", async () => {
    const representationalGenerator = createNormalizedGenerator({
      employmentEpisodes: [],
      projects: [],
      ruleJudgments: [],
      skillFacts: [
        {
          evidence: [],
          reason: ["未找到", "可审计证据"],
          skill: "TypeScript",
          status: "missing",
        },
      ],
    });

    const output = await judgeStructuredDimensionEvidence(workflowInput, representationalGenerator);

    expect(output.skillFacts[0]).toMatchObject({
      normalizedSkill: "TypeScript",
      reason: "未找到；可审计证据",
      status: "missing",
    });
  });

  it("does not turn semantic omissions into valid dimension judgments", async () => {
    const semanticallyInvalidGenerator = createNormalizedGenerator({
      employmentEpisodes: [],
      projects: [],
      ruleJudgments: [
        {
          evidence: [],
          reason: "模型声称命中，但没有返回必需的层级差。",
          ruleId: "education.below_tier",
          status: "matched",
          units: 0,
        },
      ],
      skillFacts: [],
    });

    await expect(
      judgeStructuredDimensionEvidence(workflowInput, semanticallyInvalidGenerator),
    ).rejects.toThrow();
  });

  it("documents missing candidate evidence and enables plain JSON fallback", async () => {
    generatorCall.mockResolvedValue({ judgments: [] });

    await judgeStructuredHardGates(workflowInput, generator);

    expect(generatorCalls[0]?.fallbackToTextGeneration).toBe(true);
    expect(generatorCalls[0]?.prompt).toContain("JSON 不支持 undefined");
    expect(generatorCalls[0]?.prompt).toContain("规则判断使用 insufficient_evidence");
    expect(generatorCalls[0]?.prompt).toContain("技能事实使用 missing");
    expect(generatorCalls[0]?.prompt).toContain('"judgments"');
    expect(generatorCalls[0]?.prompt).toContain('"id":"work-0"');
    expect(generatorCalls[0]?.prompt).toContain('"source":"resume_profile"');
  });

  it("sends Gate only gate-owned facts and leaves skills and scoring experience to Dimension", async () => {
    const requiredSkillGate = {
      category: "required_skills" as const,
      normalizedRequirement: "必须掌握 UNIQUE_GATE_SKILL",
      requirementId: "gate-owned-by-skill-facts",
      sourceRef: { kind: "hard_gate" as const, path: "hardGates.requiredSkills" },
      sourceText: "必须掌握 UNIQUE_GATE_SKILL",
    };
    const scoringExperience = {
      relevanceScope: "capability" as const,
      requirementId: "experience-owned-by-dimension",
      scopeDescription: "UNIQUE_SCORING_EXPERIENCE",
      sourceRef: { kind: "job_description" as const, path: "prompt" },
      sourceText: "3 年以上 UNIQUE_SCORING_EXPERIENCE",
      years: 3,
    };
    const input = {
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprint: {
          ...blueprint,
          coreSkills: [
            {
              normalizedSkill: "UNIQUE_GATE_SKILL",
              requirementGroupId: "skill-group-unique",
              satisfactionMode: "all" as const,
              sourceRef: { kind: "hard_gate" as const, path: "hardGates.requiredSkills" },
              sourceText: "必须掌握 UNIQUE_GATE_SKILL",
            },
          ],
          hardGateRequirements: [requiredSkillGate],
          requiredRelevantExperience: scoringExperience,
          requiredRelevantExperiences: [scoringExperience],
        },
      },
    };
    generatorCall.mockResolvedValue({ judgments: [] });

    const output = await judgeStructuredHardGates(input, generator);

    expect(generatorCalls[0]?.prompt).not.toContain(requiredSkillGate.requirementId);
    expect(generatorCalls[0]?.prompt).not.toContain(scoringExperience.requirementId);
    expect(output.judgments).toEqual([]);
  });

  it("does not send long OCR text back to any scoring agent", async () => {
    const resumeLines = Array.from(
      { length: 250 },
      (_, index) => `OCR-CHUNK-${String(index).padStart(3, "0")}-${"候选人经历".repeat(55)}`,
    );
    const input = {
      ...workflowInput,
      resumeInput: { ...workflowInput.resumeInput, resumeText: resumeLines.join("\n") },
    };
    generatorCall
      .mockResolvedValueOnce({ judgments: [] })
      .mockResolvedValueOnce({
        employmentEpisodes: [],
        projects: [],
        ruleJudgments: [],
        skillFacts: [],
      })
      .mockResolvedValueOnce({ judgments: [] });

    await judgeStructuredHardGates(input, generator);
    await judgeStructuredDimensionEvidence(input, generator);
    await judgeStructuredAdjustments(input, undefined, generator);

    expect(generatorCalls).toHaveLength(3);
    for (const { prompt } of generatorCalls) {
      expect(prompt.length).toBeLessThanOrEqual(55_000);
      expect(prompt).not.toContain("OCR-CHUNK-000");
      expect(prompt).not.toContain("OCR-CHUNK-249");
      expect(prompt).not.toContain("resume_text");
    }
  });

  it("keeps one canonical copy of structured skills and excludes legacy period strings", async () => {
    const input = {
      ...workflowInput,
      resumeInput: {
        ...workflowInput.resumeInput,
        resumeProfile: {
          ...workflowInput.resumeInput.resumeProfile,
          skills: Array.from(
            { length: 50 },
            (_, index) => `SKILL-${String(index).padStart(3, "0")}`,
          ),
          workExperiences: Array.from({ length: 15 }, (_, index) => ({
            company: `COMPANY-${String(index).padStart(3, "0")}`,
            period: `PERIOD-${String(index).padStart(3, "0")}`,
            role: `ROLE-${String(index).padStart(3, "0")}`,
            summary: "工作内容",
          })),
        },
      },
    };
    generatorCall.mockResolvedValue({ judgments: [] });

    await judgeStructuredHardGates(input, generator);

    const prompt = generatorCalls[0]?.prompt ?? "";
    expect(prompt.match(/SKILL-049/gu)).toHaveLength(1);
    expect(prompt).not.toContain("PERIOD-014");
    expect(prompt).not.toContain("证据引用白名单如下");
  });

  it("reuses parsed timeline facts and fills missing model classifications without failing", () => {
    const input = {
      ...workflowInput,
      resumeInput: {
        ...workflowInput.resumeInput,
        resumeProfile: {
          ...workflowInput.resumeInput.resumeProfile,
          scoringFacts: {
            additionalEvidence: [],
            employmentEpisodes: [
              {
                currentStatus: "current" as const,
                endMonth: null,
                evidence: [],
                gapExplanation: null,
                primaryStatus: "primary" as const,
                sourceIndex: 0,
                startMonth: "2022-03",
              },
            ],
            projects: [],
            skillFacts: [],
            version: 1 as const,
          },
          workExperiences: [
            {
              company: "示例公司",
              period: "2022.03-至今",
              role: "工程师",
              summary: null,
            },
          ],
        },
      },
    };
    const output = structuredDimensionAgentOutputSchema.parse({
      employmentEpisodes: [],
      projects: [],
      ruleJudgments: [],
      skillFacts: [],
    });

    const normalized = normalizeDimensionOutputWithReusableFacts(input, output);

    expect(normalized.employmentEpisodes).toEqual([
      {
        current: true,
        endMonth: null,
        evidence: [],
        gapExplanation: null,
        id: "work-0",
        primaryStatus: "primary",
        relevance: "insufficient_evidence",
        relevanceReason: "评分事实存在，但岗位相关性证据不足。",
        startMonth: "2022-03",
      },
    ]);
  });

  it("restores auditable parsed skill evidence instead of turning invalid model quotes into missing skills", () => {
    const input = {
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprint: {
          ...blueprint,
          coreSkills: [
            skillRequirement("Ahrefs"),
            skillRequirement("Google Search Console"),
            skillRequirement("社交媒体营销"),
          ],
        },
      },
      resumeInput: {
        ...workflowInput.resumeInput,
        resumeProfile: {
          ...workflowInput.resumeInput.resumeProfile,
          scoringFacts: {
            additionalEvidence: [],
            employmentEpisodes: [],
            projects: [],
            skillFacts: [
              {
                evidence: ["Ahrefs"],
                evidenceLevel: "applied" as const,
                normalizedSkill: "Ahrefs",
              },
              {
                evidence: ["Reddit 营销"],
                evidenceLevel: "applied" as const,
                normalizedSkill: "Reddit 营销",
              },
            ],
            version: 1 as const,
          },
          skills: ["Ahrefs", "Reddit 营销"],
          workExperiences: [
            {
              company: "示例公司",
              period: "2024.01-至今",
              role: "SEO",
              summary: "GSC 点击超过 5W，并持续运营 Reddit 营销渠道。",
            },
          ],
        },
      },
    };
    const output = structuredDimensionAgentOutputSchema.parse({
      employmentEpisodes: [],
      experienceRequirements: [],
      projects: [],
      ruleJudgments: [],
      skillFacts: ["Ahrefs", "Google Search Console", "社交媒体营销"].map((normalizedSkill) => ({
        evidence: [],
        normalizedSkill,
        reason: "模型引用的技能证据无法在简历结构化字段中核验。",
        status: "missing" as const,
      })),
    });

    const normalized = normalizeDimensionOutputWithReusableFacts(input, output);

    expect(normalized.skillFacts).toEqual([
      expect.objectContaining({
        evidence: [{ quote: "Ahrefs", source: "resume_profile" }],
        normalizedSkill: "Ahrefs",
        status: "applied",
      }),
      expect.objectContaining({
        evidence: [
          {
            quote: "GSC 点击超过 5W，并持续运营 Reddit 营销渠道。",
            source: "resume_profile",
          },
        ],
        normalizedSkill: "Google Search Console",
        status: "applied",
      }),
      expect.objectContaining({
        evidence: [{ quote: "Reddit 营销", source: "resume_profile" }],
        normalizedSkill: "社交媒体营销",
        status: "applied",
      }),
    ]);
  });

  it("does not mistake an acronym substring for skill evidence or downgrade valid applied evidence", () => {
    const input = {
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprint: {
          ...blueprint,
          coreSkills: [skillRequirement("Machine Learning"), skillRequirement("TypeScript")],
        },
      },
      resumeInput: {
        ...workflowInput.resumeInput,
        resumeProfile: {
          ...workflowInput.resumeInput.resumeProfile,
          scoringFacts: {
            additionalEvidence: [],
            employmentEpisodes: [],
            projects: [],
            skillFacts: [
              {
                evidence: ["TypeScript"],
                evidenceLevel: "mentioned" as const,
                normalizedSkill: "TypeScript",
              },
            ],
            version: 1 as const,
          },
          skills: ["TypeScript"],
          workExperiences: [
            {
              company: "示例公司",
              period: "2024.01-至今",
              role: "前端工程师",
              summary: "负责 HTML 页面并在项目中使用 TypeScript。",
            },
          ],
        },
      },
    };
    const output = structuredDimensionAgentOutputSchema.parse({
      employmentEpisodes: [],
      experienceRequirements: [],
      projects: [],
      ruleJudgments: [],
      skillFacts: [
        {
          evidence: [],
          normalizedSkill: "Machine Learning",
          reason: "简历未体现 Machine Learning。",
          status: "missing",
        },
        {
          evidence: [{ quote: "在项目中使用 TypeScript", source: "resume_profile" }],
          normalizedSkill: "TypeScript",
          reason: "项目经历明确体现实际使用。",
          status: "applied",
        },
      ],
    });

    const normalized = normalizeDimensionOutputWithReusableFacts(input, output);

    expect(normalized.skillFacts).toEqual([
      expect.objectContaining({ normalizedSkill: "Machine Learning", status: "missing" }),
      expect.objectContaining({ normalizedSkill: "TypeScript", status: "applied" }),
    ]);
  });

  it("prefers applied channel evidence when normalizing a broad social-media skill", () => {
    const input = {
      ...workflowInput,
      resumeInput: {
        ...workflowInput.resumeInput,
        resumeProfile: {
          ...workflowInput.resumeInput.resumeProfile,
          scoringFacts: {
            additionalEvidence: [],
            employmentEpisodes: [],
            projects: [],
            skillFacts: [
              {
                evidence: ["Quora 营销"],
                evidenceLevel: "mentioned" as const,
                normalizedSkill: "Quora 营销",
              },
              {
                evidence: ["Reddit 营销"],
                evidenceLevel: "applied" as const,
                normalizedSkill: "Reddit 营销",
              },
            ],
            version: 1 as const,
          },
          skills: ["Quora 营销", "Reddit 营销"],
        },
      },
    };
    const output = structuredDimensionAgentOutputSchema.parse({
      employmentEpisodes: [],
      experienceRequirements: [],
      projects: [],
      ruleJudgments: [],
      skillFacts: [
        {
          evidence: [],
          normalizedSkill: "社交媒体营销",
          reason: "模型未给出可核验证据。",
          status: "missing",
        },
      ],
    });

    const normalized = normalizeDimensionOutputWithReusableFacts(input, output);

    expect(normalized.skillFacts[0]).toMatchObject({
      evidence: [{ quote: "Reddit 营销", source: "resume_profile" }],
      status: "applied",
    });
  });

  it("rejects model-owned skill deductions and ignores invalid model-owned education units", () => {
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
    const educationResult = structuredDimensionAgentOutputSchema.safeParse({
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
    });
    expect(educationResult.success).toBe(true);
    if (educationResult.success) {
      expect(educationResult.data.ruleJudgments[0]).not.toHaveProperty("units");
    }
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

  it("derives a semantic rule dimension from ruleId when the model emits a bad enum", () => {
    const result = structuredDimensionAgentOutputSchema.parse({
      employmentEpisodes: [],
      projects: [],
      ruleJudgments: [
        {
          evidence: [],
          reason: { conclusion: "简历没有相关项目", scope: "当前岗位" },
          ruleId: "project.no_relevant_project",
          status: "matched",
        },
      ],
      skillFacts: [],
    });

    expect(result.ruleJudgments[0]?.dimension).toBe("projectMatch");
    expect(result.ruleJudgments[0]?.reason).toBe("简历没有相关项目；当前岗位");
  });

  it("accepts requirementId as an unambiguous semantic ruleId alias", () => {
    const result = structuredDimensionAgentOutputSchema.parse({
      employmentEpisodes: [],
      projects: [],
      ruleJudgments: [
        {
          evidence: [],
          missingInputs: [],
          reason: "岗位蓝图未明确学历要求。",
          requirementId: "education.below_tier",
          status: "not_applicable",
        },
      ],
      skillFacts: [],
    });

    expect(result.ruleJudgments[0]).toMatchObject({
      dimension: "educationBackground",
      ruleId: "education.below_tier",
    });
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
    expect(prompt).toContain("语言对应的框架或生态有明确项目实操证据时，可以升级为 applied");
    expect(prompt).toContain("ruleJudgments 必须覆盖 requiredSemanticRuleIds 的每一项");
    expect(prompt).toContain("禁止整批无理由返回 not_matched");
    expect(prompt).toContain('"requiredSemanticRuleIds"');
    expect(prompt).toContain("每项最多 2 条证据");
    expect(prompt).toContain("projects 必须覆盖 resumeProfile.scoringFacts.projects 的每一项");
    expect(prompt).toContain("quote 必须是声明来源中的逐字连续片段");
    expect(prompt).toContain("不得跨字段拼接");
    expect(prompt).toContain("禁止把 JSON 字段名当作 quote");
    expect(prompt).toContain("禁止使用省略号");
    expect(prompt).toContain("复制粘贴");
    expect(prompt).toContain("岗位相关性证据只能引用公司、职位或职责中的字符串叶子值");
    expect(prompt).toContain("不得重复返回日期、在职状态、主职/并发关系或空档说明");
    expect(prompt).toContain("resumeProfile JSON 的某一个字符串叶子值");
    expect(prompt).not.toContain('"resume_profile":["候选人"');
    expect(prompt).toContain('"normalizedSkill":"TypeScript"');
    expect(prompt).not.toContain('"hardGateRequirements"');
    expect(prompt).not.toContain('"publishedConfig"');
    expect(generatorCalls[0]?.maxOutputTokens).toBe(32_000);
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
    ).toThrow(/resume_text 未找到逐字引文“不存在的逐字引文”/);
    expect(() =>
      validate({
        employmentEpisodes: [],
        projects: [],
        ruleJudgments: [],
        skillFacts: [],
      }),
    ).toThrow("STRUCTURED_RESUME_SEMANTIC_RULE_COVERAGE_MISMATCH");
  });

  it("treats an omitted hard-gate requirement as failed rather than pending verification", async () => {
    generatorCall.mockResolvedValue({ judgments: [] });

    await judgeStructuredHardGates(workflowInput, generator);

    const prompt = generatorCalls[0]?.prompt ?? "";
    expect(prompt).toContain("简历没有写明或没有证据支持门槛要求时，判定 failed");
    expect(prompt).toContain("needs_verification 仅用于简历已有相关证据但证据相互冲突");
    expect(prompt).toContain("即使判断为 failed 且没有相关经历，也必须显式返回空数组");
    expect(prompt).not.toContain('"dimensionExpectations"');
    expect(prompt).not.toContain('"publishedConfig"');

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

  it("rejects raw resume evidence from a scoring agent even when the raw text contains it", async () => {
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
          id: "project-0",
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

    await expect(
      judgeStructuredDimensionEvidence(
        {
          ...workflowInput,
          resumeInput: {
            ...workflowInput.resumeInput,
            resumeProfile: {
              ...workflowInput.resumeInput.resumeProfile,
              projectExperiences: [
                { name: "增长项目", period: null, role: null, summary: null, techStack: [] },
              ],
            },
            resumeText: "统筹应用商店分发与多渠道获客，端内预装及外部投放。",
          },
        },
        validatingGenerator,
      ),
    ).rejects.toThrow("STRUCTURED_RESUME_EVIDENCE_MISMATCH");
  });

  it("downgrades fabricated profile evidence instead of failing the whole evaluation", async () => {
    const gateRequirement = {
      category: "other" as const,
      normalizedRequirement: "具备三年管理经验",
      requirementId: "gate-management",
      sourceRef: { kind: "hard_gate" as const, path: "hardGates.other" },
      sourceText: "具备三年管理经验",
    };
    const input = {
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprint: { ...blueprint, hardGateRequirements: [gateRequirement] },
      },
    };
    generatorCall.mockResolvedValue({
      judgments: [
        {
          aiStatus: "passed",
          evidence: [{ quote: "三年", source: "resume_profile" }],
          reason: "岗位要求写了三年。",
          requirementId: gateRequirement.requirementId,
        },
      ],
    });

    const output = await judgeStructuredHardGates(input, generator);

    expect(output.judgments[0]).toMatchObject({ aiStatus: "failed", evidence: [] });
  });

  it("downgrades a semantic match whose only profile evidence is fabricated", async () => {
    const rawOutput = {
      employmentEpisodes: [],
      projects: [],
      ruleJudgments: completeSemanticRuleJudgments.map((judgment) =>
        judgment.ruleId === "project.scale_low"
          ? {
              ...judgment,
              evidence: [{ quote: "高并发大流量场景", source: "resume_profile" }],
              reason: "引用来自岗位要求而非简历。",
              status: "matched" as const,
            }
          : judgment,
      ),
      skillFacts: [],
    };
    const validatingGenerator: StructuredResumeGenerator = (options) => {
      const parsed = options.schema.parse(rawOutput);
      options.validate?.(parsed);
      return Promise.resolve(parsed);
    };

    const output = await judgeStructuredDimensionEvidence(workflowInput, validatingGenerator);

    expect(
      output.ruleJudgments.find((judgment) => judgment.ruleId === "project.scale_low"),
    ).toMatchObject({ evidence: [], status: "insufficient_evidence" });
  });

  it("drops an unauditable supplemental experience quote without rerunning a complete Dimension", async () => {
    const experienceRequirement = {
      relevanceScope: "capability" as const,
      requirementId: "experience-backend-8",
      scopeDescription: "后端开发经验",
      sourceRef: { kind: "job_description" as const, path: "prompt" },
      sourceText: "8年以上后端开发经验",
      years: 8,
    };
    const input = {
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprint: {
          ...blueprint,
          requiredRelevantExperience: experienceRequirement,
          requiredRelevantExperiences: [experienceRequirement],
        },
      },
      resumeInput: {
        ...workflowInput.resumeInput,
        resumeProfile: {
          ...workflowInput.resumeInput.resumeProfile,
          scoringFacts: {
            additionalEvidence: [],
            employmentEpisodes: [
              {
                currentStatus: "current" as const,
                endMonth: null,
                evidence: [],
                gapExplanation: null,
                primaryStatus: "primary" as const,
                sourceIndex: 0,
                startMonth: "2015-01",
              },
            ],
            projects: [],
            skillFacts: [],
            version: 1 as const,
          },
          workExperiences: [
            {
              company: "示例公司",
              period: "2015.01-至今",
              role: "后端开发工程师",
              summary: "负责后端服务开发。",
            },
          ],
        },
      },
    };
    const rawOutput = {
      employmentEpisodes: [
        {
          evidence: [{ quote: "后端开发工程师", source: "resume_profile" }],
          id: "work-0",
          relevance: "relevant",
          relevanceReason: "后端岗位相关。",
        },
      ],
      experienceRequirements: [
        {
          episodeIds: ["work-0"],
          evidence: [{ quote: "8年以上后端开发经验", source: "resume_profile" }],
          reason: "任职事实满足该经验口径。",
          requirementId: experienceRequirement.requirementId,
          status: "matched",
        },
      ],
      projects: [],
      ruleJudgments: completeSemanticRuleJudgments,
      skillFacts: [
        {
          evidence: [{ quote: "后端开发工程师", source: "resume_profile" }],
          normalizedSkill: "Go",
          reason: "简历未提及 Go。",
          status: "missing",
        },
      ],
    };
    const validatingGenerator: StructuredResumeGenerator = (options) => {
      const parsed = options.schema.parse(rawOutput);
      options.validate?.(parsed);
      return Promise.resolve(parsed);
    };

    const result = await judgeStructuredDimensionEvidence(input, validatingGenerator);

    expect(result.experienceRequirements[0]).toMatchObject({
      episodeIds: ["work-0"],
      evidence: [],
      status: "matched",
    });
    expect(result.skillFacts[0]?.evidence).toEqual([]);
  });

  it("does not repair a scoring-agent quote from raw resume text", async () => {
    const output = {
      employmentEpisodes: [],
      projects: [
        {
          current: false,
          endMonth: "2018-02",
          evidence: [
            {
              quote: "2016.11—2018.02 北京钱来钱往网络科技有限公司",
              source: "resume_text",
            },
          ],
          id: "project-0",
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

    await expect(
      judgeStructuredDimensionEvidence(
        {
          ...workflowInput,
          resumeInput: {
            ...workflowInput.resumeInput,
            resumeProfile: {
              ...workflowInput.resumeInput.resumeProfile,
              projectExperiences: [
                { name: "历史项目", period: null, role: null, summary: null, techStack: [] },
              ],
            },
            resumeText: "北京钱来钱往网络科技有限公司",
          },
        },
        validatingGenerator,
      ),
    ).rejects.toThrow("STRUCTURED_RESUME_EVIDENCE_MISMATCH");
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

  it("keeps canonical skill facts as the sole owner of required-skill gate outcomes", () => {
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
      status: "not_matched",
    });
    expect(judgments.find((item) => item.ruleId === "skill.shallow")).toMatchObject({
      status: "not_matched",
    });
    expect(calculationResult.skillAssessments).toEqual([
      {
        evidence: [{ quote: "React", source: "resume_text" }],
        expectationType: "core",
        normalizedSkill: "TS/JS",
        reason: "模型仅凭相邻框架误判为已应用",
        requirementGroupId: "skill-group-ts-js",
        satisfactionMode: "all",
        sourceRef: tsGate.sourceRef,
        sourceText: tsGate.sourceText,
        status: "applied",
      },
      {
        evidence: [{ quote: "H5", source: "resume_text" }],
        expectationType: "core",
        normalizedSkill: "H5 互动",
        reason: "模型仅凭 H5 误判为已应用",
        requirementGroupId: "skill-group-h5",
        satisfactionMode: "all",
        sourceRef: h5Gate.sourceRef,
        sourceText: h5Gate.sourceText,
        status: "applied",
      },
      {
        evidence: [{ quote: "Node.js", source: "resume_text" }],
        expectationType: "core",
        normalizedSkill: "Node.js",
        reason: "维度模型声称已应用，但门槛模型遗漏了该要求",
        requirementGroupId: "skill-group-node",
        satisfactionMode: "all",
        sourceRef: nodeGate.sourceRef,
        sourceText: nodeGate.sourceText,
        status: "applied",
      },
    ]);
    expect(calculationResult.calculation.gates.judgments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          aiStatus: "passed",
          reason: expect.stringContaining("统一技能事实层"),
          requirementId: "gate-ts",
        }),
        expect.objectContaining({
          aiStatus: "passed",
          reason: expect.stringContaining("统一技能事实层"),
          requirementId: "gate-node",
        }),
      ]),
    );
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
              id: "work-frontend",
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
              id: "work-management",
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
              id: "work-management",
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
                id: "work-management",
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
            {
              current: true,
              endMonth: null,
              evidence: [],
              id: "work-frontend",
              startMonth: "2018-07",
            },
          ],
          reason: "前端经验达到要求",
          requirementId: frontendRequirement.requirementId,
        },
        {
          aiStatus: "failed" as const,
          evidence: [],
          experienceEpisodes: [
            {
              current: true,
              endMonth: null,
              evidence: [],
              id: "work-management",
              startMonth: "2025-07",
            },
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

  it("repairs only invalid adjustment conditions and preserves valid first-pass judgments", async () => {
    const publishedConfig = createDefaultJobDescriptionStructuredConfig();
    publishedConfig.priorityConditions = [
      { condition: "具备中台化经验", id: "priority-platform", points: 3 },
      {
        condition: "具备服务化、自动化运维经验",
        id: "priority-service-ops",
        points: 5,
      },
    ];
    const input = {
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprint: {
          ...blueprint,
          priorityConditions: publishedConfig.priorityConditions.map((condition) => ({
            ...condition,
            sourceText: condition.condition,
          })),
        },
        publishedConfig,
      },
      resumeInput: {
        ...workflowInput.resumeInput,
        resumeProfile: {
          ...workflowInput.resumeInput.resumeProfile,
          personalStrengths: ["具备中台化、服务化和自动化运维经验"],
        },
      },
    };
    generatorCall
      .mockResolvedValueOnce({
        judgments: [
          {
            clauseJudgments: [
              {
                clauseIndex: 0,
                evidence: [{ quote: "中台化", source: "resume_profile" }],
                matched: true,
                reason: "有中台化经验。",
              },
            ],
            conditionId: "priority-platform",
            evidence: [{ quote: "中台化", source: "resume_profile" }],
            matched: true,
            reason: "命中。",
          },
          {
            clauseJudgments: [
              {
                clauseIndex: 0,
                evidence: [{ quote: "服务化", source: "resume_profile" }],
                matched: true,
                reason: "有服务化经验。",
              },
            ],
            conditionId: "priority-service-ops",
            evidence: [{ quote: "服务化", source: "resume_profile" }],
            matched: true,
            reason: "漏判了一个子条件。",
          },
        ],
      })
      .mockResolvedValueOnce({
        judgments: [
          {
            clauseJudgments: [
              {
                clauseIndex: 0,
                evidence: [],
                matched: false,
                reason: "补判时错误翻转了已完成条件。",
              },
            ],
            conditionId: "priority-platform",
            evidence: [],
            matched: false,
            reason: "不应覆盖首轮结果。",
          },
          {
            clauseJudgments: [
              {
                clauseIndex: 0,
                evidence: [{ quote: "服务化", source: "resume_profile" }],
                matched: true,
                reason: "有服务化经验。",
              },
              {
                clauseIndex: 1,
                evidence: [{ quote: "自动化运维", source: "resume_profile" }],
                matched: true,
                reason: "有自动化运维经验。",
              },
            ],
            conditionId: "priority-service-ops",
            evidence: [
              { quote: "服务化", source: "resume_profile" },
              { quote: "自动化运维", source: "resume_profile" },
            ],
            matched: true,
            reason: "两个子条件均命中。",
          },
        ],
      });

    const output = await judgeStructuredAdjustments(input, undefined, generator);

    expect(generatorCalls).toHaveLength(2);
    expect(generatorCalls[1]?.prompt).toContain("priority-service-ops");
    expect(generatorCalls[1]?.prompt).not.toContain('"conditionId":"priority-platform","clauses"');
    expect(output.judgments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ conditionId: "priority-platform", matched: true }),
        expect.objectContaining({ conditionId: "priority-service-ops", matched: true }),
      ]),
    );
  });

  it("conservatively marks conditions still absent after repair as not matched", async () => {
    const publishedConfig = createDefaultJobDescriptionStructuredConfig();
    publishedConfig.priorityConditions = [
      { condition: "具备中台化经验", id: "priority-platform", points: 3 },
      { condition: "具备海外经验", id: "priority-overseas", points: 2 },
    ];
    const input = {
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprint: {
          ...blueprint,
          priorityConditions: publishedConfig.priorityConditions.map((condition) => ({
            ...condition,
            sourceText: condition.condition,
          })),
        },
        publishedConfig,
      },
    };
    generatorCall.mockResolvedValue({ judgments: [] });

    const output = await judgeStructuredAdjustments(input, undefined, generator);

    expect(generatorCalls).toHaveLength(2);
    expect(output.judgments).toHaveLength(2);
    expect(output.judgments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ conditionId: "priority-platform", matched: false }),
        expect.objectContaining({ conditionId: "priority-overseas", matched: false }),
      ]),
    );
    expect(output.judgments.flatMap((judgment) => judgment.evidence)).toEqual([]);
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

  it("removes unsupported quantitative claims from narrative fields", () => {
    const input = {
      ...workflowInput,
      resumeInput: {
        ...workflowInput.resumeInput,
        resumeProfile: {
          ...workflowInput.resumeInput.resumeProfile,
          workExperiences: [
            {
              company: "示例公司",
              period: "2024.01-至今",
              role: "运营",
              summary: "将页面下载转化率提升 60%。",
            },
          ],
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
      gateOutput: { judgments: [] },
      workflowInput: input,
    });

    const artifact = assembleStructuredResumeEvaluation({
      calculationResult,
      narrative: {
        ...narrativeOutput,
        dimensionComments: {
          ...narrativeOutput.dimensionComments,
          experienceRelevance: "相关项目将页面下载转化率提升 70%。",
        },
        overallComment: "候选人通过优化将页面下载转化率提升 70%。",
      },
      workflowInput: input,
    });

    expect(artifact.narrative.overallComment).not.toContain("70%");
    expect(artifact.narrative.dimensionComments?.experienceRelevance ?? "").not.toContain("70%");
    expect(JSON.stringify(artifact.narrative)).not.toContain("提升 70%");
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

  it("does not keep not_applicable when canonical facts prove the job benchmark was evaluated", () => {
    const parsedRules = structuredDimensionAgentOutputSchema.parse({
      employmentEpisodes: [],
      projects: [],
      ruleJudgments: completeSemanticRuleJudgments.map((judgment) => ({
        ...judgment,
        status: "not_applicable" as const,
      })),
      skillFacts: [],
    }).ruleJudgments;
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
                expectation: "相关后端经验",
                sourceRef: { kind: "job_description" as const, path: "prompt" },
                sourceText: "相关后端经验",
              },
            ],
            projectMatch: [
              {
                expectation: "复杂技术治理和高可用",
                sourceRef: { kind: "job_description" as const, path: "prompt" },
                sourceText: "复杂技术治理和高可用",
              },
            ],
          },
        },
      },
      resumeInput: {
        ...workflowInput.resumeInput,
        resumeProfile: {
          ...workflowInput.resumeInput.resumeProfile,
          projectExperiences: [
            { name: "治理项目", period: null, role: "技术负责人", summary: null, techStack: [] },
          ],
        },
      },
    };
    const judgments = deriveStructuredRuleJudgments(input, {
      employmentEpisodes: [
        {
          current: true,
          endMonth: null,
          evidence: [],
          gapExplanation: null,
          id: "work-0",
          primaryStatus: "primary",
          relevance: "relevant",
          relevanceReason: "后端职责相关。",
          startMonth: "2020-01",
        },
      ],
      projects: [
        {
          current: true,
          endMonth: null,
          evidence: [],
          id: "project-0",
          matchedRequirementIds: ["project-expectation-0"],
          relevant: true,
        },
      ],
      ruleJudgments: parsedRules,
      skillFacts: [],
    });

    expect(
      judgments.experienceRelevance.find((item) => item.ruleId === "experience.fragmented"),
    ).toMatchObject({ status: "not_matched" });
    expect(
      judgments.experienceRelevance.find((item) => item.ruleId === "experience.industry_unrelated"),
    ).toMatchObject({ status: "not_matched" });
    expect(
      judgments.projectMatch.find((item) => item.ruleId === "project.edge_participation"),
    ).toMatchObject({ status: "not_matched" });
    expect(
      judgments.projectMatch.find((item) => item.ruleId === "project.scale_low"),
    ).toMatchObject({ status: "not_matched" });
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

  it("keeps an SEO project relevant even when it does not fully meet a high-bar project expectation", () => {
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
                expectation: "主导搜索引擎营销项目并提供 ROI 提升数据",
                sourceRef: { kind: "job_description" as const, path: "prompt" },
                sourceText: "需提供过往主导项目的 ROI 提升数据案例",
              },
            ],
          },
        },
      },
      resumeInput: {
        ...workflowInput.resumeInput,
        resumeProfile: {
          ...workflowInput.resumeInput.resumeProfile,
          projectExperiences: [
            {
              name: "AI Voice Changer 流量增长计划",
              period: "2024.12-2025.12",
              role: null,
              summary: "通过 SEO 页面优化将流量从0提升到百万。",
              techStack: [],
            },
          ],
          scoringFacts: {
            additionalEvidence: [],
            employmentEpisodes: [],
            projects: [
              {
                currentStatus: "ended" as const,
                endMonth: "2025-12",
                evidence: ["2024.12-2025.12"],
                sourceIndex: 0,
                startMonth: "2024-12",
              },
            ],
            skillFacts: [],
            version: 1 as const,
          },
        },
      },
    };
    const output = structuredDimensionAgentOutputSchema.parse({
      employmentEpisodes: [],
      experienceRequirements: [],
      projects: [
        {
          id: "project-0",
          requirementJudgments: [
            {
              evidence: [],
              reason: "项目没有直接提供 ROI 数据。",
              requirementId: "project-expectation-0",
              status: "not_matched",
            },
          ],
          roleRelevance: {
            evidence: [
              {
                quote: "AI Voice Changer 流量增长计划",
                source: "resume_profile",
              },
            ],
            reason: "项目属于 SEO 流量增长场景，与目标岗位直接相关。",
            status: "matched",
          },
        },
      ],
      ruleJudgments: [],
      skillFacts: [],
    });

    const normalized = normalizeDimensionOutputWithReusableFacts(input, output);
    expect(normalized.projects[0]).toMatchObject({
      matchedRequirementIds: [],
      relevant: true,
    });
    const judgments = deriveStructuredRuleJudgments(input, normalized);
    expect(
      judgments.projectMatch.find((item) => item.ruleId === "project.no_relevant_project"),
    ).toMatchObject({ status: "not_matched" });
  });

  it("does not cap potential when a recent dated project has substantive growth evidence", () => {
    const input = {
      ...workflowInput,
      resumeInput: {
        ...workflowInput.resumeInput,
        evaluationAsOf: "2026-08-23",
        resumeProfile: {
          ...workflowInput.resumeInput.resumeProfile,
          projectExperiences: [
            {
              name: "AI 引荐流量提升探索",
              period: "2025.4-2026.8",
              role: null,
              summary: "两个站点的 AI 引荐流量在四个月内增长80%。",
              techStack: [],
            },
          ],
          scoringFacts: {
            additionalEvidence: [],
            employmentEpisodes: [],
            projects: [
              {
                currentStatus: "current" as const,
                endMonth: "2026-08",
                evidence: ["2025.4-2026.8"],
                sourceIndex: 0,
                startMonth: "2025-04",
              },
            ],
            skillFacts: [],
            version: 1 as const,
          },
        },
      },
    };
    const judgments = deriveStructuredRuleJudgments(input, {
      employmentEpisodes: [],
      projects: [
        {
          current: true,
          endMonth: "2026-08",
          evidence: [
            {
              quote: "AI 引荐流量提升探索",
              source: "resume_profile" as const,
            },
          ],
          id: "project-0",
          matchedRequirementIds: [],
          relevant: true,
        },
      ],
      ruleJudgments: [
        {
          dimension: "potential",
          evidence: [
            {
              quote: "AI 引荐流量提升探索",
              source: "resume_profile" as const,
            },
          ],
          reason: "候选人近两年有明确的成长项目记录。",
          ruleId: "potential.no_growth_two_years",
          status: "matched",
        },
      ],
      skillFacts: [],
    });

    expect(
      judgments.potential.find((item) => item.ruleId === "potential.no_growth_two_years"),
    ).toMatchObject({ status: "not_matched" });
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

  it("keeps the full resume only in the workflow input instead of every step payload", async () => {
    const resumeSentinel = "LONG_RESUME_SENTINEL";
    const longResumeText = `${resumeSentinel}\n${"候选人经历".repeat(1000)}`;
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
    const run = await testWorkflow.createRun();

    const inputData = {
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprintHash: computeJobEvaluationPayloadHash(blueprint),
      },
      resumeInput: { ...workflowInput.resumeInput, resumeText: longResumeText },
    };
    const result = await run.start({ inputData });

    expect(result.status).toBe("success");
    expect(JSON.stringify(result.input)).toContain(resumeSentinel);
    for (const stepResult of Object.values(result.steps)) {
      const serializedStep = JSON.stringify({
        output: "output" in stepResult ? stepResult.output : null,
        payload: stepResult.payload,
      });
      expect(serializedStep).not.toContain(longResumeText);
    }
    expect(generatorCalls.every(({ prompt }) => !prompt.includes(resumeSentinel))).toBe(true);
  });

  it("starts hard-gate and dimension judgments concurrently before adjustments", async () => {
    const calls: string[] = [];
    const gate = createDeferred<{ judgments: [] }>();
    const dimension = createDeferred<{
      employmentEpisodes: [];
      experienceRequirements: [];
      projects: [];
      ruleJudgments: [];
      skillFacts: [];
    }>();
    const workflow = createStructuredResumeReviewWorkflow({
      assemble: assembleStructuredResumeEvaluation,
      compute: computeStructuredResumeCalculation,
      generateNarrative: () => Promise.resolve(narrativeOutput),
      judgeAdjustments: () => {
        calls.push("adjustment:start");
        return Promise.resolve({ judgments: [] });
      },
      judgeDimensionEvidence: async () => {
        calls.push("dimension:start");
        const output = await dimension.promise;
        calls.push("dimension:end");
        return output;
      },
      judgeHardGates: async () => {
        calls.push("gate:start");
        const output = await gate.promise;
        calls.push("gate:end");
        return output;
      },
      validate: validateStructuredResumeInput,
    });
    const run = runStructuredResumeReviewWorkflow(
      {
        ...workflowInput,
        jobSnapshot: {
          ...workflowInput.jobSnapshot,
          blueprintHash: computeJobEvaluationPayloadHash(blueprint),
        },
      },
      workflow,
    );

    try {
      await vi.waitFor(() => {
        expect(calls).toEqual(expect.arrayContaining(["gate:start", "dimension:start"]));
      });
      expect(calls).not.toContain("adjustment:start");
    } finally {
      gate.resolve({ judgments: [] });
      dimension.resolve({
        employmentEpisodes: [],
        experienceRequirements: [],
        projects: [],
        ruleJudgments: [],
        skillFacts: [],
      });
    }

    await run;
    expect(calls.indexOf("adjustment:start")).toBeGreaterThan(calls.indexOf("gate:end"));
    expect(calls.indexOf("adjustment:start")).toBeGreaterThan(calls.indexOf("dimension:end"));
  });

  it("preserves hydrated timeline facts across real workflow step schemas", async () => {
    const input = {
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprintHash: computeJobEvaluationPayloadHash(blueprint),
      },
      resumeInput: {
        ...workflowInput.resumeInput,
        resumeProfile: {
          ...workflowInput.resumeInput.resumeProfile,
          scoringFacts: {
            additionalEvidence: [],
            employmentEpisodes: [
              {
                currentStatus: "current" as const,
                endMonth: null,
                evidence: ["2022.5-至今"],
                gapExplanation: null,
                primaryStatus: "primary" as const,
                sourceIndex: 0,
                startMonth: "2022-05",
              },
            ],
            projects: [],
            skillFacts: [],
            version: 1 as const,
          },
          workExperiences: [
            {
              company: "测试公司",
              period: "2022.5-至今",
              role: "后端工程师",
              summary: null,
            },
          ],
        },
      },
    };
    const workflow = createStructuredResumeReviewWorkflow({
      assemble: assembleStructuredResumeEvaluation,
      compute: computeStructuredResumeCalculation,
      generateNarrative: () => Promise.resolve(narrativeOutput),
      judgeAdjustments: () => Promise.resolve({ judgments: [] }),
      judgeDimensionEvidence: () =>
        Promise.resolve({
          employmentEpisodes: [
            {
              current: true,
              endMonth: null,
              evidence: [{ quote: "2022.5-至今", source: "resume_profile" as const }],
              gapExplanation: null,
              id: "work-0",
              primaryStatus: "primary" as const,
              relevance: "relevant" as const,
              relevanceReason: "后端岗位相关。",
              startMonth: "2022-05",
            },
          ],
          experienceRequirements: [],
          projects: [],
          ruleJudgments: [],
          skillFacts: [],
        }),
      judgeHardGates: () => Promise.resolve({ judgments: [] }),
      validate: validateStructuredResumeInput,
    });

    const artifact = await runStructuredResumeReviewWorkflow(input, workflow);

    expect(artifact.timeline.employmentEpisodes[0]).toMatchObject({
      current: true,
      primaryStatus: "primary",
      startMonth: "2022-05",
    });
  });

  it("rejects invalid gate episode evidence instead of silently replacing it with an empty list", () => {
    const result = structuredGateAgentOutputSchema.safeParse({
      judgments: [
        {
          aiStatus: "passed",
          evidence: [],
          experienceEpisodes: [{ evidence: ["2022.5-至今"], id: "work-0" }],
          reason: "满足经验要求。",
          requirementId: "gate-experience",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("rejects incomplete project coverage before deriving direct-zero project judgments", () => {
    const input = {
      ...workflowInput,
      resumeInput: {
        ...workflowInput.resumeInput,
        resumeProfile: {
          ...workflowInput.resumeInput.resumeProfile,
          projectExperiences: [
            { name: "项目一", period: null, role: null, summary: null, techStack: [] },
            { name: "项目二", period: null, role: null, summary: null, techStack: [] },
          ],
          scoringFacts: {
            additionalEvidence: [],
            employmentEpisodes: [],
            projects: [
              {
                currentStatus: "ended" as const,
                endMonth: "2024-01",
                evidence: ["项目一"],
                sourceIndex: 0,
                startMonth: "2023-01",
              },
              {
                currentStatus: "ended" as const,
                endMonth: "2025-01",
                evidence: ["项目二"],
                sourceIndex: 1,
                startMonth: "2024-02",
              },
            ],
            skillFacts: [],
            version: 1 as const,
          },
        },
      },
    };
    const output = structuredDimensionAgentOutputSchema.parse({
      employmentEpisodes: [],
      projects: [{ evidence: [], id: "project-0", relevant: false }],
      ruleJudgments: [],
      skillFacts: [],
    });

    expect(() => normalizeDimensionOutputWithReusableFacts(input, output)).toThrow(
      "STRUCTURED_RESUME_PROJECT_COVERAGE_MISMATCH",
    );
  });

  it("logs each workflow stage with stable run context and duration", async () => {
    const logEvents: {
      context: StructuredResumeWorkflowLogContext;
      message: string;
    }[] = [];
    let now = 100;
    const workflow = createStructuredResumeReviewWorkflow({
      assemble: assembleStructuredResumeEvaluation,
      compute: computeStructuredResumeCalculation,
      generateNarrative: () => Promise.resolve(narrativeOutput),
      judgeAdjustments: () => Promise.resolve({ judgments: [] }),
      judgeDimensionEvidence: () =>
        Promise.resolve({
          employmentEpisodes: [],
          experienceRequirements: [],
          projects: [],
          ruleJudgments: [],
          skillFacts: [],
        }),
      judgeHardGates: () => Promise.resolve({ judgments: [] }),
      logger: {
        error(message, context) {
          logEvents.push({ context, message });
        },
        info(message, context) {
          logEvents.push({ context, message });
        },
      },
      now: () => {
        now += 25;
        return now;
      },
      validate: validateStructuredResumeInput,
    });

    await runStructuredResumeReviewWorkflow(
      {
        ...workflowInput,
        jobSnapshot: {
          ...workflowInput.jobSnapshot,
          blueprintHash: computeJobEvaluationPayloadHash(blueprint),
        },
      },
      workflow,
    );

    expect(logEvents).toContainEqual({
      context: {
        durationMs: 50,
        jobDescriptionId: "job-1",
        modelId: "model",
        runId: "run-1",
        step: "judge-hard-gates",
      },
      message: "[structured-resume-review] step completed",
    });
    expect(
      logEvents.filter((event) => event.message === "[structured-resume-review] step completed"),
    ).toHaveLength(7);
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

  it("derives required-skill gates exclusively from canonical skill groups", () => {
    const skillGate = {
      category: "required_skills" as const,
      normalizedRequirement: "熟练 Java/Go 任一主流技术栈",
      requirementId: "gate-java-or-go",
      sourceRef: { kind: "hard_gate" as const, path: "hardGates.requiredSkills" },
      sourceText: "熟练 Java/Go 任一主流技术栈",
    };
    const input = {
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprint: {
          ...blueprint,
          coreSkills: ["Java", "Go"].map((normalizedSkill) => ({
            normalizedSkill,
            requirementGroupId: "skill-group-java-or-go",
            satisfactionMode: "any" as const,
            sourceRef: { kind: "job_description" as const, path: "prompt" },
            sourceText: "Java/Go 任一",
          })),
          hardGateRequirements: [skillGate],
        },
      },
    };
    const calculation = computeStructuredResumeCalculation({
      adjustmentOutput: { judgments: [] },
      dimensionOutput: {
        employmentEpisodes: [],
        projects: [],
        ruleJudgments: [],
        skillFacts: [
          {
            evidence: [{ quote: "Java", source: "resume_profile" }],
            normalizedSkill: "Java",
            reason: "项目中实际使用 Java。",
            status: "applied",
          },
          {
            evidence: [],
            normalizedSkill: "Go",
            reason: "简历未体现 Go。",
            status: "missing",
          },
        ],
      },
      gateOutput: {
        judgments: [
          {
            aiStatus: "failed",
            evidence: [],
            reason: "Go 缺失。",
            requirementId: skillGate.requirementId,
          },
        ],
      },
      workflowInput: {
        ...input,
        resumeInput: {
          ...input.resumeInput,
          resumeProfile: { ...input.resumeInput.resumeProfile, skills: ["Java"] },
        },
      },
    });

    expect(calculation.calculation.gates.judgments[0]).toMatchObject({
      aiStatus: "passed",
      reason: expect.stringContaining("统一技能事实层"),
    });
    expect(
      calculation.dimensionRuleJudgments.skillMatch.find(
        (judgment) => judgment.ruleId === "skill.missing_core",
      ),
    ).toMatchObject({ status: "not_matched" });
  });

  it("fills a missing-input list for insufficient semantic judgments", () => {
    const withoutMissingInputs = structuredDimensionAgentOutputSchema.safeParse({
      employmentEpisodes: [],
      projects: [],
      ruleJudgments: [
        {
          evidence: [],
          reason: "证据不足。",
          ruleId: "stability.frequent_unrelated_industries",
          status: "insufficient_evidence",
        },
      ],
      skillFacts: [],
    });
    const withMissingInputs = structuredDimensionAgentOutputSchema.safeParse({
      employmentEpisodes: [],
      projects: [],
      ruleJudgments: [
        {
          evidence: [],
          missingInputs: ["至少一段工作经历缺少可识别的行业或职责"],
          reason: "部分经历缺少行业信息。",
          ruleId: "stability.frequent_unrelated_industries",
          status: "insufficient_evidence",
        },
      ],
      skillFacts: [],
    });

    expect(withoutMissingInputs.success).toBe(true);
    if (withoutMissingInputs.success) {
      expect(withoutMissingInputs.data.ruleJudgments[0]?.missingInputs).not.toHaveLength(0);
    }
    expect(withMissingInputs.success).toBe(true);
  });

  it("keeps project hard gates owned by Gate while deriving dimension relevance", () => {
    const videoGate = {
      category: "work_experience" as const,
      normalizedRequirement: "有视频/内容平台落地经验",
      requirementId: "gate-video-platform",
      sourceRef: { kind: "hard_gate" as const, path: "hardGates.workExperience" },
      sourceText: "有视频/内容平台落地经验",
    };
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
                expectation: "负责内容平台后端服务设计与迭代",
                sourceRef: { kind: "job_description" as const, path: "prompt" },
                sourceText: "负责内容平台后端服务设计与迭代",
              },
            ],
          },
          hardGateRequirements: [videoGate],
        },
      },
      resumeInput: {
        ...workflowInput.resumeInput,
        resumeProfile: {
          ...workflowInput.resumeInput.resumeProfile,
          projectExperiences: [
            {
              name: "园区设备平台",
              period: "2021.01-2022.01",
              role: "开发工程师",
              summary: "负责接入海康视频监控设备。",
              techStack: ["WebAPI"],
            },
            {
              name: "第三方 APP 直播平台",
              period: "2020.01-2021.01",
              role: "负责人",
              summary: "负责 IM 直播、RTMP、HLS、HTTP-FLV 与 CDN 接入。",
              techStack: ["RTMP", "HLS", "HTTP-FLV", "CDN"],
            },
          ],
        },
      },
    };
    const parsed = structuredDimensionAgentOutputSchema.safeParse({
      employmentEpisodes: [],
      projects: [
        {
          id: "project-0",
          requirementJudgments: [
            {
              evidence: [],
              reason: "仅为园区视频监控设备接入。",
              requirementId: "project-expectation-0",
              status: "not_matched",
            },
          ],
        },
        {
          id: "project-1",
          requirementJudgments: [
            {
              evidence: [{ quote: "IM 直播", source: "resume_profile" }],
              reason: "项目直接包含直播平台能力。",
              requirementId: "project-expectation-0",
              status: "matched",
            },
          ],
        },
      ],
      ruleJudgments: [],
      skillFacts: [],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    const normalized = normalizeDimensionOutputWithReusableFacts(input, parsed.data);
    expect(normalized.projects[1]).toMatchObject({
      evaluatedRequirementIds: ["project-expectation-0"],
      matchedRequirementIds: ["project-expectation-0"],
      relevant: true,
    });
    const calculation = computeStructuredResumeCalculation({
      adjustmentOutput: { judgments: [] },
      dimensionOutput: normalized,
      gateOutput: {
        judgments: [
          {
            aiStatus: "failed",
            evidence: [],
            reason: "项目经历集中在其他领域，无视频/内容平台相关经历。",
            requirementId: videoGate.requirementId,
          },
        ],
      },
      workflowInput: input,
    });

    expect(
      calculation.dimensionRuleJudgments.projectMatch.find(
        (judgment) => judgment.ruleId === "project.no_relevant_project",
      ),
    ).toMatchObject({ status: "not_matched" });
    expect(calculation.calculation.gates.judgments[0]).toMatchObject({
      aiStatus: "failed",
      evidence: [{ quote: expect.stringContaining("直播"), source: "resume_profile" }],
      reason: expect.stringContaining("存在视频或直播相关片段"),
    });
  });

  it("recovers an obvious technical-governance project match from canonical project facts", () => {
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
                expectation: "缓存架构、数据库优化和高可用技术治理",
                sourceRef: { kind: "job_description" as const, path: "prompt" },
                sourceText: "缓存架构、数据库优化和高可用技术治理",
              },
            ],
          },
        },
      },
      resumeInput: {
        ...workflowInput.resumeInput,
        resumeProfile: {
          ...workflowInput.resumeInput.resumeProfile,
          projectExperiences: [
            {
              name: "高并发治理项目",
              period: "2024.01-至今",
              role: "技术负责人",
              summary: "利用 Redis 缓存热点数据，通过 Kafka 削峰，并完成分库分表改造。",
              techStack: ["Redis", "Kafka"],
            },
          ],
          scoringFacts: {
            additionalEvidence: [],
            employmentEpisodes: [],
            projects: [
              {
                currentStatus: "current" as const,
                endMonth: null,
                evidence: [],
                sourceIndex: 0,
                startMonth: "2024-01",
              },
            ],
            skillFacts: [],
            version: 1 as const,
          },
        },
      },
    };
    const parsed = structuredDimensionAgentOutputSchema.parse({
      employmentEpisodes: [],
      projects: [
        {
          id: "project-0",
          requirementJudgments: [
            {
              evidence: [],
              missingInputs: [],
              reason: "模型漏判。",
              requirementId: "project-expectation-0",
              status: "not_matched",
            },
          ],
        },
      ],
      ruleJudgments: completeSemanticRuleJudgments,
      skillFacts: [],
    });

    const normalized = normalizeDimensionOutputWithReusableFacts(input, parsed);

    expect(normalized.projects[0]).toMatchObject({
      matchedRequirementIds: ["project-expectation-0"],
      relevant: true,
    });
    expect(normalized.projects[0]?.evidence).toHaveLength(2);
  });

  it("does not deterministically pass a compound experience gate from its first year threshold", () => {
    const compoundGate = {
      category: "work_experience" as const,
      normalizedRequirement: "8年以上后端经验，3年以上管理经验，带过3-6人团队",
      requirementId: "gate-compound-experience",
      sourceRef: { kind: "hard_gate" as const, path: "hardGates.workExperience" },
      sourceText: "8年以上后端经验，3年以上管理经验，带过3-6人团队",
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
            aiStatus: "needs_verification",
            evidence: [],
            experienceEpisodes: [
              {
                current: true,
                endMonth: null,
                evidence: [],
                id: "work-0",
                startMonth: "2012-01",
              },
            ],
            reason: "后端年限明确，但管理年限和团队规模仍需分别核实。",
            requirementId: compoundGate.requirementId,
          },
        ],
      },
      workflowInput: {
        ...workflowInput,
        jobSnapshot: {
          ...workflowInput.jobSnapshot,
          blueprint: { ...blueprint, hardGateRequirements: [compoundGate] },
        },
      },
    });

    expect(calculation.calculation.gates.judgments[0]).toMatchObject({
      aiStatus: "needs_verification",
      reason: expect.stringContaining("管理年限和团队规模"),
    });
  });

  it("fails a passed compound gate when its own reason admits an unmet clause", () => {
    const compoundGate = {
      category: "work_experience" as const,
      normalizedRequirement: "8年以上后端经验，3年以上管理经验，带过3-6人团队",
      requirementId: "gate-contradictory-compound",
      sourceRef: { kind: "hard_gate" as const, path: "hardGates.workExperience" },
      sourceText: "8年以上后端经验，3年以上管理经验，带过3-6人团队",
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
            evidence: [],
            reason: "后端和管理年限满足，但团队管理规模未达3-6人。",
            requirementId: compoundGate.requirementId,
          },
        ],
      },
      workflowInput: {
        ...workflowInput,
        jobSnapshot: {
          ...workflowInput.jobSnapshot,
          blueprint: { ...blueprint, hardGateRequirements: [compoundGate] },
        },
      },
    });

    expect(calculation.calculation.gates.judgments[0]).toMatchObject({
      aiStatus: "failed",
      reason: expect.stringContaining("未满足子条件"),
    });
  });

  it("passes education facts to narrative generation and repairs false missing-education copy", async () => {
    const input = {
      ...workflowInput,
      resumeInput: {
        ...workflowInput.resumeInput,
        resumeProfile: {
          ...workflowInput.resumeInput.resumeProfile,
          educationExperiences: [
            {
              degree: "本科",
              educationLevel: "bachelor" as const,
              graduationYear: "2018",
              major: "计算机科学与技术",
              period: "2016-2018",
              school: "示例大学",
              summary: null,
            },
          ],
          schools: ["示例大学"],
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
      gateOutput: { judgments: [] },
      workflowInput: input,
    });
    generatorCall.mockResolvedValue({
      ...narrativeOutput,
      dimensionComments: {
        ...narrativeOutput.dimensionComments,
        educationBackground: "简历未提供学历信息，无法评估。",
      },
    });

    const narrative = await generateStructuredNarrative(
      { calculationResult, workflowInput: input },
      generator,
    );
    expect(generatorCalls[0]?.prompt).toContain('"educationExperiences"');
    expect(generatorCalls[0]?.prompt).toContain('"hasEducation":true');
    const artifact = assembleStructuredResumeEvaluation({
      calculationResult,
      narrative,
      workflowInput: input,
    });
    expect(artifact.narrative.dimensionComments?.educationBackground ?? "").not.toMatch(
      /未提供学历|没有学历|无学历/u,
    );
  });

  it("uses canonical experience requirement episodes instead of conflicting gate selections", () => {
    const experienceRequirement = {
      relevanceScope: "capability" as const,
      requirementId: "experience-backend-8",
      scopeDescription: "后端开发经验",
      sourceRef: { kind: "job_description" as const, path: "prompt" },
      sourceText: "8年以上后端开发经验",
      years: 8,
    };
    const input = {
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprint: {
          ...blueprint,
          requiredRelevantExperience: experienceRequirement,
          requiredRelevantExperiences: [experienceRequirement],
        },
      },
      resumeInput: {
        ...workflowInput.resumeInput,
        resumeProfile: {
          ...workflowInput.resumeInput.resumeProfile,
          scoringFacts: {
            additionalEvidence: [],
            employmentEpisodes: [
              {
                currentStatus: "current" as const,
                endMonth: null,
                evidence: [],
                gapExplanation: null,
                primaryStatus: "primary" as const,
                sourceIndex: 0,
                startMonth: "2015-01",
              },
            ],
            projects: [],
            skillFacts: [],
            version: 1 as const,
          },
          workExperiences: [
            {
              company: "示例公司",
              period: "2015.01-至今",
              role: "后端开发工程师",
              summary: "负责后端服务开发。",
            },
          ],
        },
      },
    };
    const parsed = structuredDimensionAgentOutputSchema.safeParse({
      employmentEpisodes: [
        {
          evidence: [{ quote: "后端开发工程师", source: "resume_profile" }],
          id: "work-0",
          relevance: "relevant",
          relevanceReason: "后端职责相关。",
        },
      ],
      experienceRequirements: [
        {
          episodeIds: ["work-0"],
          evidence: [{ quote: "后端开发工程师", source: "resume_profile" }],
          missingInputs: [],
          reason: "该任职属于后端开发经历。",
          requirementId: experienceRequirement.requirementId,
          status: "matched",
        },
      ],
      projects: [],
      ruleJudgments: [],
      skillFacts: [],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) {
      return;
    }
    const normalized = normalizeDimensionOutputWithReusableFacts(input, parsed.data);
    const calculation = computeStructuredResumeCalculation({
      adjustmentOutput: { judgments: [] },
      dimensionOutput: normalized,
      gateOutput: {
        judgments: [
          {
            aiStatus: "failed",
            evidence: [],
            experienceEpisodes: [],
            reason: "Gate Agent 未选择任何后端经历。",
            requirementId: experienceRequirement.requirementId,
          },
        ],
      },
      workflowInput: input,
    });

    expect(
      calculation.dimensionRuleJudgments.experienceRelevance.find(
        (judgment) => judgment.ruleId === "experience.missing_year",
      ),
    ).toMatchObject({ status: "not_matched" });
  });

  it("does not treat a missing primary experience timeline as proof that every required year is missing", () => {
    const primaryRequirement = {
      relevanceScope: "capability" as const,
      requirementId: "experience-backend-8",
      scopeDescription: "后端开发经验",
      sourceRef: { kind: "job_description" as const, path: "prompt" },
      sourceText: "8年以上后端开发经验",
      years: 8,
    };
    const managementRequirement = {
      relevanceScope: "role" as const,
      requirementId: "experience-management-3",
      scopeDescription: "技术管理经验",
      sourceRef: { kind: "job_description" as const, path: "prompt" },
      sourceText: "3年以上技术管理经验",
      years: 3,
    };
    const input = {
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprint: {
          ...blueprint,
          hardGateRequirements: [
            {
              category: "work_experience" as const,
              normalizedRequirement: primaryRequirement.sourceText,
              requirementId: "gate-backend-8",
              sourceRef: { kind: "hard_gate" as const, path: "hardGates.workExperience" },
              sourceText: primaryRequirement.sourceText,
            },
          ],
          requiredRelevantExperience: primaryRequirement,
          requiredRelevantExperiences: [primaryRequirement, managementRequirement],
        },
      },
    };
    const judgments = deriveStructuredRuleJudgments(input, {
      employmentEpisodes: [
        {
          current: false,
          endMonth: null,
          evidence: [{ quote: "高级后端开发工程师", source: "resume_profile" as const }],
          gapExplanation: null,
          id: "work-0",
          primaryStatus: "unresolved" as const,
          relevance: "relevant" as const,
          relevanceReason: "职责属于后端开发。",
          startMonth: null,
        },
      ],
      experienceRequirements: [
        {
          episodeIds: [],
          evidence: [],
          reason: "模型遗漏了已经判定为相关的后端任职。",
          requirementId: primaryRequirement.requirementId,
          status: "not_matched" as const,
        },
        {
          episodeIds: [],
          evidence: [],
          reason: "没有技术管理任职。",
          requirementId: managementRequirement.requirementId,
          status: "not_matched" as const,
        },
      ],
      projects: [],
      ruleJudgments: [],
      skillFacts: [],
    });

    expect(
      judgments.experienceRelevance.find((item) => item.ruleId === "experience.missing_year"),
    ).toMatchObject({
      reason: expect.stringContaining("已有相关任职，但时间线不完整"),
      status: "matched",
      units: 3,
    });
  });

  it("requires every conjunctive adjustment clause even when the Agent marks the whole condition", () => {
    const publishedConfig = createDefaultJobDescriptionStructuredConfig();
    publishedConfig.priorityConditions = [
      {
        condition: "具备中台化、服务化、自动化运维体系建设经验",
        id: "priority-platform-ops",
        points: 5,
      },
    ];
    const calculation = computeStructuredResumeCalculation({
      adjustmentOutput: {
        judgments: [
          {
            clauseJudgments: [
              {
                clauseIndex: 0,
                evidence: [{ quote: "中台化", source: "resume_profile" }],
                matched: true,
                reason: "有中台化经验。",
              },
              {
                clauseIndex: 1,
                evidence: [{ quote: "服务化", source: "resume_profile" }],
                matched: true,
                reason: "有服务化经验。",
              },
              {
                clauseIndex: 2,
                evidence: [],
                matched: false,
                reason: "未提及自动化运维。",
              },
            ],
            conditionId: "priority-platform-ops",
            evidence: [{ quote: "中台化", source: "resume_profile" }],
            matched: true,
            reason: "整体符合。",
          },
        ],
      },
      dimensionOutput: {
        employmentEpisodes: [],
        projects: [],
        ruleJudgments: [],
        skillFacts: [],
      },
      gateOutput: { judgments: [] },
      workflowInput: {
        ...workflowInput,
        jobSnapshot: { ...workflowInput.jobSnapshot, publishedConfig },
        resumeInput: {
          ...workflowInput.resumeInput,
          resumeProfile: {
            ...workflowInput.resumeInput.resumeProfile,
            personalStrengths: ["具备中台化和服务化经验"],
          },
        },
      },
    });

    expect(calculation.calculation.priorityPointTotal).toBe(0);
    expect(calculation.calculation.adjustments[0]).toMatchObject({ matched: false });
  });

  it("repairs narrative claims that deny a canonically matched project requirement", () => {
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
                expectation: "有视频/内容平台落地经验",
                sourceRef: { kind: "job_description" as const, path: "prompt" },
                sourceText: "有视频/内容平台落地经验",
              },
            ],
          },
        },
      },
      resumeInput: {
        ...workflowInput.resumeInput,
        resumeProfile: {
          ...workflowInput.resumeInput.resumeProfile,
          projectExperiences: [
            {
              name: "直播平台",
              period: null,
              role: "负责人",
              summary: "负责直播平台后端。",
              techStack: ["RTMP"],
            },
          ],
        },
      },
    };
    const calculationResult = computeStructuredResumeCalculation({
      adjustmentOutput: { judgments: [] },
      dimensionOutput: {
        employmentEpisodes: [],
        projects: [
          {
            current: false,
            endMonth: null,
            evaluatedRequirementIds: ["project-expectation-0"],
            evidence: [{ quote: "直播平台", source: "resume_profile" }],
            id: "project-0",
            matchedRequirementIds: ["project-expectation-0"],
            relevant: true,
            unresolvedRequirementIds: [],
          },
        ],
        ruleJudgments: [],
        skillFacts: [],
      },
      gateOutput: { judgments: [] },
      workflowInput: input,
    });
    const artifact = assembleStructuredResumeEvaluation({
      calculationResult,
      narrative: {
        ...narrativeOutput,
        dimensionComments: {
          ...narrativeOutput.dimensionComments,
          projectMatch: "缺少与岗位直接相关的内容平台项目经验。",
        },
        overallComment: "候选人缺乏视频/内容平台相关项目经验。",
        summary: "候选人没有内容平台项目经验。",
        teamPositioning: {
          rationale: "候选人与内容平台业务不匹配。",
          suggestion: "建议转向其他岗位。",
        },
      },
      workflowInput: input,
    });
    const serializedNarrative = JSON.stringify(artifact.narrative);

    expect(serializedNarrative).not.toMatch(/缺少.*内容平台|缺乏.*视频|没有内容平台/u);
  });
});
