import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import type { MastraGeneratorLike } from "@app/server/server/agents/mastra/agents/simple-generators";
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

    expect(mocks.generate).toHaveBeenCalledTimes(3);
    expect(mocks.generate.mock.calls[2]?.[0]).toContain("3年以上团队管理经验");
    expect(result.requiredRelevantExperiences).toEqual(
      completeExperience.requiredRelevantExperiences,
    );
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

    expect(JOB_EVALUATION_BLUEPRINT_COMPILER_PROMPT_VERSION).toBe("structured-job-blueprint-v11");
    expect(skillPrompt).toContain("岗位职责、经验、项目、管理行为、业务成果和软能力不得作为技能");
    expect(skillPrompt).toContain("核心技能最多 8 项，辅助技能最多 8 项");
    expect(skillPrompt).toContain("优先条件或加分项下的内容不得进入技能");
    expect(skillPrompt).toContain("严格服从原文，不得改写关系");
    expect(skillPrompt).toContain("互为替代、属于同类方案且掌握任意一种即可");
    expect(skillPrompt).toContain("需要共同使用、能力互补或分别支撑不同职责");
    expect(experiencePrompt).toContain("优先条件或加分项下的内容不得进入基础评分依据");
  });

  it("preserves explicit and inferred AND/OR relations while compiling hard gates", async () => {
    const structuredConfig = createDefaultJobDescriptionStructuredConfig();
    structuredConfig.hardGates.requiredSkills = "Go 或 Java 均可";
    mocks.generate.mockImplementation((prompt: string) => {
      if (prompt.includes("提取技能与学历评分依据")) {
        return Promise.resolve({ object: skillEducation, text: "" });
      }
      if (prompt.includes("HR 已配置的硬性门槛")) {
        return Promise.resolve({
          object: {
            hardGateAtoms: [
              {
                category: "required_skills",
                normalizedRequirement: "掌握 Go 或 Java 任一语言",
                sourceText: "Go 或 Java 均可",
              },
            ],
          },
          text: "",
        });
      }
      return Promise.resolve({
        object: {
          dimensionExpectations: {
            experienceRelevance: [],
            potential: [],
            projectMatch: [],
            stability: [],
          },
          requiredRelevantExperiences: [],
        },
        text: "",
      });
    });

    await generateEvaluationBlueprintCandidate(
      { description: null, prompt: "Go 或 Java 均可", structuredConfig },
      undefined,
      agent,
    );

    const hardGatePrompt = mocks.generate.mock.calls
      .map(([prompt]) => String(prompt))
      .find((prompt) => prompt.includes("HR 已配置的硬性门槛"));
    expect(hardGatePrompt).toContain("严格保留原文的 AND / OR 关系");
    expect(hardGatePrompt).toContain("不得拆成多个都必须满足的原子项");
    expect(hardGatePrompt).toContain("由模型根据语义判断");
  });

  it("reports validated rule-draft snapshots as parallel generation groups complete", async () => {
    const progress: unknown[] = [];
    mocks.generate.mockImplementation((prompt: string) => {
      if (prompt.includes("提取技能与学历评分依据")) {
        return Promise.resolve({
          object: {
            auxiliarySkills: [],
            coreSkills: [
              {
                normalizedSkill: "React",
                requirementGroup: "react",
                satisfactionMode: "all",
                sourceText: "精通 React",
              },
            ],
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
