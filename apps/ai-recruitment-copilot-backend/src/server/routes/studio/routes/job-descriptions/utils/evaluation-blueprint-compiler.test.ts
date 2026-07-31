import { describe, expect, it } from "vitest";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import {
  BlueprintCompilationError,
  compileEvaluationBlueprint,
} from "./evaluation-blueprint-compiler";
import type { CompileEvaluationBlueprintInput } from "./evaluation-blueprint-compiler";

function input(): CompileEvaluationBlueprintInput {
  const structuredConfig = createDefaultJobDescriptionStructuredConfig();
  structuredConfig.hardGates.requiredSkills = "必须熟练掌握 TypeScript；需要 PostgreSQL 实战";
  structuredConfig.hardGates.workExperience = "3 年后端研发经验";
  structuredConfig.priorityConditions = [
    { condition: "有招聘 SaaS 经验", id: "priority-1", points: 5 },
  ];
  return {
    description: "必须熟练掌握 React。熟悉 Redis 优先。负责复杂业务项目的核心开发。",
    modelOutput: {
      auxiliarySkills: [
        {
          normalizedSkill: "Redis",
          sourceText: "熟悉 Redis 优先",
        },
      ],
      coreSkills: [
        {
          normalizedSkill: "React",
          sourceText: "必须熟练掌握 React",
        },
        {
          normalizedSkill: "TypeScript",
          sourceText: "必须熟练掌握 TypeScript",
        },
        {
          normalizedSkill: "PromptOnly",
          sourceText: "必须掌握 PromptOnly",
        },
      ],
      dimensionExpectations: {
        educationBackground: [],
        experienceRelevance: [],
        potential: [],
        projectMatch: [
          {
            expectation: "负责复杂业务项目的核心开发",
            sourceText: "负责复杂业务项目的核心开发",
          },
        ],
        skillMatch: [],
        stability: [],
      },
      educationExpectation: null,
      hardGateAtoms: [
        {
          category: "required_skills",
          normalizedRequirement: "熟练掌握 TypeScript",
          sourceText: "必须熟练掌握 TypeScript",
        },
        {
          category: "required_skills",
          normalizedRequirement: "PostgreSQL 实战",
          sourceText: "需要 PostgreSQL 实战",
        },
      ],
      requiredRelevantExperiences: [
        {
          relevanceScope: "role",
          scopeDescription: "后端研发",
          sourceText: "3 年后端研发经验",
          years: 3,
        },
      ],
    },
    prompt: "必须掌握 PromptOnly",
    structuredConfig,
  };
}

describe("compileEvaluationBlueprint", () => {
  it("keeps only source-backed atoms and skills, with stable server ids", () => {
    const first = compileEvaluationBlueprint(input(), {
      generatedAt: "2026-07-29T10:00:00.000Z",
      modelId: "test-model",
      promptVersion: "v1",
    });
    const second = compileEvaluationBlueprint(input(), {
      generatedAt: "2026-07-29T10:00:00.000Z",
      modelId: "test-model",
      promptVersion: "v1",
    });

    expect(first.hardGateRequirements.map((item) => item.requirementId)).toEqual(
      second.hardGateRequirements.map((item) => item.requirementId),
    );
    expect(first.coreSkills.map((item) => item.normalizedSkill)).toEqual([
      "React",
      "TypeScript",
      "PromptOnly",
    ]);
    expect(first.coreSkills[2]?.sourceRef).toEqual({
      kind: "job_description",
      path: "prompt",
    });
    expect(first.auxiliarySkills.map((item) => item.normalizedSkill)).toEqual(["Redis"]);
    expect(first.priorityConditions).toEqual([
      {
        condition: "有招聘 SaaS 经验",
        id: "priority-1",
        points: 5,
        sourceText: "有招聘 SaaS 经验",
      },
    ]);
  });

  it("rejects invented atoms and requirement limits", () => {
    const invented = input();
    invented.modelOutput.hardGateAtoms[0] = {
      category: "required_skills",
      normalizedRequirement: "Kubernetes",
      sourceText: "必须掌握 Kubernetes",
    };
    expect(() =>
      compileEvaluationBlueprint(invented, {
        generatedAt: "2026-07-29T10:00:00.000Z",
        modelId: "test-model",
        promptVersion: "v1",
      }),
    ).toThrow(BlueprintCompilationError);

    const tooMany = input();
    tooMany.structuredConfig.hardGates.requiredSkills = Array.from(
      { length: 21 },
      (_, index) => `技能${index}`,
    ).join(";");
    tooMany.modelOutput.hardGateAtoms = Array.from({ length: 21 }, (_, index) => ({
      category: "required_skills" as const,
      normalizedRequirement: `技能${index}`,
      sourceText: `技能${index}`,
    }));
    expect(() =>
      compileEvaluationBlueprint(tooMany, {
        generatedAt: "2026-07-29T10:00:00.000Z",
        modelId: "test-model",
        promptVersion: "v1",
      }),
    ).toThrow("单个硬性门槛分类不能超过 20 项");
  });

  it("keeps multiple experience gates and selects the highest threshold for scoring", () => {
    const multipleRequirements = input();
    multipleRequirements.structuredConfig.hardGates.workExperience =
      "至少 3 年后端经验；至少 5 年金融行业经验";
    multipleRequirements.modelOutput = {
      ...multipleRequirements.modelOutput,
      hardGateAtoms: [
        ...multipleRequirements.modelOutput.hardGateAtoms,
        {
          category: "work_experience",
          normalizedRequirement: "至少 3 年后端经验",
          sourceText: "至少 3 年后端经验",
        },
        {
          category: "work_experience",
          normalizedRequirement: "至少 5 年金融行业经验",
          sourceText: "至少 5 年金融行业经验",
        },
      ],
      requiredRelevantExperiences: [
        {
          relevanceScope: "role",
          scopeDescription: "后端",
          sourceText: "至少 3 年后端经验",
          years: 3,
        },
        {
          relevanceScope: "industry",
          scopeDescription: "金融行业",
          sourceText: "至少 5 年金融行业经验",
          years: 5,
        },
      ],
    };

    const blueprint = compileEvaluationBlueprint(multipleRequirements, {
      generatedAt: "2026-07-29T10:00:00.000Z",
      modelId: "test-model",
      promptVersion: "v1",
    });

    expect(
      blueprint.hardGateRequirements
        .filter((requirement) => requirement.category === "work_experience")
        .map((requirement) => requirement.normalizedRequirement),
    ).toEqual(["至少 3 年后端经验", "至少 5 年金融行业经验"]);
    expect(blueprint.requiredRelevantExperience).toMatchObject({
      relevanceScope: "industry",
      scopeDescription: "金融行业",
      years: 5,
    });
  });

  it("accepts dimension expectations sourced from structured gates and the job prompt", () => {
    const sourced = input();
    sourced.structuredConfig.hardGates.education = "本科及以上";
    sourced.modelOutput.dimensionExpectations = {
      educationBackground: [
        {
          expectation: "本科及以上",
          sourceText: "本科及以上",
        },
      ],
      experienceRelevance: [
        {
          expectation: "3 年后端研发经验",
          sourceText: "3 年后端研发经验",
        },
      ],
      potential: [],
      projectMatch: [],
      skillMatch: [],
      stability: [
        {
          expectation: "考察系统设计、工程质量与团队协作",
          sourceText: "考察系统设计、工程质量与团队协作",
        },
      ],
    };
    sourced.prompt = "必须掌握 PromptOnly。考察系统设计、工程质量与团队协作";

    const blueprint = compileEvaluationBlueprint(sourced, {
      generatedAt: "2026-07-29T10:00:00.000Z",
      modelId: "test-model",
      promptVersion: "v1",
    });

    expect(blueprint.dimensionExpectations.educationBackground[0]?.sourceRef).toEqual({
      kind: "hard_gate",
      path: "hardGates.education",
    });
    expect(blueprint.dimensionExpectations.experienceRelevance[0]?.sourceRef).toEqual({
      kind: "hard_gate",
      path: "hardGates.workExperience",
    });
    expect(blueprint.dimensionExpectations.stability[0]?.sourceRef).toEqual({
      kind: "job_description",
      path: "prompt",
    });
  });

  it("still rejects a dimension expectation with no source in the job inputs", () => {
    const invented = input();
    invented.modelOutput.dimensionExpectations.potential = [
      {
        expectation: "候选人必须展现创业精神",
        sourceText: "候选人必须展现创业精神",
      },
    ];

    expect(() =>
      compileEvaluationBlueprint(invented, {
        generatedAt: "2026-07-29T10:00:00.000Z",
        modelId: "test-model",
        promptVersion: "v1",
      }),
    ).toThrow(
      expect.objectContaining({
        code: "JOB_BLUEPRINT_INVENTED_EXPECTATION",
      }),
    );
  });
});
