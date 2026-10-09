import { describe, expect, it } from "vitest";
import { createDefaultJobDescriptionStructuredConfig } from "@app/db-schema/job-description-structured-config";
import { compileEvaluationBlueprint } from "./evaluation-blueprint-compiler";
import type { CompileEvaluationBlueprintInput } from "./evaluation-blueprint-compiler";

function emptyInput(
  prompt: string,
  description: string | null = null,
): CompileEvaluationBlueprintInput {
  return {
    description,
    modelOutput: {
      auxiliarySkills: [],
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
      hardGateAtoms: [],
      requiredRelevantExperiences: [],
    },
    prompt,
    structuredConfig: createDefaultJobDescriptionStructuredConfig(),
  };
}

function compile(input: CompileEvaluationBlueprintInput) {
  return compileEvaluationBlueprint(input, {
    generatedAt: "2026-08-04T10:00:00.000Z",
    modelId: "test-model",
    promptVersion: "v9",
  });
}

function skillCandidate(normalizedSkill: string, sourceText: string) {
  return {
    normalizedSkill,
    requirementGroup: normalizedSkill,
    satisfactionMode: "all" as const,
    sourceText,
  };
}

describe("evaluation blueprint scoring quality", () => {
  it("keeps experience, project, soft capabilities, and priority items out of skill deductions", () => {
    const skillRequirement =
      "精通TS/JS、主流Vue3/React技术栈，熟练前端工程化，熟悉视频流媒体、H5互动、性能监控体系";
    const input = emptyInput(
      [
        "岗位职责",
        "负责前端架构规划，搭建技术体系并支撑业务落地。",
        "任职要求",
        "8年以上前端研发经验，3年以上团队管理经验，带过3-6人技术小组。",
        skillRequirement,
        "具备视频内容平台增长、商业化项目落地经验，能独立拆解需求、把控项目、攻坚技术难点。",
        "结果导向，跨部门协同能力强，兼顾业务落地与技术体系建设。",
        "优先条件",
        "字节、芒果、B站、快手等头部内容平台从业经验。",
      ].join("\n"),
    );
    input.modelOutput.coreSkills = [
      ...["TypeScript/JavaScript", "Vue3/React", "前端工程化"].map((normalizedSkill) => ({
        ...skillCandidate(normalizedSkill, skillRequirement),
      })),
      skillCandidate("需求拆解", "能独立拆解需求、把控项目、攻坚技术难点"),
      skillCandidate("视频内容平台增长", "具备视频内容平台增长、商业化项目落地经验"),
      skillCandidate("团队管理", "3年以上团队管理经验"),
      skillCandidate("跨部门协同", "结果导向，跨部门协同能力强，兼顾业务落地与技术体系建设"),
    ];
    input.modelOutput.auxiliarySkills = [
      ...["视频流媒体", "H5互动", "性能监控体系"].map((normalizedSkill) => ({
        ...skillCandidate(normalizedSkill, skillRequirement),
      })),
      skillCandidate("头部内容平台从业经验", "字节、芒果、B站、快手等头部内容平台从业经验"),
    ];
    input.modelOutput.requiredRelevantExperiences = [
      {
        relevanceScope: "role",
        scopeDescription: "前端研发",
        sourceText: "8年以上前端研发经验",
        years: 8,
      },
      {
        relevanceScope: "capability",
        scopeDescription: "团队管理",
        sourceText: "3年以上团队管理经验",
        years: 3,
      },
    ];
    input.modelOutput.dimensionExpectations.experienceRelevance = [
      {
        expectation: "视频内容平台增长、商业化项目落地经验",
        sourceText: "具备视频内容平台增长、商业化项目落地经验",
      },
      {
        expectation: "头部内容平台从业经验",
        sourceText: "字节、芒果、B站、快手等头部内容平台从业经验",
      },
    ];

    const blueprint = compile(input);

    expect(blueprint.coreSkills.map((skill) => skill.normalizedSkill)).toEqual([
      "TypeScript/JavaScript",
      "Vue3/React",
      "前端工程化",
    ]);
    expect(blueprint.auxiliarySkills.map((skill) => skill.normalizedSkill)).toEqual([
      "视频流媒体",
      "H5互动",
      "性能监控体系",
    ]);
    expect(
      blueprint.dimensionExpectations.experienceRelevance.map(
        (expectation) => expectation.sourceText,
      ),
    ).toEqual(["3年以上团队管理经验", "具备视频内容平台增长、商业化项目落地经验"]);
  });

  it("caps generated skill deductions at eight per tier", () => {
    const coreSkills = [
      "React",
      "Vue",
      "Angular",
      "Svelte",
      "TypeScript",
      "JavaScript",
      "Node.js",
      "Vite",
      "Webpack",
    ];
    const auxiliarySkills = [
      "Redis",
      "PostgreSQL",
      "MySQL",
      "MongoDB",
      "Docker",
      "Kubernetes",
      "GitHub Actions",
      "Jenkins",
      "Prometheus",
    ];
    const coreSource = `必须熟练掌握 ${coreSkills.join("、")}`;
    const auxiliarySource = `熟悉 ${auxiliarySkills.join("、")}`;
    const input = emptyInput(`${coreSource}。${auxiliarySource}。`);
    input.modelOutput.coreSkills = coreSkills.map((normalizedSkill) =>
      skillCandidate(normalizedSkill, coreSource),
    );
    input.modelOutput.auxiliarySkills = auxiliarySkills.map((normalizedSkill) =>
      skillCandidate(normalizedSkill, auxiliarySource),
    );

    const blueprint = compile(input);

    expect(blueprint.coreSkills).toHaveLength(8);
    expect(blueprint.auxiliarySkills).toHaveLength(8);
  });

  it("keeps a technical skill when its source sentence also mentions experience", () => {
    const skillSource = "8年以上前端研发经验，精通 React";
    const input = emptyInput(skillSource);
    input.modelOutput.coreSkills = [skillCandidate("React", skillSource)];
    input.modelOutput.requiredRelevantExperiences = [
      {
        relevanceScope: "role",
        scopeDescription: "前端研发",
        sourceText: "8年以上前端研发经验",
        years: 8,
      },
    ];

    expect(compile(input).coreSkills.map((skill) => skill.normalizedSkill)).toEqual(["React"]);
  });

  it("keeps a base requirement even when the same text is repeated under priority conditions", () => {
    const input = emptyInput("优先条件\n熟悉 Redis", "任职要求\n熟悉 Redis");
    input.modelOutput.auxiliarySkills = [skillCandidate("Redis", "熟悉 Redis")];

    expect(compile(input).auxiliarySkills.map((skill) => skill.normalizedSkill)).toEqual(["Redis"]);
  });
});
