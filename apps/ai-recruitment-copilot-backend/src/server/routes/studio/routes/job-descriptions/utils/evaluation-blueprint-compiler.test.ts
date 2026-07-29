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
      requiredRelevantExperience: {
        relevanceScope: "role",
        scopeDescription: "后端研发",
        sourceText: "3 年后端研发经验",
        years: 3,
      },
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
    expect(first.coreSkills.map((item) => item.normalizedSkill)).toEqual(["React", "TypeScript"]);
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
});
