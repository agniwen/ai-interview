import { describe, expect, it } from "vitest";
import type {
  QualitativeResumeEvaluation,
  QualitativeResumeEvaluationV3,
} from "@app/db-schema/qualitative-resume-evaluation";
import { selectQualitativeResumeFocus } from "../qualitative-resume-focus";

const dimension = { basis: "job", evaluation: "符合岗位要求。", level: "recommended" } as const;
const dimensions = {
  educationBackground: dimension,
  experienceRelevance: dimension,
  potential: dimension,
  projectMatch: dimension,
  skillMatch: dimension,
  stability: dimension,
};
const base = {
  conciseOverall: "核心经验与岗位匹配。",
  dimensions,
  seniorityRecommendation: null,
  teamPositioning: null,
} as const;

const current: QualitativeResumeEvaluationV3 = {
  ...base,
  detailedOverall: {
    judgment: "整体匹配。",
    matchingEvidence: [
      {
        content: "主导微前端改造。",
        jobRequirement: "具备大型前端架构设计经验",
        point: "架构设计",
        resumeEvidence: "主导微前端改造",
      },
      {
        content: "首屏性能提升明显。",
        jobRequirement: "熟悉前端性能优化",
        point: "性能优化",
        resumeEvidence: "首屏降至 1.4 秒",
      },
    ],
    risks: [
      {
        content: "简历未体现团队管理经历，需面试确认。",
        jobRequirement: "带领 5 人以上前端团队",
        point: "团队管理",
        resumeEvidence: null,
      },
    ],
  },
  recommendationLevel: "recommended",
  schemaVersion: 3,
};

describe("selectQualitativeResumeFocus", () => {
  it("excerpts structured matching points for recommended results", () => {
    expect(selectQualitativeResumeFocus(current)).toEqual({
      format: "points",
      items: [
        {
          content: "主导微前端改造。",
          jobRequirement: "具备大型前端架构设计经验",
          point: "架构设计",
          resumeEvidence: "主导微前端改造",
        },
        {
          content: "首屏性能提升明显。",
          jobRequirement: "熟悉前端性能优化",
          point: "性能优化",
          resumeEvidence: "首屏降至 1.4 秒",
        },
      ],
      kind: "matching",
    });
  });

  it("excerpts structured risks for undecided results", () => {
    expect(selectQualitativeResumeFocus({ ...current, recommendationLevel: "undecided" })).toEqual({
      format: "points",
      items: [
        {
          content: "简历未体现团队管理经历，需面试确认。",
          jobRequirement: "带领 5 人以上前端团队",
          point: "团队管理",
          resumeEvidence: null,
        },
      ],
      kind: "risk",
    });
  });

  it("keeps historical Markdown sections", () => {
    const historical: QualitativeResumeEvaluation = {
      ...base,
      detailedOverall: {
        judgment: "整体匹配。",
        matchingEvidence: "1. 有相关经验。",
        risks: "需确认。",
      },
      recommendationLevel: "highly_recommended",
      schemaVersion: 2,
    };

    expect(selectQualitativeResumeFocus(historical)).toEqual({
      format: "markdown",
      text: "1. 有相关经验。",
    });
    expect(
      selectQualitativeResumeFocus({ ...historical, recommendationLevel: "undecided" }),
    ).toEqual({ format: "markdown", text: "需确认。" });
  });
});
