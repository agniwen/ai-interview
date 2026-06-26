import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("studio-person-detail-panel.tsx", import.meta.url), "utf-8");

function sourceBetween(start: string, end: string) {
  return source.slice(source.indexOf(start), source.indexOf(end));
}

function expectSourceOrder(text: string, first: string, second: string) {
  expect(text.indexOf(first)).toBeGreaterThanOrEqual(0);
  expect(text.indexOf(second)).toBeGreaterThanOrEqual(0);
  expect(text.indexOf(first)).toBeLessThan(text.indexOf(second));
}

describe("StudioPersonDetailPanel visual density", () => {
  it("uses breathable tab spacing for resume and AI interview details", () => {
    expect(source).toContain('"flex flex-col gap-8"');
    expect(source).toContain('"min-w-0 flex flex-col gap-8"');
  });

  it("keeps the AI interview overview free of nested bordered cards", () => {
    const overviewSource = sourceBetween(
      '<TabsContent value="overview">',
      '<h3 className="font-medium text-sm">简历评价</h3>',
    );

    expect(overviewSource).toContain("rounded-2xl bg-muted/20 border-muted/60 border p-5");
    expect(overviewSource).toContain("border-border/50 border-t pt-5");
    expect(overviewSource).not.toContain("rounded-2xl border border-border bg-background p-5");
  });

  it("shows collected candidate information as a full-width overview section", () => {
    const overviewSource = sourceBetween(
      '<TabsContent value="overview">',
      '<h3 className="font-medium text-sm">简历评价</h3>',
    );
    const resultSource = sourceBetween(
      '<h3 className="font-medium text-sm">面试结果</h3>',
      "</section>",
    );
    const collectedSource = sourceBetween(
      '<h3 className="font-medium text-sm">候选人收集信息</h3>',
      '<h3 className="font-medium text-sm">简历评价</h3>',
    );

    expect(overviewSource).toContain('<h3 className="font-medium text-sm">候选人收集信息</h3>');
    expect(overviewSource).toContain('<h3 className="font-medium text-sm">轮次概览</h3>');
    expect(overviewSource).toContain("xl:col-span-2");
    expect(resultSource).not.toContain("<FormsTab");
    expect(resultSource).not.toContain("<InterviewAnswerList");
    expect(collectedSource).toContain("<CollectedCandidateInfoList");
    expect(collectedSource).toContain("items={collectedCandidateInfoItems}");
    expect(resultSource).not.toContain("<ConversationTranscript");
    expect(source).toContain("function getCollectedCandidateInfoItems");
    expect(source).toContain("latestReport?.evaluationCriteriaResults");
    expectSourceOrder(overviewSource, "面试结果", "候选人收集信息");
    expectSourceOrder(overviewSource, "轮次概览", "候选人收集信息");
  });

  it("shows AI analysis and clamps extracted candidate answers with a tooltip", () => {
    const answerListSource = sourceBetween(
      "function CollectedCandidateInfoList",
      "function compactText",
    );
    const collectedItemsSource = sourceBetween(
      "function getCollectedCandidateInfoItems",
      "function CollectedCandidateInfoList",
    );

    expect(source).toContain("rawQuestion.assessment");
    expect(collectedItemsSource).toContain("sequence: items.length + 1");
    expectSourceOrder(collectedItemsSource, "for (const submission", "const questions =");
    expect(answerListSource).toContain("AI 分析");
    expect(answerListSource).toContain("问题");
    expect(answerListSource).toContain('item.kind === "interview" ? "候选人回答" : "回答"');
    expectSourceOrder(answerListSource, "问题", "AI 分析");
    expect(answerListSource).toContain("sourceLabel");
    expect(answerListSource).toContain("{item.sequence}.");
    expect(answerListSource).toContain("border-border/60 border-b py-4 last:border-b-0");
    expect(answerListSource).not.toContain("rounded-xl border border-border/60 bg-background/70");
    expect(answerListSource).not.toContain("lg:grid-cols-2");
    expect(answerListSource).toContain('item.kind === "interview"');
    expect(answerListSource).toContain("font-medium text-foreground leading-6");
    expect(answerListSource).toContain("text-muted-foreground leading-6 break-words");
    expect(answerListSource).toContain("line-clamp-2");
    expect(answerListSource).toContain("<Tooltip key");
    expect(answerListSource).toContain("<TooltipTrigger asChild>");
    expect(answerListSource).toContain("<TooltipContent");
  });

  it("keeps tab panels lightweight across reports, questions, experience, and rounds", () => {
    const reportsSource = sourceBetween(
      '<TabsContent value="reports">',
      '<TabsContent value="questions">',
    );
    const questionsSource = sourceBetween(
      '<TabsContent value="questions">',
      '<TabsContent value="experience">',
    );
    const experienceSource = sourceBetween(
      '<TabsContent value="experience">',
      '<TabsContent value="rounds">',
    );
    const roundsSource = sourceBetween(
      '<TabsContent value="rounds">',
      '<TabsContent value="human-interview">',
    );

    expect(reportsSource).toContain('<SummaryMetric label="本轮通话次数"');
    expect(reportsSource).toContain("rounded-2xl border border-border/70 bg-muted/25 px-0");
    expect(questionsSource).toContain('className="space-y-4"');
    expect(questionsSource).toContain("rounded-xl bg-muted/30 px-4 py-3 border-muted/60 border");
    expect(experienceSource).not.toContain("rounded-2xl border border-border bg-background p-5");
    expect(roundsSource).toContain('className="space-y-4"');
    expect(roundsSource).toContain("rounded-xl bg-muted/30 px-4 py-3 border-muted/60 border");
    expect(roundsSource).not.toContain("<SoftPanel");
  });

  it("renders resume AI parsing in its own tab instead of the overview", () => {
    const overviewSource = sourceBetween('<TabsContent value="overview">', "{/* 轮次概览");
    const aiAnalysisSource = sourceBetween(
      '<TabsContent value="ai-analysis">',
      '<TabsContent value="reports">',
    );

    expect(source).toContain('value="ai-analysis"');
    expect(source).toContain("AI 解析");
    expect(overviewSource).not.toContain("<ResumeReviewStructuredView");
    expect(aiAnalysisSource).toContain("<ResumeReviewStructuredView");
  });

  it("disables launching AI interview from resume details when no job description is bound", () => {
    const footerSource = sourceBetween("const resumeModeFooter =", "const title =");

    expect(source).toContain("请先绑定在招岗位后再发起 AI 面试");
    expect(source).toContain('from "@/components/ui/tooltip"');
    expect(footerSource).toContain("launchResumeModeDisabledReason");
    expect(source).toContain("disabled={Boolean(launchResumeModeDisabledReason)}");
    expect(footerSource).toContain("<TooltipTrigger asChild>");
    expect(footerSource).toContain(
      "<TooltipContent>{launchResumeModeDisabledReason}</TooltipContent>",
    );
  });

  it("uses a consistent framed surface for expanded interview report items", () => {
    const reportsSource = sourceBetween(
      '<TabsContent value="reports">',
      '<TabsContent value="questions">',
    );

    expect(reportsSource).toContain("rounded-2xl border border-border/70 bg-muted/25 px-0");
    expect(reportsSource).toContain("bg-muted/25 px-5 pt-4 pb-5");
    expect(reportsSource).toContain(
      "rounded-xl border border-border/60 bg-background p-4 shadow-sm",
    );
  });

  it("exposes internal report snapshot metadata from each report item", () => {
    const reportsSource = sourceBetween(
      '<TabsContent value="reports">',
      '<TabsContent value="questions">',
    );

    expect(source).toContain("function InterviewReportMetadataDialog");
    expect(source).toContain("function InterviewReportMetadataFullTextInputSection");
    expect(reportsSource).toContain("canViewReportMetadata");
    expect(reportsSource).toContain("snapshotMetadata");
    expect(source).toContain("metadata.fullTextInput");
    expect(source).toContain("完整输入");
    expect(source).toContain("JD 原文");
    expect(reportsSource).toContain("元信息");
    expect(source).toContain("<InterviewReportMetadataDialog");
  });
});
