import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RestrictedMarkdownView } from "@/components/features/display/markdown-view";
import { QualitativeEvaluationDetails } from "../qualitative-resume-evaluation-panel";

const dimension = (
  basis: "both" | "general" | "job",
  evaluation: string,
  level: "highly_recommended" | "not_recommended" | "recommended" | "undecided",
) => ({
  basis,
  evaluation,
  level,
});

const withoutLevel = ({
  basis,
  evaluation: dimensionEvaluation,
}: ReturnType<typeof dimension>) => ({
  basis,
  evaluation: dimensionEvaluation,
});

const evaluation = {
  conciseOverall: "核心前端经验与岗位要求高度一致，复杂项目交付证据充分。",
  detailedOverall: {
    judgment: "候选人与岗位核心职责高度契合。",
    matchingEvidence: "- 近三年持续负责大型前端平台建设\n- 有明确业务结果",
    risks: "**核心风险**\n\n1. 管理跨度仍需确认\n2. 行业迁移能力需要验证",
  },
  dimensions: {
    educationBackground: dimension("general", "教育经历体现了持续学习能力。", "undecided"),
    experienceRelevance: dimension("job", "五年相关经验覆盖岗位核心职责。", "recommended"),
    potential: dimension("general", "职责范围持续扩大，成长轨迹清晰。", "recommended"),
    projectMatch: dimension("both", "主导项目复杂度和业务成果均有直接证据。", "highly_recommended"),
    skillMatch: dimension("job", "React 与 TypeScript 实践符合 JD 要求。", "highly_recommended"),
    stability: dimension("general", "任职变化均有连贯的职责升级。", "not_recommended"),
  },
  recommendationLevel: "highly_recommended",
  schemaVersion: 2,
  seniorityRecommendation: {
    level: "高级工程师",
    rationale: "能够独立负责复杂业务域。",
  },
  teamPositioning: null,
} as const;

describe("RestrictedMarkdownView", () => {
  it("only renders emphasis and lists as rich text", () => {
    const html = renderToStaticMarkup(
      <RestrictedMarkdownView
        content={
          "# 标题\n\n[链接](https://example.com) `代码` <script>危险</script>\n\n**重点** *补充*\n\n- 风险一"
        }
      />,
    );

    expect(html).toContain("<strong>重点</strong>");
    expect(html).toContain("<em>补充</em>");
    expect(html).toContain("<ul>");

    expect(html).not.toContain("<h1");
    expect(html).not.toContain("<a");
    expect(html).not.toContain("<code");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("href=");
  });

  it("repairs inline unordered-list markers from existing evaluations", () => {
    const html = renderToStaticMarkup(
      <RestrictedMarkdownView content="- 风险一。- 风险二。- 风险三。" />,
    );

    expect(html.match(/<li>/g)).toHaveLength(3);
    expect(html).not.toContain("。- ");
  });

  it("repairs inline ordered-list markers from existing evaluations", () => {
    const html = renderToStaticMarkup(
      <RestrictedMarkdownView content="1. 风险一。2. 风险二。3. 风险三。" />,
    );

    expect(html).toContain("<ol>");
    expect(html.match(/<li>/g)).toHaveLength(3);
    expect(html).not.toContain("。2. ");
  });
});

describe("QualitativeEvaluationDetails", () => {
  it("does not invent dimension levels for qualitative-v1 history", () => {
    const dimensions = {
      educationBackground: withoutLevel(evaluation.dimensions.educationBackground),
      experienceRelevance: withoutLevel(evaluation.dimensions.experienceRelevance),
      potential: withoutLevel(evaluation.dimensions.potential),
      projectMatch: withoutLevel(evaluation.dimensions.projectMatch),
      skillMatch: withoutLevel(evaluation.dimensions.skillMatch),
      stability: withoutLevel(evaluation.dimensions.stability),
    };
    const legacy = { ...evaluation, dimensions, schemaVersion: 1 } as const;
    const html = renderToStaticMarkup(<QualitativeEvaluationDetails evaluation={legacy} />);

    expect(html).toContain("此结果生成于六维评级引入前");
    expect(html).not.toContain('aria-label="简历六维定性评价雷达图"');
  });
});
