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
      "// 招聘台模式查询 / Resume-mode record query",
      "// 面试报告与表单仅面试模式查询 / Reports and form submissions only in interview mode",
    );
    const timelineQuerySource = sourceBetween(
      "const { data: candidateTimeline, isLoading: isTimelineLoading } = useQuery({",
      "// 中文：当前轮次的邮件发送摘要",
    );
    const interviewRoundQuerySource = sourceBetween(
      "// 面试模式查询（`:id` = roundId）/ Interview-mode query (`:id` = roundId)",
      "// 招聘台模式查询 / Resume-mode record query",
    );

    expect(resumeDetailQuerySource).not.toContain("staleTime");
    expect(timelineQuerySource).not.toContain("staleTime");
    expect(interviewRoundQuerySource).not.toContain("staleTime");
  });

  it("uses breathable tab spacing for resume and AI interview details", () => {
    expect(source).toContain('"flex flex-col gap-8"');
    expect(source).toContain('"min-w-0 flex flex-col gap-8"');
    expect(source).not.toContain("viewportRef={tabContentRootRef}");
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
    expect(collectedSource).toContain("items={formItems}");
    expect(collectedSource).toContain("items={interviewItems}");
    expect(resultSource).not.toContain("<ConversationTranscript");
    expect(source).toContain("function getCollectedCandidateInfoItems");
    expect(source).toContain("latestReport?.evaluationCriteriaResults");
    expectSourceOrder(overviewSource, "面试结果", "候选人收集信息");
    expectSourceOrder(overviewSource, "轮次概览", "候选人收集信息");
    expect(overviewSource).not.toContain("按表单、面试题顺序展示");
    // 旧扁平变量整体消失,精确证明顶部总数 badge 及其数据源已删(比查 "条信息" 更不易误报)
    expect(source).not.toContain("collectedCandidateInfoItems");
    expect(collectedSource).toContain("md:grid-cols-2");
    expect(collectedSource).toContain("表单题");
    expect(collectedSource).toContain("面试题");
    expect(collectedSource).toContain("共{formItems.length}题");
    expect(collectedSource).toContain("共{interviewItems.length}题");
    expect(collectedSource).toContain('emptyLabel="暂无表单答复"');
    expect(collectedSource).toContain('emptyLabel="暂无面试题"');
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
    expect(collectedItemsSource).toContain("sequence: formItems.length + 1");
    expect(collectedItemsSource).toContain("sequence: interviewItems.length + 1");
    expectSourceOrder(collectedItemsSource, "for (const submission", "const questions =");
    expect(answerListSource).toContain("AI 分析");
    expect(answerListSource).toContain("问题");
    expect(answerListSource).toContain('item.kind === "interview" ? "候选人回答" : "回答"');
    expectSourceOrder(answerListSource, "问题", "AI 分析");
    expect(answerListSource).toContain("emptyLabel");
    expect(collectedItemsSource).not.toContain("sourceLabel");
    expect(answerListSource).not.toContain("sourceLabel");
    expect(answerListSource).toContain("{item.sequence}.");
    expect(answerListSource).toContain("border-border/60 border-b py-4 last:border-b-0");
    expect(answerListSource).not.toContain("rounded-xl border border-border/60 bg-background/70");
    expect(answerListSource).not.toContain("lg:grid-cols-2");
    expect(answerListSource).toContain('item.kind === "interview"');
    expect(answerListSource).toContain("font-medium text-foreground leading-6");
    expect(answerListSource).toContain("text-muted-foreground leading-6 break-words");
    expect(answerListSource).toContain("line-clamp-2");
    expect(answerListSource).toContain("<Tooltip key");
    expect(answerListSource).toContain("<TooltipTrigger");
    expect(answerListSource).toContain("render={");
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

  it("gates human interview and offer tabs plus stage actions by CRUD permissions", () => {
    const availableTabsStart = source.indexOf("const availableTabs = useMemo");
    const availableTabsSource = source.slice(
      availableTabsStart,
      source.indexOf("useEffect(() => {", availableTabsStart),
    );
    const actionBarSource = sourceBetween("const actionBar =", "let headerExtra");

    expect(source).toContain('useHasPermission("humanInterview", "read")');
    expect(source).toContain('useHasPermission("humanInterview", "create")');
    expect(source).toContain('useHasPermission("humanInterview", "update")');
    expect(source).toContain('useHasPermission("humanInterview", "delete")');
    expect(source).toContain('useHasPermission("offer", "read")');
    expect(source).toContain('useHasPermission("offer", "create")');
    expect(source).toContain('useHasPermission("offer", "update")');
    expect(source).toContain('useHasPermission("offer", "delete")');
    expect(availableTabsSource).toContain(
      "shouldShowHumanInterviewTab(tabVisibilityRecord, canReadHumanInterview)",
    );
    expect(availableTabsSource).toContain("shouldShowOfferTab(tabVisibilityRecord, canReadOffer)");
    expect(
      source.match(/shouldShowHumanInterviewTab\(tabVisibilityRecord, canReadHumanInterview\)/g),
    ).toHaveLength(3);
    expect(source.match(/shouldShowOfferTab\(tabVisibilityRecord, canReadOffer\)/g)).toHaveLength(
      3,
    );
    expect(actionBarSource).toContain("canCreateHumanInterview={canCreateHumanInterview}");
    expect(actionBarSource).toContain("canCreateOffer={canCreateOffer}");
    expect(source).toContain("canUpdate={canUpdateHumanInterview}");
    expect(source).toContain("canDelete={canDeleteHumanInterview}");
    expect(source).toContain("canUpdate={canUpdateOffer}");
    expect(source).toContain("canDelete={canDeleteOffer}");
  });

  it("renders resume AI scoring in its own tab instead of the overview", () => {
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
    const screeningPanelSource = sourceBetween(
      "function ResumeScreeningResultPanel",
      "function resolveDisplayTurnStats",
    );

    expect(source).toContain('value="ai-analysis"');
    expect(source).toContain("AI评分");
    expect(source).toContain("简历筛选 · 分析中");
    expect(source).toContain("resumeRecord?.resumeReviewStatus");
    expect(source).toContain("岗位规则检查");
    expect(source).toContain('import { ScrollArea } from "@/components/ui/scroll-area";');
    expect(source).toContain(
      '<ScrollArea className="h-[28rem] rounded-2xl border border-muted/60 bg-muted/20">',
    );
    expect(overviewSource).toContain('onViewAiScore={() => setActiveTab("ai-analysis")}');
    expect(source).toContain("function getResumeScreeningRuleStatusOrder");
    expect(source).toContain("const sortedRuleResults =");
    expect(screeningPanelSource).toContain("{sortedRuleResults.map((rule) => (");
    expect(screeningPanelSource).not.toContain("{result.ruleResults.map((rule) => (");
    expect(source).not.toContain("h-[28rem] overflow-y-auto");
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
    expect(launchSource).toContain("<TooltipTrigger render={launchResumeModeButtonContent} />");
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

  it("shows AI round reset throughout the AI interview stage instead of only after completion", () => {
    const resetConditionSource = sourceBetween("const canResetAiRound =", "const isRoundLive =");
    const resetButtonStart = source.indexOf("{canResetAiRound ? (");
    const resetButtonSource = source.slice(
      resetButtonStart,
      source.indexOf("</Button>", resetButtonStart),
    );

    expect(resetConditionSource).toContain('record?.pipelineStage === "ai_interview"');
    expect(resetConditionSource).not.toContain('record?.roundStatus === "completed"');
    expect(resetButtonSource).toContain("handleResetRound");
    expect(resetButtonSource).not.toContain('record.roundStatus === "completed"');
  });

  it("invalidates agent prompt and question binding caches after resetting form submissions", () => {
    const resetSubmissionSource = sourceBetween(
      "async function resetInterviewFormSubmission",
      "async function updateAllowTextInput",
    );

    expect(resetSubmissionSource).toContain("deleteStudioInterviewFormSubmission");
    expect(resetSubmissionSource).toContain("studio-interview-round-form-submissions");
    expect(resetSubmissionSource).toContain("studio-interview-agent-instructions");
    expect(resetSubmissionSource).toContain("interview-question-bindings");
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
    expect(reportsSource).toContain('<ScrollArea className="mt-4 max-h-[420px] pr-1">');
    expect(reportsSource).not.toContain("max-h-[420px] overflow-y-auto");
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
