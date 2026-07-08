import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("resume-overview-panel.tsx", import.meta.url), "utf-8");

describe("ResumeOverviewPanel visual density", () => {
  it("matches the airy resume detail pattern without nested bordered cards", () => {
    expect(source).toContain("function SummaryItem");
    expect(source).toContain("<dt");
    expect(source).toContain("<dd");
    expect(source).toContain('className="space-y-8"');
    expect(source).toContain("rounded-2xl border border-muted/60 bg-muted/20 p-6");
    expect(source).toContain("border-t border-border/50 pt-6");
    expect(source).toContain("grid gap-x-8 gap-y-4 md:grid-cols-2");
    expect(source).not.toContain("SoftPanel");
    expect(source).not.toContain("rounded-2xl border border-border bg-background p-5");
  });

  it("keeps AI parsed review out of the overview summary area", () => {
    const overviewBody = source.slice(source.indexOf("export function ResumeOverviewPanel"));

    expect(overviewBody).not.toContain("<ResumeReviewStructuredView");
  });

  it("shows an AI score preview at the top of the overview", () => {
    const overviewBody = source.slice(source.indexOf("export function ResumeOverviewPanel"));
    const scoreCardSource = source.slice(
      source.indexOf("function ResumeOverviewAiScoreCard"),
      source.indexOf("function ReviewSectionHeader"),
    );

    expect(overviewBody).toContain("<ResumeOverviewAiScoreCard");
    expect(overviewBody).not.toContain("候选人摘要");
    expect(scoreCardSource).toContain("<DimensionRadarChart");
    expect(scoreCardSource).toContain("<DimensionRadarChart compact");
    expect(scoreCardSource).toContain("text-4xl tabular-nums");
    expect(scoreCardSource).toContain("text-sm leading-6");
    expect(scoreCardSource).toContain("text-xs");
    expect(scoreCardSource).toContain("review?.overall.conclusion");
    expect(scoreCardSource).toContain("review?.overall.scoreRationale");
    expect(scoreCardSource).toContain("综合评分");
    expect(scoreCardSource).toContain("查看详情");
    expect(scoreCardSource).toContain("onViewAiScore");
  });

  it("shows resume evaluation as a read-only summary field", () => {
    const overviewBody = source.slice(source.indexOf("export function ResumeOverviewPanel"));

    expect(overviewBody).toContain("describeResumeEvaluationStatus");
    expect(overviewBody).toContain('<SummaryItem label="简历评估"');
    expect(overviewBody).not.toContain("<Select");
    expect(overviewBody).not.toContain("onValueChange");
  });

  it("does not repeat structured resume fields in the overview summary", () => {
    const overviewBody = source.slice(source.indexOf("export function ResumeOverviewPanel"));

    expect(overviewBody).toContain('<SummaryItem label="关联岗位"');
    expect(overviewBody).toContain('<SummaryItem label="简历评估"');
    expect(overviewBody).not.toContain('<SummaryItem label="目标岗位"');
    expect(overviewBody).not.toContain('<SummaryItem label="工作年限"');
    expect(overviewBody).not.toContain("核心技能");
    expect(overviewBody).not.toContain("主要亮点");
  });

  it("uses a spacious AI review layout instead of dense nested cards", () => {
    const reviewSource = source.slice(
      source.indexOf("export function ResumeReviewStructuredView"),
      source.indexOf("function ExpandableMarkdownSummary"),
    );
    const summaryHeroSource = source.slice(
      source.indexOf("function ReviewSummaryHero"),
      source.indexOf("export function ResumeReviewStructuredView"),
    );

    expect(reviewSource).toContain("max-w-6xl space-y-6");
    expect(reviewSource).toContain("<ReviewSummaryHero");
    expect(summaryHeroSource).toContain("text-7xl tabular-nums");
    expect(summaryHeroSource).toContain("推荐建议");
    expect(summaryHeroSource).toContain("lg:grid-cols-[minmax(0,1fr)_12rem]");
    expect(summaryHeroSource).toContain("md:grid-cols-2");
    expect(summaryHeroSource).not.toContain("面试重点");
    expect(summaryHeroSource).not.toContain("interviewFocus");
    expect(source).not.toContain("function actionHighlightClass");
    expect(reviewSource).toContain("<DimensionRadarChart");
    expect(reviewSource).toContain("<DimensionScoreGroup");
    expect(reviewSource).toContain("lg:grid-cols-2");
    expect(reviewSource).toContain("dimensionScores.slice(0, 2)");
    expect(reviewSource).toContain("dimensionScores.slice(2, 4)");
    expect(reviewSource).toContain("dimensionScores.slice(4, 6)");
    expect(reviewSource).toContain("screeningResultSlot");
    expect(source).toContain('import { ScrollArea } from "@/components/ui/scroll-area";');
    expect(source).toContain(
      '<ScrollArea className="h-[28rem] rounded-2xl border border-muted/60 bg-muted/20">',
    );
    expect(source).not.toContain("h-[28rem] overflow-y-auto");
    expect(source).toContain("RadarChart");
    expect(source).toContain("PolarAngleAxis");
    expect(reviewSource).toContain("ReviewSectionHeader");
    expect(source).toContain("divide-y divide-border/50");
    expect(reviewSource).not.toContain("grid gap-5 lg:grid-cols-2");
    expect(reviewSource).not.toContain("space-y-1 rounded-lg bg-muted/20 p-4");
  });

  it("adds muted borders to AI review background surfaces", () => {
    const reviewSource = source.slice(
      source.indexOf("export function ResumeReviewStructuredView"),
      source.indexOf("function ExpandableMarkdownSummary"),
    );

    expect(reviewSource).toContain("border border-muted/60 bg-muted/20");
    expect(reviewSource).not.toContain("rounded-2xl bg-muted/20");
  });
});
