import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import {
  computeStructuredResumeCalculation,
  deriveStructuredRuleJudgments,
  evaluateStructuredResume,
  structuredDimensionAgentOutputSchema,
} from "@arc/ai-recruitment-copilot-backend/server/agents/structured-resume-evaluation";
import { computeJobEvaluationPayloadHash } from "@arc/ai-recruitment-copilot-backend/lib/server/job-evaluation-hash";
import { runStructuredResumeReviewWorkflow } from "../workflows/structured-resume-review-workflow";

const generator = vi.hoisted(() => vi.fn());

vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/simple-generators",
  () => ({
    generateStructuredWithMastraAgent: generator,
    structuredResumeAdjustmentAgent: {},
    structuredResumeDimensionAgent: {},
    structuredResumeGateAgent: {},
    structuredResumeNarrativeAgent: {},
  }),
);

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

describe("structured resume workflow contracts", () => {
  beforeEach(() => {
    generator.mockReset();
  });

  it("rejects a blueprint hash mismatch before any Agent call", async () => {
    await expect(evaluateStructuredResume(workflowInput)).rejects.toThrow(
      "STRUCTURED_BLUEPRINT_HASH_MISMATCH",
    );
    expect(generator).not.toHaveBeenCalled();
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
      }).success,
    ).toBe(false);
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
    });

    expect(
      judgments.stability.find((item) => item.ruleId === "stability.two_changes_two_years")?.status,
    ).toBe("not_matched");
    expect(
      judgments.experienceRelevance.find((item) => item.ruleId === "experience.missing_year")
        ?.status,
    ).toBe("not_applicable");
  });

  it("executes semantic judgment, code scoring, narrative, and assembly as real steps", async () => {
    generator
      .mockResolvedValueOnce({ judgments: [] })
      .mockResolvedValueOnce({
        employmentEpisodes: [],
        projects: [],
        ruleJudgments: [],
      })
      .mockResolvedValueOnce({ judgments: [] })
      .mockResolvedValueOnce({
        recommendation: "建议进入下一轮",
        summary: "综合条件符合岗位要求",
      });

    const result = await runStructuredResumeReviewWorkflow({
      ...workflowInput,
      jobSnapshot: {
        ...workflowInput.jobSnapshot,
        blueprintHash: computeJobEvaluationPayloadHash(blueprint),
      },
    });

    expect(generator).toHaveBeenCalledTimes(4);
    expect(result).toMatchObject({
      calculations: { compositeScore: 100 },
      grade: "recommended",
      narrative: { recommendation: "建议进入下一轮" },
    });
  });

  it("normalizes resolved episodes as relevant when the frozen scope is total employment", () => {
    const calculation = computeStructuredResumeCalculation({
      adjustmentOutput: { judgments: [] },
      dimensionOutput: {
        employmentEpisodes: [
          {
            current: false,
            endMonth: "2026-06",
            evidence: [{ quote: "2023.01-2026.06 任职", source: "resume_text" }],
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
});
