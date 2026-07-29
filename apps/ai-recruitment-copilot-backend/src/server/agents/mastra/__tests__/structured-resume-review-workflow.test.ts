import { describe, expect, it, vi } from "vitest";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import {
  deriveStructuredRuleJudgments,
  evaluateStructuredResume,
  structuredDimensionAgentOutputSchema,
} from "@arc/ai-recruitment-copilot-backend/server/agents/structured-resume-evaluation";

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
});
