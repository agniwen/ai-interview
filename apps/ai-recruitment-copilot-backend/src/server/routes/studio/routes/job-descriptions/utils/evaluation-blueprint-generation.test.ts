import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import type { MastraGeneratorLike } from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/simple-generators";
import {
  generateEvaluationBlueprintCandidate,
  JOB_EVALUATION_BLUEPRINT_COMPILER_PROMPT_VERSION,
} from "./evaluation-blueprint-compiler";

const mocks = { generate: vi.fn() };
const agent: MastraGeneratorLike = { generate: mocks.generate };

const skillEducation = {
  auxiliarySkills: [],
  coreSkills: [],
  educationExpectation: null,
};

const incompleteExperience = {
  dimensionExpectations: {
    experienceRelevance: [],
    potential: [],
    projectMatch: [],
    stability: [],
  },
  requiredRelevantExperiences: [
    {
      relevanceScope: "role",
      scopeDescription: "前端研发",
      sourceText: "8年以上前端研发经验",
      years: 8,
    },
  ],
};

const completeExperience = {
  ...incompleteExperience,
  requiredRelevantExperiences: [
    ...incompleteExperience.requiredRelevantExperiences,
    {
      relevanceScope: "capability",
      scopeDescription: "团队管理",
      sourceText: "3年以上团队管理经验",
      years: 3,
    },
  ],
};

describe("generateEvaluationBlueprintCandidate", () => {
  beforeEach(() => {
    mocks.generate.mockReset();
    mocks.generate.mockImplementation((prompt: string) => {
      if (prompt.includes("提取技能与学历评分依据")) {
        return Promise.resolve({ object: skillEducation, text: "" });
      }
      if (prompt.includes("上一次结构化输出无效")) {
        return Promise.resolve({ object: undefined, text: JSON.stringify(completeExperience) });
      }
      return Promise.resolve({ object: incompleteExperience, text: "" });
    });
  });

  it("retries when AI omits one explicit JD experience threshold", async () => {
    const result = await generateEvaluationBlueprintCandidate(
      {
        description: null,
        prompt: "8年以上前端研发经验，3年以上团队管理经验。",
        structuredConfig: createDefaultJobDescriptionStructuredConfig(),
      },
      undefined,
      agent,
    );

    expect(result.requiredRelevantExperiences).toEqual(
      completeExperience.requiredRelevantExperiences,
    );
    expect(mocks.generate).toHaveBeenCalledTimes(3);
    expect(mocks.generate.mock.calls[2]?.[0]).toContain("3年以上团队管理经验");
  });

  it("keeps skills, experience, projects, and priority conditions in separate prompt scopes", async () => {
    await generateEvaluationBlueprintCandidate(
      {
        description: null,
        prompt:
          "任职要求：精通 React。8年以上前端研发经验，3年以上团队管理经验。优先条件：有头部平台从业经验。",
        structuredConfig: createDefaultJobDescriptionStructuredConfig(),
      },
      undefined,
      agent,
    );

    const prompts = mocks.generate.mock.calls.map(([prompt]) => String(prompt));
    const skillPrompt = prompts.find((prompt) => prompt.includes("提取技能与学历评分依据"));
    const experiencePrompt = prompts.find((prompt) =>
      prompt.includes("提取经验、项目、潜力与稳定性评分依据"),
    );

    expect(JOB_EVALUATION_BLUEPRINT_COMPILER_PROMPT_VERSION).toBe("structured-job-blueprint-v9");
    expect(skillPrompt).toContain("岗位职责、经验、项目、管理行为、业务成果和软能力不得作为技能");
    expect(skillPrompt).toContain("核心技能最多 8 项，辅助技能最多 8 项");
    expect(skillPrompt).toContain("优先条件或加分项下的内容不得进入技能");
    expect(experiencePrompt).toContain("优先条件或加分项下的内容不得进入基础评分依据");
  });

  it("reports validated rule-draft snapshots as parallel generation groups complete", async () => {
    const progress: unknown[] = [];
    mocks.generate.mockImplementation((prompt: string) => {
      if (prompt.includes("提取技能与学历评分依据")) {
        return Promise.resolve({
          object: {
            auxiliarySkills: [],
            coreSkills: [{ normalizedSkill: "React", sourceText: "精通 React" }],
            educationExpectation: null,
          },
          text: "",
        });
      }
      return Promise.resolve({ object: completeExperience, text: "" });
    });

    await generateEvaluationBlueprintCandidate(
      {
        description: null,
        prompt: "精通 React。8年以上前端研发经验，3年以上团队管理经验。",
        structuredConfig: createDefaultJobDescriptionStructuredConfig(),
      },
      (ruleDraft) => {
        progress.push(ruleDraft);
      },
      agent,
    );

    expect(progress).toHaveLength(2);
    expect(progress).toContainEqual(expect.objectContaining({ coreSkills: ["React"] }));
    expect(progress).toContainEqual(
      expect.objectContaining({
        requiredRelevantExperience: expect.objectContaining({ years: 8 }),
      }),
    );
  });
});
