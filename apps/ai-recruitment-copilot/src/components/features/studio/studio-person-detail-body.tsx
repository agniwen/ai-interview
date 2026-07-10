/* oxlint-disable no-explicit-any no-nested-ternary complexity -- tab body has explicit loading/empty/content branches. */
"use client";

import { IconArrowBackUp, IconEye, IconLoader2, IconMessage2 } from "@tabler/icons-react";
import Markdown from "react-markdown";
import { cn } from "@arc/shared/utils";
import { env } from "@/env/client";

import { CandidateBasicInfoView } from "@/components/features/candidate/candidate-basic-info-view";
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
  RoundsSkeleton,
  SummaryMetric,
} from "./studio-person-detail-skeletons";
import { toAbsoluteUrl } from "@/lib/client/clipboard";
import { scheduleEntryStatusMeta } from "@arc/db-schema/studio-interviews";
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
import { FormsTab } from "./interviews/interview-detail/forms-tab";
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
  ResumeAiAnalysisPlaceholder,
  ResumeScreeningResultPanel,
  compactText,
  resolveActiveEvidence,
  resolveDisplayTurnStats,
} from "./studio-person-detail-sections";
import { ReportMetadataButton } from "./studio-person-detail-metadata";
import type { StudioPersonDetailViewModel } from "./studio-person-detail-controller";
import { StudioPersonDetailQuestionsTab } from "./studio-person-detail-questions";

export function StudioPersonDetailBody({ model }: { model: StudioPersonDetailViewModel }) {
  const {
    aiStageLockedReason,
    bodyLayoutClassName,
    canCreateHumanInterview,
    canCreateOffer,
    canDeleteHumanInterview,
    canDeleteOffer,
    canReadHumanInterview,
    canReadOffer,
    canResetAiRound,
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
    formSubmissions,
    handleReassessResume,
    handleResetRound,
    handleToggleAllowTextInput,
    interviewItems,
    isAiStageLocked,
    isFormSubmissionsLoading,
    isLoading,
    isPublic,
    isReassessingResume,
    isReportsLoading,
    isRoundCompleted,
    isRoundsLoading,
    isTimelineLoading,
    latestEvaluationSummary,
    latestReport,
    mode,
    onRequestClose,
    onViewRoundDetail,
    record,
    reportTranscriptStats,
    reports,
    resettingRoundId,
    resettingSubmissionId,
    resumePreviewUrl,
    resumeRecord,
    round,
    roundActionDisabledReason,
    roundActionLockedReason,
    roundEmailSummary,
    selectedEvidence,
    setActiveTab,
    setMetadataReport,
    showTimelineRail,
    slug,
    tabContentRootRef,
    tabVisibilityRecord,
    totalDisplayTurnCount,
    updatingRoundId,
    visibleInterviewQuestions,
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
                  detail={resumeRecord}
                  onViewAiScore={() => setActiveTab("ai-analysis")}
                />
              ) : (
                <div className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                  {isReportsLoading ? (
                    <InterviewResultOverviewSkeleton />
                  ) : (
                    <section className="h-full rounded-2xl bg-muted/20 border-muted/60 border p-5">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="font-medium text-sm">面试结果</h3>
                        <Badge
                          variant={
                            latestReport ? getReportBadgeVariant(latestReport.status) : "outline"
                          }
                        >
                          {latestReport ? formatReportStatus(latestReport.status) : "暂无报告"}
                        </Badge>
                      </div>
                      <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-3">
                        <SummaryMetric
                          label="评分"
                          value={
                            latestEvaluationSummary.overallScore === null
                              ? "—"
                              : `${latestEvaluationSummary.overallScore} / 100`
                          }
                        />
                        <SummaryMetric
                          label="建议"
                          value={
                            latestEvaluationSummary.recommendation ? (
                              <Badge
                                variant={resolveRecommendationVariant(
                                  latestEvaluationSummary.recommendation,
                                )}
                              >
                                {latestEvaluationSummary.recommendation}
                              </Badge>
                            ) : (
                              "待生成"
                            )
                          }
                        />
                        <SummaryMetric
                          label="对话"
                          value={
                            latestReport
                              ? `${latestReport.userTurnCount} 次候选人回复`
                              : "候选人完成后生成"
                          }
                        />
                      </div>
                      <div className="mt-5 border-border/50 border-t pt-5 text-muted-foreground text-sm leading-6">
                        <Markdown>
                          {compactText(
                            latestEvaluationSummary.overallAssessment ??
                              latestReport?.transcriptSummary ??
                              null,
                            "候选人完成面试后，这里会优先显示结论、评分和关键摘要。",
                          )}
                        </Markdown>
                      </div>
                    </section>
                  )}
                  <section className="h-full space-y-4  rounded-2xl bg-muted/20 border-muted/60 border p-5">
                    <h3 className="font-medium text-sm">候选人信息</h3>
                    <div>
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
                    </div>
                  </section>
                </div>
              )}
              {/* 轮次概览（面试模式专属）/ Round overview (interview mode only) */}
              {mode === "interview" && record.roundId ? (
                <section className="space-y-4 border-t border-border/50 pt-6">
                  <h3 className="font-medium text-sm">轮次概览</h3>
                  {isAiStageLocked ? (
                    <p className="rounded-xl bg-muted/30 px-3 py-2 text-muted-foreground text-xs leading-5">
                      {aiStageLockedReason}
                    </p>
                  ) : null}
                  <div className="space-y-4">
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
                        {record.roundScheduledAt ? (
                          <TimeDisplay
                            className="shrink-0 text-muted-foreground text-xs"
                            options={DATE_TIME_DISPLAY_OPTIONS}
                            value={record.roundScheduledAt}
                          />
                        ) : (
                          <span className="text-muted-foreground text-xs">未排期</span>
                        )}
                        {record.roundId && !isPublic && !isRoundCompleted ? (
                          <RoundEmailAction
                            candidateEmail={record.candidateEmail}
                            lockedReason={roundActionDisabledReason}
                            roundId={record.roundId}
                            slug={slug}
                            summary={roundEmailSummary}
                          />
                        ) : null}
                        {record.roundInterviewLink && !isPublic && !isRoundCompleted ? (
                          <InterviewLinkQrButton
                            candidateName={record.candidateName}
                            disabled={Boolean(roundActionDisabledReason)}
                            url={toAbsoluteUrl(record.roundInterviewLink as string)}
                          />
                        ) : null}
                      </div>
                    </div>
                    {isPublic ? null : (
                      <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/30 px-4 py-3 border border-muted/60">
                        <div className="min-w-0">
                          {/* 允许面试者文本输入 / Allow candidate text input */}
                          <p className="font-medium text-sm">允许面试者文本输入</p>
                          <p className="mt-0.5 text-muted-foreground text-xs">
                            关闭时面试界面文字输入框被禁用，仅支持语音作答。
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={record.roundAllowTextInput ?? false}
                            disabled={
                              record.roundStatus === "completed" ||
                              updatingRoundId === record.roundId
                            }
                            onCheckedChange={(next) =>
                              void handleToggleAllowTextInput(record.roundId as string, next)
                            }
                          />
                          {canResetAiRound ? (
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
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              ) : null}
              {mode === "interview" ? (
                <section className="xl:col-span-2 border-border/50 border-t pt-6">
                  <div className="mb-4">
                    <h3 className="font-medium text-sm">候选人收集信息</h3>
                  </div>
                  {isFormSubmissionsLoading || isReportsLoading ? (
                    <FormsSkeleton />
                  ) : (
                    <div className="grid gap-x-6 gap-y-8 md:grid-cols-2">
                      <div>
                        <div className="mb-3 flex items-center gap-2">
                          <h4 className="font-medium text-sm">表单题</h4>
                          <Badge variant="outline">共{formItems.length}题</Badge>
                        </div>
                        <CollectedCandidateInfoList emptyLabel="暂无表单答复" items={formItems} />
                      </div>
                      <div>
                        <div className="mb-3 flex items-center gap-2">
                          <h4 className="font-medium text-sm">面试题</h4>
                          <Badge variant="outline">共{interviewItems.length}题</Badge>
                        </div>
                        <CollectedCandidateInfoList
                          emptyLabel="暂无面试题"
                          items={interviewItems}
                        />
                      </div>
                    </div>
                  )}
                </section>
              ) : null}
              {mode === "interview" ? (
                <section className="space-y-3 border-t border-border/50 pt-6">
                  <h3 className="font-medium text-sm">简历评价</h3>
                  <div className="text-muted-foreground text-sm leading-6">
                    <Markdown>{truncateText(record.notes) || "暂无简历评价"}</Markdown>
                  </div>
                </section>
              ) : null}
            </div>
          </TabsContent>
          {mode === "resume" ? (
            <TabsContent value="ai-analysis">
              <div className="space-y-6">
                {resumeRecord?.resumeReview ? (
                  <ResumeReviewStructuredView
                    review={resumeRecord.resumeReview}
                    screeningResultSlot={<ResumeScreeningResultPanel resumeRecord={resumeRecord} />}
                    summaryAction={
                      canUseManagementActions ? (
                        <Button
                          disabled={isReassessingResume}
                          onClick={handleReassessResume}
                          size="sm"
                          type="button"
                          variant="outline"
                        >
                          {isReassessingResume ? (
                            <IconLoader2 className="size-3.5 animate-spin" />
                          ) : (
                            <IconArrowBackUp className="size-3.5" />
                          )}
                          重新评估
                        </Button>
                      ) : undefined
                    }
                  />
                ) : (
                  <>
                    <ResumeAiAnalysisPlaceholder resumeRecord={resumeRecord} />
                    <ResumeScreeningResultPanel resumeRecord={resumeRecord} />
                  </>
                )}
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
                      <div className="flex min-h-60 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/30 px-6 py-10 text-center">
                        <IconMessage2 className="size-8 text-muted-foreground" />
                        <p className="mt-4 font-medium text-sm">暂无面试报告</p>
                        <p className="mt-2 max-w-xl text-muted-foreground text-sm leading-normal">
                          候选人开始并结束语音面试后，这里会展示逐场面试的总结、状态和完整对话记录。
                        </p>
                      </div>
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
                              className="overflow-hidden rounded-2xl border border-muted/60 bg-muted/20 px-0 shadow-sm"
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
                                  <div className="mt-2 h-20 line-clamp-4 text-muted-foreground text-sm leading-5 group-data-[panel-open]:hidden [&_p]:m-0">
                                    <Markdown>
                                      {report.transcriptSummary ??
                                        report.latestError ??
                                        "暂无总结，等待后续同步。"}
                                    </Markdown>
                                  </div>
                                </div>
                              </AccordionTrigger>
                              <AccordionContent className="bg-muted/25 px-5 pt-4 pb-5">
                                <div className="grid gap-4  lg:grid-cols-[minmax(0,1fr)_minmax(400px,1fr)]">
                                  <div className="space-y-4">
                                    <section className="rounded-xl border border-border/60 bg-background p-4 shadow-sm">
                                      <h4 className="font-medium text-sm">最终总结</h4>
                                      <div className="mt-3 text-muted-foreground text-sm leading-6">
                                        <HighlightedText
                                          text={report.transcriptSummary ?? "暂无总结。"}
                                        />
                                      </div>
                                      {report.latestError ? (
                                        <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
                                          {report.latestError}
                                        </div>
                                      ) : null}
                                    </section>
                                    <section className="rounded-xl border border-border/60 bg-background p-4 shadow-sm">
                                      <h4 className="font-medium text-sm">评估指标</h4>
                                      <ScrollArea className="mt-4 max-h-[420px] pr-1">
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
                                    </section>
                                    <section className="rounded-xl border border-border/60 bg-background p-4 shadow-sm">
                                      <div className="flex flex-wrap items-center justify-between gap-3">
                                        <h4 className="font-medium text-sm">会话概览</h4>
                                        <ReportMetadataButton
                                          disabled={!snapshotMetadata}
                                          label=""
                                          onClick={() => setMetadataReport(report)}
                                          visible={canViewReportMetadata}
                                        />
                                      </div>
                                      <div className="mt-3 grid gap-x-8 gap-y-4 text-sm md:grid-cols-2">
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
                                    </section>
                                    {env.NEXT_PUBLIC_ENABLE_INTERVIEW_RECORDING ? (
                                      <RecordingPlayer
                                        accessMode={isPublic ? "public" : "authed"}
                                        conversationId={report.conversationId}
                                        durationSecs={report.recordingDurationSecs}
                                        recordId={effectiveRoundId ?? ""}
                                        seekToSecs={activeEvidence?.timeInCallSecs ?? null}
                                        status={report.recordingStatus}
                                        surface="section"
                                      />
                                    ) : null}
                                    <InterviewMetricsPanel
                                      metrics={report.metrics ?? {}}
                                      surface="section"
                                    />
                                  </div>
                                  <div className="lg:relative">
                                    <section className="flex h-[480px] flex-col overflow-hidden rounded-xl border border-border/60 bg-background p-4 shadow-sm lg:absolute lg:inset-0 lg:h-auto">
                                      <h4 className="shrink-0 pb-2 font-medium text-sm">
                                        对话记录
                                      </h4>
                                      <ConversationTranscript
                                        activeTurnIndex={activeEvidence?.turnIndex ?? null}
                                        turns={report.turns}
                                      />
                                    </section>
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
          <StudioPersonDetailQuestionsTab mode={mode} questions={visibleInterviewQuestions} />
          {mode === "interview" ? (
            <TabsContent value="experience">
              <ResumeProfileView profile={record.resumeProfile ?? null} />
            </TabsContent>
          ) : null}
          {mode === "resume" && shouldShowAiInterviewTab(tabVisibilityRecord) ? (
            <TabsContent value="rounds">
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium text-sm">AI 面试轮次</h3>
                  <span className="text-muted-foreground text-xs">
                    共 {candidateRounds.length} 轮
                  </span>
                </div>
                {isAiStageLocked ? (
                  <p className="rounded-xl bg-muted/30 px-3 py-2 text-muted-foreground text-xs leading-5">
                    {aiStageLockedReason}
                  </p>
                ) : null}
                {/* oxlint-disable-next-line no-nested-ternary -- 三态：loading / empty / list */}
                {isRoundsLoading ? (
                  <RoundsSkeleton />
                ) : /* oxlint-disable-next-line no-nested-ternary -- Secondary branch renders empty-state or list. */
                candidateRounds.length === 0 ? (
                  <p className="text-muted-foreground text-sm leading-normal">
                    该候选人还没有发起面试。在招聘台点「保存并发起面试」即可创建。
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {candidateRounds.map((entry) => {
                      const statusMeta = scheduleEntryStatusMeta[entry.status];
                      const fullLink = toAbsoluteUrl(entry.interviewLink);
                      const isEntryLive =
                        entry.status === "in_progress" || entry.status === "interrupted";
                      const entryActionDisabledReason = isEntryLive
                        ? roundActionLockedReason
                        : aiStageLockedReason;
                      return (
                        <article
                          className="rounded-xl bg-muted/30 px-4 py-3 border-muted/60 border"
                          key={entry.id}
                        >
                          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="wrap-break-word font-medium text-sm">
                                {entry.roundLabel}
                              </span>
                              <Badge variant={statusMeta.tone}>{statusMeta.label}</Badge>
                              {entry.hasReport ? <Badge variant="outline">已有报告</Badge> : null}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-muted-foreground text-xs">
                              {entry.scheduledAt ? (
                                <TimeDisplay
                                  options={DATE_TIME_DISPLAY_OPTIONS}
                                  value={entry.scheduledAt}
                                />
                              ) : (
                                "未排期"
                              )}
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
                              {/* 中文：仅在调用方提供回调时显示「查看详情」；不提供时避免渲染无用按钮。
                              English: Only render 查看详情 when the caller supplies a callback; skip it otherwise. */}
                              {onViewRoundDetail ? (
                                <Button
                                  className="flex-1 sm:flex-none"
                                  onClick={() => onViewRoundDetail(entry.id)}
                                  size="sm"
                                  type="button"
                                  variant="ghost"
                                >
                                  <IconEye className="size-3.5" />
                                  查看详情
                                </Button>
                              ) : null}
                              <InterviewLinkQrButton
                                candidateName={record.candidateName}
                                className="flex-1 sm:flex-none"
                                disabled={Boolean(entryActionDisabledReason)}
                                url={fullLink}
                              />
                            </div>
                          </div>
                        </article>
                      );
                    })}
                  </div>
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
          {mode === "interview" && !isPublic ? (
            <TabsContent value="instructions">
              <AgentInstructionsPanel enabled={enabled} recordId={effectiveRoundId} />
            </TabsContent>
          ) : null}
          {mode === "interview" ? (
            <TabsContent value="forms">
              {isFormSubmissionsLoading ? (
                <FormsSkeleton />
              ) : (
                <FormsTab
                  onReset={
                    isPublic
                      ? undefined
                      : (submissionId) =>
                          dispatchUi({
                            id: submissionId,
                            type: "pendingResetSubmissionChanged",
                          })
                  }
                  resettingId={resettingSubmissionId}
                  submissions={formSubmissions}
                />
              )}
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
