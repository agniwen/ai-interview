import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RestrictedMarkdownView } from "@/components/features/display/markdown-view";
import {
  QualitativeEvaluationDetails,
  QualitativeRecommendationIndicator,
} from "../qualitative-resume-evaluation-panel";

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

describe("QualitativeRecommendationIndicator", () => {
  it.each([
    ["not_recommended", "不推荐", "red"],
    ["undecided", "待定", "yellow"],
    ["recommended", "推荐", "green"],
    ["highly_recommended", "非常推荐", "purple"],
  ] as const)("maps %s to its label and color", (level, label, color) => {
    const html = renderToStaticMarkup(<QualitativeRecommendationIndicator level={level} />);
    expect(html).toContain(label);
    expect(html).toContain(color);
    expect(html).toContain("<svg");
    expect(html).not.toContain('data-slot="badge"');
    expect(html).not.toContain("border-");
    expect(html).not.toContain("bg-");
  });
});

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
    expect(html).toContain("text-foreground");
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
  it("keeps the previous frame-card presentation for text evaluations", () => {
    const html = renderToStaticMarkup(<QualitativeEvaluationDetails evaluation={evaluation} />);

    expect(html.match(/data-slot="frame"/g)).toHaveLength(3);
    expect(html.match(/data-slot="frame-panel"/g)).toHaveLength(6);
    expect(html.match(/data-qualitative-dimension-group/g)).toHaveLength(3);
    expect(html.match(/data-qualitative-dimension-header/g)).toHaveLength(6);
    expect(html.match(/data-qualitative-dimension-basis/g)).toHaveLength(6);
    expect(html.match(/data-qualitative-recommendation/g)).toHaveLength(7);
    expect(html.match(/lg:rounded-\[2px\]/g)).toHaveLength(4);
    expect(html).toContain("lg:rounded-tl-xl");
    expect(html).toContain("lg:rounded-tr-xl");
    expect(html).toContain("lg:rounded-bl-xl");
    expect(html).toContain("lg:rounded-br-xl");
    expect(html).not.toContain('data-slot="badge"');
    expect(html).not.toContain('data-slot="card"');
    expect(html).toContain(">综合评价<");
    expect(html).toContain(evaluation.conciseOverall);
    expect(html).toContain("data-qualitative-overall-judgment");
    expect(html).toContain('class="grid gap-5 md:grid-cols-2"');
    expect(html).toContain("<strong>核心风险</strong>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<ul>");
    expect(html).not.toContain("**核心风险**");
    expect(html).toContain('aria-label="简历六维定性评价雷达图"');
    expect(html).toContain(
      'data-radar-order="skillMatch,experienceRelevance,projectMatch,educationBackground,potential,stability"',
    );
    expect(html).toContain('data-radar-max-score="4"');
    expect(html).toContain("技能匹配");
    expect(html).toContain("非常推荐");
    expect(html).toContain("不推荐");
    expect(html).toContain("React 与 TypeScript 实践符合 JD 要求。");
    expect(html).toContain("根据岗位要求分析得出");
    expect(html).toContain("根据通用职业标准分析得出");
    expect(html).toContain("根据岗位要求和通用职业标准分析得出");
    expect(html).not.toMatch(/typeset[^"]*text-muted-foreground/);
  });

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
