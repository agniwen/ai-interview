/* oxlint-disable no-explicit-any no-nested-ternary complexity max-lines -- tab body has explicit loading/empty/content branches and card compositions. */
"use client";

import { IconArrowBackUp, IconChevronDown, IconLoader2, IconMessage2 } from "@tabler/icons-react";
import { cn } from "@arc/shared/utils";
import { env } from "@/env/client";

import { CandidateBasicInfoView } from "@/components/features/candidate/candidate-basic-info-view";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";
import {
  ResumeOverviewPanel,
  ResumeReviewStructuredView,
} from "@/components/features/studio/resumes/resume-overview-panel";
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/features/display/time-display";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AnimatedHeight } from "@/components/features/motion/animated-height";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { TabsContent } from "@/components/ui/tabs";
import { HumanInterviewStagePanel } from "./human-interview-stage-panel";
import { OfferStagePanel } from "./offer-stage-panel";
import { CandidateTimeline } from "./candidate-timeline";
import {
  DetailBodySkeleton,
  FormsSkeleton,
  InterviewResultOverviewSkeleton,
  ReportsSkeleton,
  SummaryMetric,
} from "./studio-person-detail-skeletons";
import { toAbsoluteUrl } from "@/lib/client/clipboard";
import { pipelineStageMeta, scheduleEntryStatusMeta } from "@arc/db-schema/studio-interviews";
import { AgentInstructionsPanel } from "./interviews/agent-instructions-panel";
import { RoundEmailAction } from "./interviews/round-email/round-email-action";
import { InterviewLinkQrButton } from "./interviews/interview-link-qr-button";
import { ConversationTranscript } from "./interviews/interview-detail/conversation-transcript";
import { KeywordHighlightProvider } from "./interviews/interview-detail/keyword-highlight/context";
import { HighlightedText } from "./interviews/interview-detail/keyword-highlight/highlighted-text";
import { KeywordHighlightLegend } from "./interviews/interview-detail/keyword-highlight/legend";
import { DetailRow } from "./interviews/interview-detail/detail-row";
import { EvaluationResults } from "./interviews/interview-detail/evaluation-results";
import type { EvidenceQuote } from "./interviews/interview-detail/evaluation-results";
import { InterviewMetricsPanel } from "./interviews/interview-detail/interview-metrics-panel";
import {
  formatReportStatus,
  getReportBadgeVariant,
  resolveRecommendationVariant,
  truncateText,
} from "./interviews/interview-detail/helpers";
import { RecordingPlayer } from "./interviews/interview-detail/recording-player";

import {
  shouldShowAiInterviewTab,
  shouldShowHumanInterviewTab,
  shouldShowOfferTab,
} from "./studio-person-detail-model";
import {
  CollectedCandidateInfoList,
  ResumeScreeningResultPanel,
  compactText,
  resolveActiveEvidence,
  resolveDisplayTurnStats,
} from "./studio-person-detail-sections";
import { ReportMetadataButton } from "./studio-person-detail-metadata";
import type { StudioPersonDetailViewModel } from "./studio-person-detail-controller";

function FormSubmissionResetAction({
  onReset,
  resettingId,
  submissions,
}: {
  onReset: (id: string) => void;
  resettingId: string | null;
  submissions: StudioPersonDetailViewModel["formSubmissions"];
}) {
  if (submissions.length === 0) {
    return null;
  }

  const isResetting = resettingId !== null;

  if (submissions.length === 1) {
    const [submission] = submissions;
    return (
      <Button
        className="ml-auto"
        disabled={isResetting}
        onClick={() => onReset(submission.id)}
        size="xs"
        type="button"
        variant="outline"
      >
        <IconArrowBackUp />
        {isResetting ? "重置中..." : "重置填写"}
      </Button>
    );
  }

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <Button
            className="ml-auto"
            disabled={isResetting}
            size="xs"
            type="button"
            variant="outline"
          >
            <IconArrowBackUp />
            {isResetting ? "重置中..." : "重置填写"}
            <IconChevronDown />
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>选择要重置的表单</DropdownMenuLabel>
        {submissions.map((submission) => (
          <DropdownMenuItem key={submission.id} onClick={() => onReset(submission.id)}>
            <span className="truncate">{submission.snapshot.title}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function InterviewResultFrame({
  evaluationSummary,
  report,
}: {
  evaluationSummary: StudioPersonDetailViewModel["latestEvaluationSummary"];
  report: StudioPersonDetailViewModel["latestReport"];
}) {
  return (
    <Frame className="h-full">
      <FrameHeader className="flex-row items-center justify-between gap-3">
        <FrameTitle>面试结果</FrameTitle>
        <div>
          <Badge variant={report ? getReportBadgeVariant(report.status) : "outline"}>
            {report ? formatReportStatus(report.status) : "暂无报告"}
          </Badge>
        </div>
      </FrameHeader>
      <FramePanel className="flex-1">
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-3">
          <SummaryMetric
            label="评分"
            value={
              evaluationSummary.overallScore === null
                ? "—"
                : `${evaluationSummary.overallScore} / 100`
            }
          />
          <SummaryMetric
            label="建议"
            value={
              evaluationSummary.recommendation ? (
                <Badge variant={resolveRecommendationVariant(evaluationSummary.recommendation)}>
                  {evaluationSummary.recommendation}
                </Badge>
              ) : (
                "待生成"
              )
            }
          />
          <SummaryMetric
            label="对话"
            value={report ? `${report.userTurnCount} 次候选人回复` : "候选人完成后生成"}
          />
        </div>
        <MarkdownView
          className="mt-5 border-border/50 border-t pt-5 text-muted-foreground text-sm leading-6"
          content={compactText(
            evaluationSummary.overallAssessment ?? report?.transcriptSummary ?? null,
            "候选人完成面试后，这里会优先显示结论、评分和关键摘要。",
          )}
        />
      </FramePanel>
    </Frame>
  );
}

function InterviewResultTabContent({
  evaluationSummary,
  formItems,
  interviewItems,
  isFormSubmissionsLoading,
  isReportsLoading,
  model,
  record,
  report,
}: {
  evaluationSummary: StudioPersonDetailViewModel["latestEvaluationSummary"];
  formItems: StudioPersonDetailViewModel["formItems"];
  interviewItems: StudioPersonDetailViewModel["interviewItems"];
  isFormSubmissionsLoading: boolean;
  isReportsLoading: boolean;
  model: StudioPersonDetailViewModel;
  record: NonNullable<StudioPersonDetailViewModel["record"]>;
  report: StudioPersonDetailViewModel["latestReport"];
}) {
  const {
    canUseManagementActions,
    dispatchUi,
    formSubmissions,
    handleResetRound,
    handleToggleAllowTextInput,
    isPublic,
    mode,
    resettingSubmissionId,
    resettingRoundId,
    resumePreviewUrl,
    roundEmailSummary,
    slug,
    updatingRoundId,
  } = model;
  const resultAiStageLockedReason =
    record.pipelineStage &&
    record.pipelineStage !== "screening" &&
    record.pipelineStage !== "ai_interview"
      ? `候选人已进入「${pipelineStageMeta[record.pipelineStage].label}」阶段，AI 面试相关操作已锁定。如需修改请先回退阶段或重新激活。`
      : null;
  const resultIsRoundLive =
    record.roundStatus === "in_progress" || record.roundStatus === "interrupted";
  const resultRoundActionDisabledReason = resultIsRoundLive
    ? "面试正在进行中，结束后才能发送或复制链接。"
    : resultAiStageLockedReason;
  const resultIsRoundCompleted = record.roundStatus === "completed";
  const showRoundActions = canUseManagementActions && !isPublic;
  const canResetResultRound =
    showRoundActions && Boolean(record.roundId) && record.pipelineStage === "ai_interview";

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-6 xl:grid-cols-2">
        {isReportsLoading ? (
          <InterviewResultOverviewSkeleton />
        ) : (
          <InterviewResultFrame evaluationSummary={evaluationSummary} report={report} />
        )}
        <Frame className="h-full">
          <FrameHeader className="flex-row flex-wrap items-center justify-between">
            <FrameTitle>候选人信息</FrameTitle>
          </FrameHeader>
          <FramePanel className="flex-1">
            <CandidateBasicInfoView
              candidateEmail={record.candidateEmail}
              candidateName={record.candidateName}
              candidatePhone={record.candidatePhone}
              creatorName={record.creatorName}
              hasResumeFile={record.hasResumeFile}
              jobDescriptionName={record.jobDescriptionName}
              pdfPreviewUrl={resumePreviewUrl}
              resumeFileName={record.resumeFileName}
              targetRole={record.targetRole}
            />
          </FramePanel>
        </Frame>
      </div>

      {record.roundId ? (
        <Frame>
          <FrameHeader>
            <FrameTitle>轮次概览</FrameTitle>
          </FrameHeader>
          <FramePanel className="flex flex-col gap-4">
            {resultAiStageLockedReason ? (
              <p className="rounded-xl bg-muted/30 px-3 py-2 text-muted-foreground text-xs leading-5">
                {resultAiStageLockedReason}
              </p>
            ) : null}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm">{record.roundLabel}</span>
                {record.roundStatus ? (
                  <Badge variant={scheduleEntryStatusMeta[record.roundStatus].tone}>
                    {scheduleEntryStatusMeta[record.roundStatus].label}
                  </Badge>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {record.roundScheduledAt && record.roundScheduledEndAt ? (
                  <div className="flex flex-wrap items-center gap-1 text-muted-foreground text-xs">
                    <span>开始</span>
                    <TimeDisplay
                      className="shrink-0"
                      options={DATE_TIME_DISPLAY_OPTIONS}
                      value={record.roundScheduledAt}
                    />
                    <span>· 结束</span>
                    <TimeDisplay
                      className="shrink-0"
                      options={DATE_TIME_DISPLAY_OPTIONS}
                      value={record.roundScheduledEndAt}
                    />
                  </div>
                ) : (
                  <span className="text-muted-foreground text-xs">未排期</span>
                )}
                {showRoundActions && record.roundId && !resultIsRoundCompleted ? (
                  <RoundEmailAction
                    candidateEmail={record.candidateEmail}
                    lockedReason={resultRoundActionDisabledReason}
                    roundId={record.roundId}
                    slug={slug}
                    summary={roundEmailSummary}
                  />
                ) : null}
                {showRoundActions && record.roundInterviewLink && !resultIsRoundCompleted ? (
                  <InterviewLinkQrButton
                    candidateName={record.candidateName}
                    disabled={Boolean(resultRoundActionDisabledReason)}
                    url={toAbsoluteUrl(record.roundInterviewLink)}
                  />
                ) : null}
              </div>
            </div>
            {showRoundActions ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <Field className="w-auto max-w-full gap-0">
                  <FieldContent>
                    <div className="flex items-center gap-2">
                      <FieldLabel htmlFor={`round-allow-text-input-${record.roundId}`}>
                        允许面试者文本输入
                      </FieldLabel>
                      <Switch
                        checked={record.roundAllowTextInput ?? false}
                        className="shrink-0"
                        disabled={
                          record.roundStatus === "completed" || updatingRoundId === record.roundId
                        }
                        id={`round-allow-text-input-${record.roundId}`}
                        onCheckedChange={(next) =>
                          void handleToggleAllowTextInput(record.roundId as string, next)
                        }
                      />
                    </div>
                    <FieldDescription className="text-xs">
                      关闭时面试界面文字输入框被禁用，仅支持语音作答。
                    </FieldDescription>
                  </FieldContent>
                </Field>
                {canResetResultRound ? (
                  <div className="flex shrink-0 justify-end sm:border-l sm:border-border/50 sm:pl-4">
                    <Button
                      disabled={resettingRoundId === record.roundId}
                      onClick={() => void handleResetRound(record.roundId as string)}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <IconArrowBackUp className="size-3.5" />
                      {resettingRoundId === record.roundId ? "重置中..." : "重置轮次"}
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </FramePanel>
        </Frame>
      ) : null}

      <section className="xl:col-span-2">
        {isFormSubmissionsLoading || isReportsLoading ? (
          <FormsSkeleton />
        ) : (
          <div className="grid gap-6 md:grid-cols-2">
            <Frame className="h-full">
              <FrameHeader className="flex-row items-center gap-2">
                <FrameTitle>表单题</FrameTitle>
                <Badge variant="outline">共{formItems.length}题</Badge>
                {mode === "interview" && !isPublic ? (
                  <FormSubmissionResetAction
                    onReset={(id) =>
                      dispatchUi({
                        id,
                        type: "pendingResetSubmissionChanged",
                      })
                    }
                    resettingId={resettingSubmissionId}
                    submissions={formSubmissions}
                  />
                ) : null}
              </FrameHeader>
              <FramePanel className="flex-1 p-4">
                <CollectedCandidateInfoList emptyLabel="暂无表单答复" items={formItems} />
              </FramePanel>
            </Frame>
            <Frame className="h-full">
              <FrameHeader className="flex-row items-center gap-2  ">
                <FrameTitle>面试题</FrameTitle>
                <Badge variant="outline">共{interviewItems.length}题</Badge>
              </FrameHeader>
              <FramePanel className="flex-1 p-4">
                <CollectedCandidateInfoList emptyLabel="暂无面试题" items={interviewItems} />
              </FramePanel>
            </Frame>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h3 className="font-medium text-sm">简历评价</h3>
        <MarkdownView
          className="text-muted-foreground text-sm leading-6"
          content={truncateText(record.notes) || "暂无简历评价"}
        />
      </section>
    </div>
  );
}

export function StudioPersonDetailBody({ model }: { model: StudioPersonDetailViewModel }) {
  const {
    bodyLayoutClassName,
    canCreateHumanInterview,
    canCreateOffer,
    canDeleteHumanInterview,
    canDeleteOffer,
    canReadHumanInterview,
    canReadOffer,
    canUpdateHumanInterview,
    canUpdateOffer,
    canUseManagementActions,
    canUseTimelineRailScroll,
    canViewReportMetadata,
    candidateRounds,
    candidateTimeline,
    detailScrollClassName,
    dispatchUi,
    effectiveRoundId,
    enabled,
    formItems,
    handleReassessResume,
    interviewItems,
    isFormSubmissionsLoading,
    isLoading,
    isPublic,
    isReassessingResume,
    isResumeAssessmentInProgress,
    isReportsLoading,
    isResumeInterviewResultLoading,
    isTimelineLoading,
    latestEvaluationSummary,
    latestCandidateRoundEvaluationSummary,
    latestCandidateRoundReport,
    latestReport,
    mode,
    onRequestClose,
    record,
    reportTranscriptStats,
    reports,
    resumeRecord,
    resumeInterviewFormItems,
    resumeInterviewItems,
    resumeInterviewResultRecord,
    round,
    selectedEvidence,
    setActiveTab,
    setMetadataReport,
    showTimelineRail,
    showAgentInstructions,
    tabContentRootRef,
    tabVisibilityRecord,
    totalDisplayTurnCount,
  } = model;
  const body = isLoading ? (
    <DetailBodySkeleton mode={mode} />
  ) : // oxlint-disable-next-line no-nested-ternary -- Secondary branch renders based on record presence.
  record ? (
    <div className={bodyLayoutClassName}>
      <div className={detailScrollClassName} ref={tabContentRootRef}>
        <AnimatedHeight clip={!showTimelineRail}>
          <TabsContent value="overview">
            <div className="space-y-8">
              {/* 简历模式：复用 ResumeOverviewPanel —— 与「发起 AI 面试」
              弹窗的概览 tab 同一布局，后续要扩字段也只改一处。
              Resume mode: defer to ResumeOverviewPanel so the
              launch-interview dialog and this view stay in sync. */}
              {mode === "resume" && resumeRecord ? (
                <ResumeOverviewPanel
                  canEdit={Boolean(model.canUpdateResumeLibrary)}
                  detail={resumeRecord}
                  onUpdated={model.onResumeIdentityUpdated}
                  onViewAiScore={() => setActiveTab("ai-analysis")}
                  slug={model.slug}
                />
              ) : (
                <InterviewResultTabContent
                  evaluationSummary={latestEvaluationSummary}
                  formItems={formItems}
                  interviewItems={interviewItems}
                  isFormSubmissionsLoading={isFormSubmissionsLoading}
                  isReportsLoading={isReportsLoading}
                  model={model}
                  record={record}
                  report={latestReport}
                />
              )}
            </div>
          </TabsContent>
          {mode === "resume" ? (
            <TabsContent value="ai-analysis">
              <div className="space-y-6">
                <ResumeReviewStructuredView
                  review={resumeRecord?.resumeReview}
                  screeningResultSlot={<ResumeScreeningResultPanel resumeRecord={resumeRecord} />}
                  summaryAction={
                    canUseManagementActions ? (
                      <Button
                        disabled={isResumeAssessmentInProgress || isReassessingResume}
                        onClick={handleReassessResume}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        {isResumeAssessmentInProgress || isReassessingResume ? (
                          <IconLoader2 className="size-3.5 animate-spin" />
                        ) : (
                          <IconArrowBackUp className="size-3.5" />
                        )}
                        {isResumeAssessmentInProgress || isReassessingResume
                          ? "评估中"
                          : "重新评估"}
                      </Button>
                    ) : undefined
                  }
                />
              </div>
            </TabsContent>
          ) : null}
          {mode === "interview" ? (
            <TabsContent value="reports">
              {isReportsLoading ? (
                <ReportsSkeleton />
              ) : (
                <KeywordHighlightProvider extraSkills={round?.jdRequiredSkills}>
                  <div className="space-y-8">
                    <div className="grid gap-x-8 gap-y-4 md:grid-cols-4">
                      <SummaryMetric label="本轮通话次数" value={reports.length} />
                      <SummaryMetric
                        label="已完成"
                        value={reports.filter((report) => report.status === "done").length}
                      />
                      <SummaryMetric
                        label="失败"
                        value={reports.filter((report) => report.status === "failed").length}
                      />
                      <SummaryMetric label="累计对话轮次" value={totalDisplayTurnCount} />
                    </div>
                    {reports.length > 0 ? <KeywordHighlightLegend /> : null}
                    {reports.length === 0 ? (
                      <Card>
                        <CardPanel className="flex min-h-60 flex-col items-center justify-center text-center">
                          <IconMessage2 className="size-8 text-muted-foreground" />
                          <p className="mt-4 font-medium text-sm">暂无面试报告</p>
                          <p className="mt-2 max-w-xl text-muted-foreground text-sm leading-normal">
                            候选人开始并结束语音面试后，这里会展示逐场面试的总结、状态和完整对话记录。
                          </p>
                        </CardPanel>
                      </Card>
                    ) : (
                      <Accordion
                        className="space-y-4"
                        defaultValue={[reports[0].conversationId]}
                        multiple
                      >
                        {reports.map((report) => {
                          const startedAt = report.startedAt ?? report.createdAt;
                          const endedAt = report.endedAt ?? report.updatedAt;
                          const { displayAgentTurnCount, displayTurnCount, displayUserTurnCount } =
                            resolveDisplayTurnStats(
                              report,
                              reportTranscriptStats.get(report.conversationId),
                            );
                          const activeEvidence = resolveActiveEvidence(
                            selectedEvidence,
                            report.conversationId,
                          );
                          const snapshotMetadata = report.snapshotMetadata ?? null;
                          const handleEvidenceSelect = (evidence: EvidenceQuote) => {
                            dispatchUi({
                              evidence: {
                                conversationId: report.conversationId,
                                timeInCallSecs: evidence.timeInCallSecs ?? null,
                                turnIndex: evidence.turnIndex ?? null,
                              },
                              type: "selectedEvidenceChanged",
                            });
                          };
                          return (
                            <AccordionItem
                              className="overflow-hidden rounded-2xl border border-muted/60 bg-muted/20 px-0"
                              key={report.conversationId}
                              value={report.conversationId}
                            >
                              <AccordionTrigger className="group rounded-none px-5 py-4 hover:no-underline data-panel-open:border-border/60 data-panel-open:border-b data-panel-open:bg-background/70">
                                <div className="min-w-0 flex-1 text-left">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <TimeDisplay
                                      className="font-medium text-sm"
                                      options={DATE_TIME_DISPLAY_OPTIONS}
                                      value={startedAt}
                                    />
                                    <Badge variant={getReportBadgeVariant(report.status)}>
                                      {formatReportStatus(report.status)}
                                    </Badge>
                                    {report.callSuccessful ? (
                                      <Badge variant="outline">{report.callSuccessful}</Badge>
                                    ) : null}
                                  </div>
                                  <MarkdownView
                                    className="mt-2 h-20 line-clamp-4 text-muted-foreground text-sm leading-5 group-data-[panel-open]:hidden [&_p]:m-0"
                                    content={
                                      report.transcriptSummary ??
                                      report.latestError ??
                                      "暂无总结，等待后续同步。"
                                    }
                                  />
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="bg-muted/25 px-5 pt-4 pb-5">
                                <div className="grid gap-4  lg:grid-cols-[minmax(0,1fr)_minmax(400px,1fr)]">
                                  <div className="space-y-4">
                                    <Card>
                                      <CardHeader>
                                        <CardTitle className="text-sm">最终总结</CardTitle>
                                      </CardHeader>
                                      <CardPanel>
                                        <div className="text-muted-foreground text-sm leading-6">
                                          <HighlightedText
                                            text={report.transcriptSummary ?? "暂无总结。"}
                                          />
                                        </div>
                                        {report.latestError ? (
                                          <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
                                            {report.latestError}
                                          </div>
                                        ) : null}
                                      </CardPanel>
                                    </Card>
                                    <Card>
                                      <CardHeader>
                                        <CardTitle className="text-sm">评估指标</CardTitle>
                                      </CardHeader>
                                      <CardPanel>
                                        <ScrollArea className="max-h-[420px] pr-1" scrollFade>
                                          <EvaluationResults
                                            data={
                                              (report.evaluationCriteriaResults as Record<
                                                string,
                                                unknown
                                              >) ?? {}
                                            }
                                            onEvidenceSelect={handleEvidenceSelect}
                                          />
                                        </ScrollArea>
                                      </CardPanel>
                                    </Card>
                                    {env.NEXT_PUBLIC_ENABLE_INTERVIEW_DEVELOPER_DETAILS ? (
                                      <Card>
                                        <CardHeader>
                                          <CardTitle className="text-sm">会话概览</CardTitle>
                                          <CardAction>
                                            <ReportMetadataButton
                                              disabled={!snapshotMetadata}
                                              label=""
                                              onClick={() => setMetadataReport(report)}
                                              visible={canViewReportMetadata}
                                            />
                                          </CardAction>
                                        </CardHeader>
                                        <CardPanel>
                                          <div className="grid gap-x-8 gap-y-4 text-sm md:grid-cols-2">
                                            <DetailRow
                                              label="会话 ID"
                                              value={
                                                <span className="break-all">
                                                  {report.conversationId}
                                                </span>
                                              }
                                            />
                                            <DetailRow
                                              label="开始时间"
                                              value={
                                                <TimeDisplay
                                                  options={DATE_TIME_DISPLAY_OPTIONS}
                                                  value={startedAt}
                                                />
                                              }
                                            />
                                            <DetailRow
                                              label="结束时间"
                                              value={
                                                <TimeDisplay
                                                  options={DATE_TIME_DISPLAY_OPTIONS}
                                                  value={endedAt}
                                                />
                                              }
                                            />
                                            <DetailRow
                                              label="消息统计"
                                              value={`共 ${displayTurnCount} 条 · 候选人 ${displayUserTurnCount} 条 · 面试官 ${displayAgentTurnCount} 条`}
                                            />
                                            <DetailRow
                                              label="同步时间"
                                              value={
                                                <TimeDisplay
                                                  options={DATE_TIME_DISPLAY_OPTIONS}
                                                  value={report.lastSyncedAt}
                                                />
                                              }
                                            />
                                            <DetailRow
                                              label="Webhook"
                                              value={
                                                report.webhookReceivedAt ? (
                                                  <TimeDisplay
                                                    options={DATE_TIME_DISPLAY_OPTIONS}
                                                    value={report.webhookReceivedAt}
                                                  />
                                                ) : (
                                                  "未收到"
                                                )
                                              }
                                            />
                                          </div>
                                        </CardPanel>
                                      </Card>
                                    ) : null}
                                    {env.NEXT_PUBLIC_ENABLE_INTERVIEW_RECORDING ? (
                                      <RecordingPlayer
                                        accessMode={isPublic ? "public" : "authed"}
                                        conversationId={report.conversationId}
                                        durationSecs={report.recordingDurationSecs}
                                        recordId={effectiveRoundId ?? ""}
                                        seekToSecs={activeEvidence?.timeInCallSecs ?? null}
                                        status={report.recordingStatus}
                                      />
                                    ) : null}
                                    {env.NEXT_PUBLIC_ENABLE_INTERVIEW_DEVELOPER_DETAILS ? (
                                      <InterviewMetricsPanel metrics={report.metrics ?? {}} />
                                    ) : null}
                                  </div>
                                  <div className="lg:relative">
                                    <Card className="h-[480px] overflow-hidden lg:absolute lg:inset-0 lg:h-auto">
                                      <CardHeader className="shrink-0">
                                        <CardTitle className="text-sm">对话记录</CardTitle>
                                      </CardHeader>
                                      <CardPanel className="flex min-h-0 flex-col overflow-hidden">
                                        <ConversationTranscript
                                          activeTurnIndex={activeEvidence?.turnIndex ?? null}
                                          turns={report.turns}
                                        />
                                      </CardPanel>
                                    </Card>
                                  </div>
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          );
                        })}
                      </Accordion>
                    )}
                  </div>
                </KeywordHighlightProvider>
              )}
            </TabsContent>
          ) : null}
          {mode === "interview" ? (
            <TabsContent value="experience">
              <ResumeProfileView profile={record.resumeProfile ?? null} />
            </TabsContent>
          ) : null}
          {mode === "resume" && shouldShowAiInterviewTab(tabVisibilityRecord) ? (
            <TabsContent value="rounds">
              <section>
                {/* oxlint-disable-next-line no-nested-ternary -- 三态：loading / empty / result */}
                {isResumeInterviewResultLoading ? (
                  <DetailBodySkeleton mode="interview" />
                ) : /* oxlint-disable-next-line no-nested-ternary -- Secondary branch renders empty-state or result. */
                candidateRounds.length === 0 ? (
                  <p className="text-muted-foreground text-sm leading-normal">
                    该候选人还没有发起面试。在招聘台点「保存并发起面试」即可创建。
                  </p>
                ) : resumeInterviewResultRecord ? (
                  <InterviewResultTabContent
                    evaluationSummary={latestCandidateRoundEvaluationSummary}
                    formItems={resumeInterviewFormItems}
                    interviewItems={resumeInterviewItems}
                    isFormSubmissionsLoading={false}
                    isReportsLoading={false}
                    model={model}
                    record={resumeInterviewResultRecord}
                    report={latestCandidateRoundReport}
                  />
                ) : (
                  <p className="text-muted-foreground text-sm leading-normal">
                    未找到该 AI 面试的详情数据。
                  </p>
                )}
              </section>
            </TabsContent>
          ) : null}
          {mode === "resume" &&
          shouldShowHumanInterviewTab(tabVisibilityRecord, canReadHumanInterview) ? (
            <TabsContent value="human-interview">
              <HumanInterviewStagePanel
                canCreate={canCreateHumanInterview}
                canDelete={canDeleteHumanInterview}
                canUpdate={canUpdateHumanInterview}
                candidateId={record.id}
                candidateName={record.candidateName}
                disabled={record.pipelineStage === "closed"}
              />
            </TabsContent>
          ) : null}
          {mode === "resume" && shouldShowOfferTab(tabVisibilityRecord, canReadOffer) ? (
            <TabsContent value="offer">
              <OfferStagePanel
                canCreate={canCreateOffer}
                canDelete={canDeleteOffer}
                canUpdate={canUpdateOffer}
                candidateEmail={record.candidateEmail}
                candidateId={record.id}
                candidateName={record.candidateName}
                disabled={record.pipelineStage === "closed"}
                onRequestCloseAsHired={() =>
                  onRequestClose?.({
                    candidateName: record.candidateName,
                    id: record.id,
                    initialOutcome: "hired",
                  })
                }
              />
            </TabsContent>
          ) : null}
          {showAgentInstructions ? (
            <TabsContent value="instructions">
              <AgentInstructionsPanel enabled={enabled} recordId={effectiveRoundId} />
            </TabsContent>
          ) : null}
        </AnimatedHeight>
      </div>
      {showTimelineRail ? (
        <aside
          className={cn(
            "min-h-0 min-w-0 max-w-full overflow-hidden",
            canUseTimelineRailScroll ? "xl:h-full" : "",
          )}
        >
          <CandidateTimeline
            className={canUseTimelineRailScroll ? "xl:h-full" : undefined}
            data={candidateTimeline}
            density="rail"
            isLoading={isTimelineLoading}
            scrollMode={canUseTimelineRailScroll ? "internal" : "page"}
          />
        </aside>
      ) : null}
    </div>
  ) : (
    <div className="flex min-h-[240px] items-center justify-center text-muted-foreground text-sm">
      暂无可展示的候选人详情。
    </div>
  );

  return body;
}
