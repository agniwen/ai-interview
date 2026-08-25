import { describe, expect, it } from "vitest";
import {
  qualitativeResumeEvaluationSchema,
  qualitativeResumeEvaluationV1Schema,
  qualitativeResumeEvaluationV2Schema,
} from "@arc/db-schema/qualitative-resume-evaluation";

const dimension = (basis: "both" | "general" | "job", evaluation: string) => ({
  basis,
  evaluation,
  level: "recommended" as const,
});

function validEvaluation() {
  return {
    conciseOverall: "核心前端经验与岗位要求高度一致，复杂项目交付证据充分。",
    detailedOverall: {
      judgment: "候选人与岗位核心职责高度契合。",
      matchingEvidence: "近三年持续负责大型前端平台建设，并有明确业务结果。",
      risks: "管理跨度仍需在后续面试中确认。",
    },
    dimensions: {
      educationBackground: dimension("general", "教育经历体现了持续学习能力。"),
      experienceRelevance: dimension("job", "五年相关经验覆盖岗位核心职责。"),
      potential: dimension("general", "职责范围持续扩大，成长轨迹清晰。"),
      projectMatch: dimension("both", "主导项目复杂度和业务成果均有直接证据。"),
      skillMatch: dimension("job", "React 与 TypeScript 实践符合 JD 要求。"),
      stability: dimension("general", "任职变化均有连贯的职责升级。"),
    },
    recommendationLevel: "highly_recommended",
    schemaVersion: 2,
    seniorityRecommendation: {
      level: "高级工程师",
      rationale: "能够独立负责复杂业务域。",
    },
    teamPositioning: null,
  } as const;
}

describe("qualitative resume evaluation contract", () => {
  it("requires a four-level rating alongside every dimension narrative", () => {
    expect(qualitativeResumeEvaluationV2Schema.parse(validEvaluation())).toEqual(validEvaluation());
    const value = validEvaluation();
    const { level: _level, ...skillMatch } = value.dimensions.skillMatch;
    expect(() =>
      qualitativeResumeEvaluationV2Schema.parse({
        ...value,
        dimensions: { ...value.dimensions, skillMatch },
      }),
    ).toThrow();
  });

  it("rejects legacy numeric scoring fields", () => {
    expect(() =>
      qualitativeResumeEvaluationV2Schema.parse({
        ...validEvaluation(),
        compositeScore: 92,
      }),
    ).toThrow();
  });

  it("requires every dimension and a supported evaluation basis", () => {
    const value = validEvaluation();
    const { stability: _stability, ...dimensions } = value.dimensions;
    expect(() => qualitativeResumeEvaluationV2Schema.parse({ ...value, dimensions })).toThrow();
    expect(() =>
      qualitativeResumeEvaluationV2Schema.parse({
        ...value,
        dimensions: {
          ...value.dimensions,
          stability: { basis: "unknown", evaluation: "无法判断。" },
        },
      }),
    ).toThrow();
  });

  it("keeps qualitative-v1 readable without inventing dimension ratings", () => {
    const value = validEvaluation();
    const dimensions = Object.fromEntries(
      Object.entries(value.dimensions).map(([key, { level: _level, ...item }]) => [key, item]),
    );
    const legacy = { ...value, dimensions, schemaVersion: 1 };

    expect(qualitativeResumeEvaluationV1Schema.safeParse(legacy).success).toBe(true);
    expect(qualitativeResumeEvaluationSchema.safeParse(legacy).success).toBe(true);
  });
});
