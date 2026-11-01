import type { ResumeLibraryDetail } from "@app/shared/studio-resumes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ResumeLibraryEvaluationSummary } from "./resume-library-evaluation-summary";
import type { ResumeEvaluationSummaryRecord } from "./resume-library-evaluation-summary";
import { ResumeOverviewAiScoreSection } from "./resume-overview-ai-score-section";
import {
  QualitativeResumeEvaluationPanel,
  QualitativeEvaluationDetails,
} from "./qualitative-resume-evaluation-panel";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import { RestrictedMarkdownView } from "@/components/features/display/markdown-view";

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

const record: ResumeEvaluationSummaryRecord = {
  jobDescriptionId: "job-1",
  jobEvaluationMode: "qualitative",
  qualitativeRecommendationLevel: "highly_recommended",
  qualitativeResumeSummary: evaluation.conciseOverall,
  resumeEvaluationArtifactMode: "qualitative",
  resumeReviewBaseScore: 95,
  resumeReviewNextStepAction: null,
  resumeReviewStatus: "ready",
  resumeSummary: "旧版评分摘要",
  structuredCompositeScore: 95,
  structuredGateStatus: "passed",
  structuredScoreGrade: "recommended",
};

function makeDetail(overrides: Partial<ResumeLibraryDetail> = {}) {
  // SAFETY: This fixture supplies every field consumed by the tested evaluation-only branches.
  return {
    ...record,
    id: "resume-1",
    qualitativeResumeEvaluation: evaluation,
    ...overrides,
  } as ResumeLibraryDetail;
}

describe("Desktop evaluation presentation", () => {
  it("uses qualitative fields and never leaks residual historical scores into new cards", () => {
    const html = renderToStaticMarkup(<ResumeLibraryEvaluationSummary record={record} />);
    expect(html).toContain("非常推荐");
    expect(html).toContain(evaluation.conciseOverall);
    expect(html).not.toMatch(/>95(?: 分)?</);
    expect(html).not.toContain("旧版评分摘要");
    expect(html).not.toContain("门槛");
  });

  it.each(["queued", "processing", "failed"] as const)(
    "retains completed historical results during a %s replacement",
    (status) => {
      const html = renderToStaticMarkup(
        <ResumeLibraryEvaluationSummary
          record={{
            ...record,
            resumeEvaluationArtifactMode: "structured",
            resumeReviewStatus: status,
          }}
        />,
      );
      expect(html).toContain("历史评分");
      expect(html).toContain("95 分");
      expect(html).toContain("上一次已完成的结果");
      expect(html).not.toContain("data-qualitative-recommendation");
    },
  );

  it("renders the new overview with six advisory levels instead of a numeric score", () => {
    const html = renderToStaticMarkup(<ResumeOverviewAiScoreSection detail={makeDetail()} />);
    expect(html).toContain("非常推荐");
    expect(html).toContain('data-radar-max-score="4"');
    expect(html).toContain(evaluation.detailedOverall.judgment);
    expect(html).not.toContain("综合评分");
    expect(html).not.toMatch(/>95(?: 分)?</);
  });

  it("keeps empty and unbound resumes out of the old score placeholder", () => {
    const html = renderToStaticMarkup(
      <ResumeOverviewAiScoreSection
        detail={makeDetail({
          jobDescriptionId: null,
          qualitativeResumeEvaluation: null,
          resumeEvaluationArtifactMode: null,
        })}
      />,
    );
    expect(html).toContain("请先为候选人关联岗位");
    expect(html).not.toContain("综合评分");
    expect(html).not.toContain("维度评分雷达图");
  });

  it("renders complete history and failure details without hiding the last result", () => {
    const client = new QueryClient({ defaultOptions: { queries: { gcTime: 0, retry: false } } });
    client.setQueryData(["resume-evaluation-history", "workspace", "resume-1", "failed"], {
      failures: [
        {
          contractVersion: "qualitative-v2",
          createdAt: "2026-08-25T00:00:00Z",
          errorMessage: "评估服务不可用",
          id: "failure",
          jobDescriptionVersion: 3,
        },
      ],
      records: [
        {
          artifact: evaluation,
          contractVersion: "qualitative-v2",
          createdAt: "2026-08-24T00:00:00Z",
          id: "prior",
          isCurrent: false,
          jobDescriptionVersion: 2,
          numericScore: null,
          recommendationLevel: "highly_recommended",
        },
      ],
    });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <QualitativeResumeEvaluationPanel
          detail={makeDetail({ resumeReviewStatus: "failed" })}
          slug="workspace"
        />
      </QueryClientProvider>,
    );
    expect(html).toContain("重新评价失败，当前展示上一次已完成的结果");
    expect(html).toContain("历史评价（2）");
    expect(html).toContain("JD v2");
    expect(html).toContain("评估服务不可用");
    expect(html).toContain(evaluation.conciseOverall);
    client.clear();
  });
});

vi.hoisted(() => {
  vi.stubEnv("VITE_BASE_URL", "https://web.example.test");
  vi.stubEnv("VITE_BETTER_AUTH_URL", "https://api.example.test");
});
afterAll(() => vi.unstubAllEnvs());
