import { describe, expect, it } from "vitest";
import { createDefaultJobDescriptionStructuredConfig } from "@app/db-schema/job-description-structured-config";
import {
  BlueprintCompilationError,
  buildScoringBlueprintGenerationInput,
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
          requirementGroup: "redis",
          satisfactionMode: "all",
          sourceText: "熟悉 Redis 优先",
        },
      ],
      coreSkills: [
        {
          normalizedSkill: "React",
          requirementGroup: "react",
          satisfactionMode: "all",
          sourceText: "必须熟练掌握 React",
        },
        {
          normalizedSkill: "TypeScript",
          requirementGroup: "typescript",
          satisfactionMode: "all",
          sourceText: "必须熟练掌握 TypeScript",
        },
        {
          normalizedSkill: "PromptOnly",
          requirementGroup: "prompt-only",
          satisfactionMode: "all",
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
        {
          category: "work_experience",
          normalizedRequirement: "3 年后端研发经验",
          sourceText: "3 年后端研发经验",
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
    prompt: "必须掌握 PromptOnly。3 年后端研发经验",
    structuredConfig,
  };
}

describe("compileEvaluationBlueprint", () => {
  it("keeps only source-backed atoms and skills, with stable server ids", () => {
    const firstInput = input();
    firstInput.modelOutput.hardGateAtoms.push({
      category: "required_skills",
      normalizedRequirement: "熟练掌握 React",
      sourceText: "必须熟练掌握 React",
    });
    const first = compileEvaluationBlueprint(firstInput, {
      generatedAt: "2026-07-29T10:00:00.000Z",
      modelId: "test-model",
      promptVersion: "v1",
    });
    const second = compileEvaluationBlueprint(firstInput, {
      generatedAt: "2026-07-29T10:00:00.000Z",
      modelId: "test-model",
      promptVersion: "v1",
    });

    expect(first.hardGateRequirements.map((item) => item.requirementId)).toEqual(
      second.hardGateRequirements.map((item) => item.requirementId),
    );
    expect(first.coreSkills.map((item) => item.normalizedSkill)).toEqual(["React", "PromptOnly"]);
    expect(first.coreSkills[1]?.sourceRef).toEqual({
      kind: "job_description",
      path: "prompt",
    });
    expect(first.auxiliarySkills.map((item) => item.normalizedSkill)).toEqual(["Redis"]);
    expect(
      first.hardGateRequirements.map((requirement) => requirement.normalizedRequirement),
    ).toEqual(["熟练掌握 TypeScript", "PostgreSQL 实战", "3 年后端研发经验"]);
    expect(first.priorityConditions).toEqual([
      {
        condition: "有招聘 SaaS 经验",
        id: "priority-1",
        points: 5,
        sourceText: "有招聘 SaaS 经验",
      },
    ]);
  });

  it("freezes model-classified any-satisfaction skills into one stable requirement group", () => {
    const grouped = input();
    grouped.description = "熟悉 React 或 Vue 任一框架。";
    grouped.modelOutput.coreSkills = [];
    grouped.modelOutput.dimensionExpectations.projectMatch = [];
    grouped.modelOutput.auxiliarySkills = ["React", "Vue"].map((normalizedSkill) => ({
      normalizedSkill,
      requirementGroup: "frontend-framework",
      satisfactionMode: "any" as const,
      sourceText: "熟悉 React 或 Vue 任一框架",
    }));

    const blueprint = compileEvaluationBlueprint(grouped, {
      generatedAt: "2026-07-29T10:00:00.000Z",
      modelId: "test-model",
      promptVersion: "v10",
    });

    expect(new Set(blueprint.auxiliarySkills.map((skill) => skill.requirementGroupId)).size).toBe(
      1,
    );
    expect(blueprint.auxiliarySkills.map((skill) => skill.satisfactionMode)).toEqual([
      "any",
      "any",
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

  it("rejects a preview when AI omits part of the configured hard gates", () => {
    const incomplete = input();
    incomplete.modelOutput.hardGateAtoms = incomplete.modelOutput.hardGateAtoms.filter(
      (atom) => atom.sourceText !== "需要 PostgreSQL 实战",
    );

    expect(() =>
      compileEvaluationBlueprint(incomplete, {
        generatedAt: "2026-07-29T10:00:00.000Z",
        modelId: "test-model",
        promptVersion: "v1",
      }),
    ).toThrow("硬性门槛没有被完整拆分");
  });

  it("does not let one broad source quote stand in for multiple hard-gate clauses", () => {
    const incomplete = input();
    incomplete.modelOutput.hardGateAtoms = [
      {
        category: "required_skills",
        normalizedRequirement: "熟练掌握 TypeScript",
        sourceText: incomplete.structuredConfig.hardGates.requiredSkills,
      },
      ...incomplete.modelOutput.hardGateAtoms.filter((atom) => atom.category !== "required_skills"),
    ];

    expect(() =>
      compileEvaluationBlueprint(incomplete, {
        generatedAt: "2026-07-29T10:00:00.000Z",
        modelId: "test-model",
        promptVersion: "v1",
      }),
    ).toThrow("硬性门槛没有被完整拆分");
  });

  it("keeps every JD experience threshold as an independent scoring requirement", () => {
    const multipleRequirements = input();
    multipleRequirements.prompt =
      "必须掌握 PromptOnly。负责前端架构与团队管理。要求 8 年以上前端开发经验；前端开发经验至少 8 年；3 年以上团队管理经验。";
    multipleRequirements.modelOutput.requiredRelevantExperiences = [
      {
        relevanceScope: "role",
        scopeDescription: "前端开发",
        sourceText: "8 年以上前端开发经验",
        years: 8,
      },
      {
        relevanceScope: "capability",
        scopeDescription: "团队管理",
        sourceText: "3 年以上团队管理经验",
        years: 3,
      },
      {
        relevanceScope: "role",
        scopeDescription: "前端开发",
        sourceText: "前端开发经验至少 8 年",
        years: 8,
      },
    ];

    const blueprint = compileEvaluationBlueprint(multipleRequirements, {
      generatedAt: "2026-07-29T10:00:00.000Z",
      modelId: "test-model",
      promptVersion: "v1",
    });

    expect(
      (blueprint.requiredRelevantExperiences ?? []).map(
        ({ relevanceScope, scopeDescription, years }) => ({
          relevanceScope,
          scopeDescription,
          years,
        }),
      ),
    ).toEqual([
      { relevanceScope: "role", scopeDescription: "前端开发", years: 8 },
      { relevanceScope: "capability", scopeDescription: "团队管理", years: 3 },
    ]);
  });

  it("rejects a preview when AI omits an explicit JD experience threshold", () => {
    const incomplete = input();
    incomplete.prompt = `${incomplete.prompt}。要求 8 年以上前端开发经验；3 年以上团队管理经验。`;
    incomplete.modelOutput.requiredRelevantExperiences.push({
      relevanceScope: "role",
      scopeDescription: "前端开发",
      sourceText: "8 年以上前端开发经验",
      years: 8,
    });

    expect(() =>
      compileEvaluationBlueprint(incomplete, {
        generatedAt: "2026-07-29T10:00:00.000Z",
        modelId: "test-model",
        promptVersion: "v1",
      }),
    ).toThrow("JD 中的明确经验年限没有被完整识别");
  });

  it("does not require configured conditions to be duplicated as base experience scoring", () => {
    const configured = input();
    configured.prompt = `${configured.prompt}。1.5 年以上搜索引擎营销经验优先。`;
    configured.structuredConfig.priorityConditions = [
      {
        condition: "1.5 年以上搜索引擎营销经验优先",
        id: "priority-search-marketing",
        points: 5,
      },
    ];

    expect(() =>
      compileEvaluationBlueprint(configured, {
        generatedAt: "2026-07-29T10:00:00.000Z",
        modelId: "test-model",
        promptVersion: "v1",
      }),
    ).not.toThrow();
  });

  it("does not parse a numbered-list prefix as a decimal experience threshold", () => {
    const numbered = input();
    numbered.prompt = `${numbered.prompt}\n1.10年以上人力资源管理工作经验`;
    numbered.modelOutput.requiredRelevantExperiences.push({
      relevanceScope: "role",
      scopeDescription: "人力资源管理",
      sourceText: "10年以上人力资源管理工作经验",
      years: 10,
    });

    expect(() =>
      compileEvaluationBlueprint(numbered, {
        generatedAt: "2026-07-29T10:00:00.000Z",
        modelId: "test-model",
        promptVersion: "v1",
      }),
    ).not.toThrow();
  });

  it("keeps multiple experience gates and selects the highest threshold for scoring", () => {
    const multipleRequirements = input();
    multipleRequirements.structuredConfig.hardGates.workExperience =
      "至少 3 年后端经验；至少 5 年金融行业经验";
    multipleRequirements.prompt = "必须掌握 PromptOnly。至少 3 年后端经验；至少 5 年金融行业经验";
    multipleRequirements.modelOutput = {
      ...multipleRequirements.modelOutput,
      hardGateAtoms: [
        ...multipleRequirements.modelOutput.hardGateAtoms.filter(
          (atom) => atom.category !== "work_experience",
        ),
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
    multipleRequirements.modelOutput.dimensionExpectations.experienceRelevance = [
      {
        expectation: "至少 3 年后端经验，并能承担核心研发工作",
        sourceText: "至少 3 年后端经验",
      },
    ];

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
    expect(
      blueprint.dimensionExpectations.experienceRelevance.map((item) => item.expectation),
    ).toEqual(["至少 3 年后端经验，并能承担核心研发工作"]);
  });

  it("keeps scoring expectations isolated from structured hard gates", () => {
    const sourced = input();
    sourced.structuredConfig.hardGates.education = "本科及以上";
    sourced.structuredConfig.hardGates.other = "候选人不得存在任职空档";
    sourced.modelOutput.hardGateAtoms.push(
      {
        category: "education",
        normalizedRequirement: "本科及以上",
        sourceText: "本科及以上",
      },
      {
        category: "other",
        normalizedRequirement: "候选人不得存在任职空档",
        sourceText: "候选人不得存在任职空档",
      },
    );
    sourced.modelOutput.educationExpectation = {
      degreeLevel: "bachelor",
      majorExpectation: null,
      sourceText: "本科及以上",
    };
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
        {
          expectation: "不得存在任职空档",
          sourceText: "候选人不得存在任职空档",
        },
      ],
    };
    sourced.prompt = "必须掌握 PromptOnly。3 年后端研发经验。考察系统设计、工程质量与团队协作";

    const blueprint = compileEvaluationBlueprint(sourced, {
      generatedAt: "2026-07-29T10:00:00.000Z",
      modelId: "test-model",
      promptVersion: "v1",
    });

    expect(blueprint.dimensionExpectations.educationBackground).toEqual([]);
    expect(blueprint.educationExpectation).toBeNull();
    expect(blueprint.dimensionExpectations.experienceRelevance[0]?.sourceRef).toEqual({
      kind: "job_description",
      path: "prompt",
    });
    expect(blueprint.dimensionExpectations.stability).toEqual([
      expect.objectContaining({
        expectation: "考察系统设计、工程质量与团队协作",
        sourceRef: { kind: "job_description", path: "prompt" },
      }),
    ]);
  });

  it("corrects role-specific experience mislabeled as total employment", () => {
    const roleExperience = input();
    roleExperience.prompt = "必须掌握 PromptOnly。要求 8 年以上前端开发经验";
    roleExperience.modelOutput.requiredRelevantExperiences = [
      {
        relevanceScope: "total_employment",
        scopeDescription: "前端开发经验",
        sourceText: "8 年以上前端开发经验",
        years: 8,
      },
    ];

    const blueprint = compileEvaluationBlueprint(roleExperience, {
      generatedAt: "2026-07-29T10:00:00.000Z",
      modelId: "test-model",
      promptVersion: "v1",
    });

    expect(blueprint.requiredRelevantExperience).toMatchObject({
      relevanceScope: "role",
      scopeDescription: "前端开发经验",
      years: 8,
    });
  });

  it("keeps overseas project experience but excludes relocation willingness from scoring", () => {
    const overseas = input();
    const sourceText =
      "有海外项目适配经验，熟悉多语言、多时区、海外网络环境下的性能优化，能长期驻外（建议海外项目经验≥2年，请HR确认）";
    overseas.prompt = `${overseas.prompt}。${sourceText}`;
    overseas.modelOutput.dimensionExpectations.experienceRelevance = [
      { expectation: sourceText, sourceText },
    ];
    overseas.modelOutput.dimensionExpectations.stability = [
      { expectation: "可长期驻外并具备跨文化沟通能力", sourceText },
    ];

    const blueprint = compileEvaluationBlueprint(overseas, {
      generatedAt: "2026-07-29T10:00:00.000Z",
      modelId: "test-model",
      promptVersion: "v1",
    });

    expect(blueprint.dimensionExpectations.experienceRelevance[0]?.expectation).toBe(
      "有海外项目适配经验，熟悉多语言、多时区、海外网络环境下的性能优化（建议海外项目经验≥2年，请HR确认）",
    );
    expect(blueprint.dimensionExpectations.stability).toEqual([]);
  });

  it("removes duplicate skill and education benchmarks and caps project benchmarks", () => {
    const overExtracted = input();
    const projectSources = ["项目一", "项目二", "项目三", "项目四", "项目五"];
    overExtracted.prompt = [
      overExtracted.prompt,
      "精通前端工程化",
      "本科及以上",
      ...projectSources,
    ].join("；");
    overExtracted.modelOutput.dimensionExpectations.skillMatch = [
      { expectation: "精通前端工程化", sourceText: "精通前端工程化" },
    ];
    overExtracted.modelOutput.dimensionExpectations.educationBackground = [
      { expectation: "本科及以上", sourceText: "本科及以上" },
    ];
    overExtracted.modelOutput.dimensionExpectations.projectMatch = projectSources.map(
      (sourceText) => ({ expectation: sourceText, sourceText }),
    );

    const blueprint = compileEvaluationBlueprint(overExtracted, {
      generatedAt: "2026-07-29T10:00:00.000Z",
      modelId: "test-model",
      promptVersion: "v1",
    });

    expect(blueprint.dimensionExpectations.skillMatch).toEqual([]);
    expect(blueprint.dimensionExpectations.educationBackground).toEqual([]);
    expect(blueprint.dimensionExpectations.projectMatch.map((item) => item.expectation)).toEqual(
      projectSources.slice(0, 3),
    );
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

describe("buildScoringBlueprintGenerationInput", () => {
  it("depends only on the JD and enabled basic scoring items", () => {
    const firstConfig = createDefaultJobDescriptionStructuredConfig();
    const secondConfig = createDefaultJobDescriptionStructuredConfig();
    secondConfig.hardGates.requiredSkills = "必须掌握绝密门槛技能";
    secondConfig.priorityConditions = [
      { condition: "绝密优先条件", id: "priority-secret", points: 99 },
    ];
    secondConfig.exclusionConditions = [
      { condition: "绝密排除条件", id: "exclusion-secret", points: 98 },
    ];
    secondConfig.weights = {
      educationBackground: 0,
      experienceRelevance: 0,
      potential: 0,
      projectMatch: 0,
      skillMatch: 100,
      stability: 0,
    };
    secondConfig.deductionRules["skill.missing_core"].points = 77;

    const first = buildScoringBlueprintGenerationInput({
      description: "旧描述",
      prompt: "完整 JD",
      structuredConfig: firstConfig,
    });
    const second = buildScoringBlueprintGenerationInput({
      description: "旧描述",
      prompt: "完整 JD",
      structuredConfig: secondConfig,
    });

    expect(second).toEqual(first);
    expect(JSON.stringify(second)).not.toContain("绝密");
    expect(second.scoringItems.dimensions).toHaveLength(6);
    expect(second.scoringItems.enabledRuleIds).toContain("skill.missing_core");
  });

  it("passes enabled rule identities but not their point values", () => {
    const structuredConfig = createDefaultJobDescriptionStructuredConfig();
    structuredConfig.deductionRules["skill.shallow"].enabled = false;

    const generationInput = buildScoringBlueprintGenerationInput({
      description: null,
      prompt: "完整 JD",
      structuredConfig,
    });

    expect(generationInput.scoringItems.enabledRuleIds).not.toContain("skill.shallow");
    expect(generationInput.scoringItems.enabledRuleIds).toContain("skill.missing_core");
    expect(generationInput.scoringItems).not.toHaveProperty("weights");
    expect(generationInput.scoringItems).not.toHaveProperty("points");
  });
});
