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
  it("keeps modal detail queries stale immediately so every open fetches fresh data", () => {
    const resumeDetailQuerySource = sourceBetween(
      "// 简历库模式查询 / Resume-mode record query",
      "// 面试报告与表单仅面试模式查询 / Reports and form submissions only in interview mode",
    );
    const timelineQuerySource = sourceBetween(
      "const { data: candidateTimeline, isLoading: isTimelineLoading } = useQuery({",
      "// 中文：当前轮次的邮件发送摘要",
    );
    const interviewRoundQuerySource = sourceBetween(
      "// 面试模式查询（`:id` = roundId）/ Interview-mode query (`:id` = roundId)",
      "// 简历库模式查询 / Resume-mode record query",
    );

    expect(resumeDetailQuerySource).not.toContain("staleTime");
    expect(timelineQuerySource).not.toContain("staleTime");
    expect(interviewRoundQuerySource).not.toContain("staleTime");
  });

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

  it("hides AI interview tab and panel before the pipeline reaches AI interview", () => {
    const helperSource = sourceBetween(
      "function shouldShowAiInterviewTab",
      "function shouldShowHumanInterviewTab",
    );
    const availableTabsStart = source.indexOf("const availableTabs = useMemo");
    const availableTabsSource = source.slice(
      availableTabsStart,
      source.indexOf("useEffect(() => {", availableTabsStart),
    );
    const tabsListSource = sourceBetween(
      '<TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="ai-analysis">',
      "{/* 真人复面 / Offer tab",
    );
    const roundsContentSource = sourceBetween(
      '{mode === "resume" && shouldShowAiInterviewTab(tabVisibilityRecord) ? (',
      '<TabsContent value="human-interview">',
    );

    expect(helperSource).toContain("pipelineStage");
    expect(helperSource).toContain('"ai_interview"');
    expect(helperSource).toContain('"human_interview"');
    expect(helperSource).toContain('"offer"');
    expect(helperSource).toContain('"closed"');
    expect(helperSource).not.toContain("resumeParseStatus");
    expect(availableTabsSource).toContain("shouldShowAiInterviewTab(tabVisibilityRecord)");
    expect(tabsListSource).toContain("shouldShowAiInterviewTab(tabVisibilityRecord)");
    expect(roundsContentSource).toContain("shouldShowAiInterviewTab(tabVisibilityRecord)");
    expect(source).toContain("showAiInterviewStep={shouldShowAiInterviewTab(tabVisibilityRecord)}");
  });

  it("gates human interview and offer tabs plus stage actions by dedicated permissions", () => {
    const availableTabsStart = source.indexOf("const availableTabs = useMemo");
    const availableTabsSource = source.slice(
      availableTabsStart,
      source.indexOf("useEffect(() => {", availableTabsStart),
    );
    const actionBarSource = sourceBetween("const actionBar =", "let headerExtra");

    expect(source).toContain('useHasPermission("humanInterview", "manage")');
    expect(source).toContain('useHasPermission("offer", "manage")');
    expect(availableTabsSource).toContain(
      "shouldShowHumanInterviewTab(tabVisibilityRecord, canManageHumanInterview)",
    );
    expect(availableTabsSource).toContain(
      "shouldShowOfferTab(tabVisibilityRecord, canManageOffer)",
    );
    expect(
      source.match(/shouldShowHumanInterviewTab\(tabVisibilityRecord, canManageHumanInterview\)/g),
    ).toHaveLength(3);
    expect(source.match(/shouldShowOfferTab\(tabVisibilityRecord, canManageOffer\)/g)).toHaveLength(
      3,
    );
    expect(actionBarSource).toContain("canManageHumanInterview={canManageHumanInterview}");
    expect(actionBarSource).toContain("canManageOffer={canManageOffer}");
  });

  it("renders resume AI parsing in its own tab instead of the overview", () => {
    const overviewSource = sourceBetween('<TabsContent value="overview">', "{/* 轮次概览");
    const aiAnalysisSource = sourceBetween(
      '<TabsContent value="ai-analysis">',
      '<TabsContent value="reports">',
    );
    const modalSizeStart = source.indexOf("let modalSize:");
    const modalSizeSource = source.slice(
      modalSizeStart,
      source.indexOf("return (", modalSizeStart),
    );

    expect(source).toContain('value="ai-analysis"');
    expect(source).toContain("AI 解析");
    expect(overviewSource).not.toContain("<ResumeReviewStructuredView");
    expect(aiAnalysisSource).toContain("<ResumeReviewStructuredView");
    expect(modalSizeSource).not.toContain("activeTab");
    expect(modalSizeSource).toContain('"3xl"');
  });

  it("moves resume launch actions into the pipeline action bar without a footer", () => {
    const launchSource = sourceBetween(
      "const launchResumeModeButtonContent = showLaunchButton ?",
      "const title =",
    );
    const actionBarSource = sourceBetween("const actionBar =", "let headerExtra");

    expect(source).toContain("请先绑定在招岗位后再发起 AI 面试");
    expect(source).toContain('from "@/components/ui/tooltip"');
    expect(launchSource).toContain("launchResumeModeDisabledReason");
    expect(source).toContain("aria-disabled={Boolean(launchResumeModeDisabledReason)}");
    expect(launchSource).toContain("<TooltipTrigger asChild>");
    expect(launchSource).not.toContain("<span>{launchResumeModeButtonContent}</span>");
    expect(launchSource).toContain(
      "<TooltipContent>{launchResumeModeDisabledReason}</TooltipContent>",
    );
    expect(actionBarSource).toContain("primaryAction={launchResumeModeButton}");
    expect(actionBarSource).toContain(
      "hasJobDescription={Boolean(resumeRecord?.jobDescriptionId)}",
    );
    expect(source).toContain("const footer = null;");
    expect(source).not.toContain("const resumeModeFooter =");
    expect(source).not.toContain("<IconPencil");
    expect(source).not.toContain(">编辑</Button>");
  });

  it("hides resume-mode AI launch actions after the candidate enters human interview", () => {
    const launchConditionSource = sourceBetween(
      "const showLaunchButton =",
      "const launchResumeModeDisabledReason =",
    );

    expect(launchConditionSource).toContain('record?.pipelineStage === "screening"');
    expect(launchConditionSource).not.toContain('record.pipelineStage === "human_interview"');
    expect(launchConditionSource).not.toContain('record.pipelineStage === "offer"');
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
    expect(reportsSource).toContain("<ReportMetadataButton");
    expect(source).toContain("面试元信息");
    expect(source).toContain("<InterviewReportMetadataDialog");
  });
});
