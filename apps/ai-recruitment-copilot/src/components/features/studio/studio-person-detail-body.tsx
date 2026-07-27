/* oxlint-disable no-explicit-any no-nested-ternary complexity max-lines -- tab body has explicit loading/empty/content branches and card compositions. */
"use client";

import { IconArrowBackUp, IconChevronDown, IconCopy, IconLoader2 } from "@tabler/icons-react";
import { countDisplayInterviewTurns } from "@arc/shared/interview-transcript-turns";
import { cn } from "@arc/shared/utils";
import type { ReactNode } from "react";
import { env } from "@/env/client";

import { CandidateBasicInfoView } from "@/components/features/candidate/candidate-basic-info-view";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";
import {
  ResumeOverviewPanel,
  ResumeReviewStructuredView,
} from "@/components/features/studio/resumes/resume-overview-panel";
import {
  DATE_TIME_DISPLAY_OPTIONS,
  TimeDisplay,
  formatTimeDisplayText,
} from "@/components/features/display/time-display";
import { AnimatedHeight } from "@/components/features/motion/animated-height";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardPanel, CardTitle } from "@/components/ui/card";
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { TabsContent } from "@/components/ui/tabs";
import { HumanInterviewStagePanel } from "./human-interview-stage-panel";
import { InterviewReportDetailsDisclosure } from "./interview-report-details-disclosure";
import { OfferStagePanel } from "./offer-stage-panel";
import { CandidateTimeline } from "./candidate-timeline";
import {
  DetailBodySkeleton,
  FormsSkeleton,
  InterviewResultFramesSkeleton,
  InterviewResultOverviewSkeleton,
  SummaryMetric,
} from "./studio-person-detail-skeletons";
import { AgentInstructionsPanel } from "./interviews/agent-instructions-panel";
import { ConversationTranscript } from "./interviews/interview-detail/conversation-transcript";
import { KeywordHighlightProvider } from "./interviews/interview-detail/keyword-highlight/context";
import { HighlightedText } from "./interviews/interview-detail/keyword-highlight/highlighted-text";
import { KeywordHighlightLegend } from "./interviews/interview-detail/keyword-highlight/legend";
import { DetailRow } from "./interviews/interview-detail/detail-row";
import { EvaluationResults } from "./interviews/interview-detail/evaluation-results";
import type { EvidenceQuote } from "./interviews/interview-detail/evaluation-results";
import { InterviewMetricsPanel } from "./interviews/interview-detail/interview-metrics-panel";
import { KeyInterviewInformation } from "./interviews/interview-detail/key-interview-information";
import { copyInterviewLink } from "./interviews/interview-link-actions";
import {
  formatReportStatus,
  getReportBadgeVariant,
  resolveRecommendationVariant,
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
} from "./studio-person-detail-sections";
import { ReportMetadataButton } from "./studio-person-detail-metadata";
import type { StudioPersonDetailViewModel } from "./studio-person-detail-controller";

function createSelectedEvidenceAction(conversationId: string, evidence: EvidenceQuote) {
  return {
    evidence: {
      conversationId,
      timeInCallSecs: evidence.timeInCallSecs ?? null,
      turnIndex: evidence.turnIndex ?? null,
    },
    type: "selectedEvidenceChanged" as const,
  };
}

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

function getInterviewRecordLabel(
  report: StudioPersonDetailViewModel["resultReports"][number],
  index: number,
) {
  const time =
    formatTimeDisplayText(report.startedAt ?? report.createdAt, DATE_TIME_DISPLAY_OPTIONS) ??
    "时间未记录";
  return index === 0 ? `最近一次 · ${time}` : `第 ${index + 1} 条记录 · ${time}`;
}

function InterviewRecordSelector({
  onSelectedReportChange,
  reports,
  value,
}: {
  onSelectedReportChange: (conversationId: string) => void;
  reports: StudioPersonDetailViewModel["resultReports"];
  value: string | null;
}) {
  if (!(reports.length > 1) || !value) {
    return null;
  }
  const completedCount = reports.filter((report) => report.status === "done").length;
  const failedCount = reports.filter((report) => report.status === "failed").length;
  const totalTurnCount = reports.reduce(
    (total, report) => total + countDisplayInterviewTurns(report.turns).turnCount,
    0,
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap gap-2">
        <Badge variant="outline">共 {reports.length} 次</Badge>
        <Badge variant="outline">已完成 {completedCount}</Badge>
        <Badge variant="outline">失败 {failedCount}</Badge>
        <Badge variant="outline">累计对话 {totalTurnCount} 条</Badge>
      </div>
      <Select
        onValueChange={(conversationId) => {
          if (conversationId) {
            onSelectedReportChange(conversationId);
          }
        }}
        value={value}
      >
        <SelectTrigger aria-label="选择面试记录" className="w-full sm:w-72">
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectGroup>
            <SelectLabel>面试记录</SelectLabel>
            {reports.map((report, index) => {
              const label = getInterviewRecordLabel(report, index);
              return (
                <SelectItem key={report.conversationId} label={label} value={report.conversationId}>
                  {label}
                </SelectItem>
              );
            })}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  );
}

function InterviewResultFrame({
  evaluationSummary,
  record,
  report,
}: {
  evaluationSummary: StudioPersonDetailViewModel["selectedResultEvaluationSummary"];
  record: NonNullable<StudioPersonDetailViewModel["record"]>;
  report: StudioPersonDetailViewModel["selectedResultReport"];
}) {
  const showCopyInterviewLink = record.roundStatus === "pending";

  return (
    <Frame className="h-full">
      <FrameHeader className="flex-row items-center justify-between gap-3">
        <FrameTitle>面试结果</FrameTitle>
        <Badge variant={report ? getReportBadgeVariant(report.status) : "outline"}>
          {report ? formatReportStatus(report.status) : "暂无报告"}
        </Badge>
      </FrameHeader>
      <FramePanel className="flex-1">
        <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <SummaryMetric
            label="开始时间"
            value={
              <TimeDisplay emptyText="未记录" value={report?.startedAt ?? report?.createdAt} />
            }
          />
          <SummaryMetric
            label="结束时间"
            value={<TimeDisplay emptyText="未记录" value={report?.endedAt ?? report?.updatedAt} />}
          />
        </div>
        <div className="mt-5 grid gap-x-8 gap-y-4 border-border/50 border-t pt-5 sm:grid-cols-3">
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
        {showCopyInterviewLink ? (
          <div className="mt-5 border-border/50 border-t pt-5">
            <Button
              className="w-full"
              disabled={!record.roundInterviewLink}
              onClick={() => {
                if (record.roundInterviewLink) {
                  void copyInterviewLink({ interviewLink: record.roundInterviewLink });
                }
              }}
              type="button"
              variant="outline"
            >
              <IconCopy className="size-4" />
              复制面试链接
            </Button>
          </div>
        ) : null}
      </FramePanel>
    </Frame>
  );
}

function InterviewReportDetailSection({
  children,
  className,
  panelClassName,
  surface,
  title,
}: {
  children: ReactNode;
  className?: string;
  panelClassName?: string;
  surface: "card" | "frame";
  title: string;
}) {
  if (surface === "card") {
    return (
      <Card className={className}>
        <CardHeader className={className ? "shrink-0" : undefined}>
          <CardTitle className="text-sm">{title}</CardTitle>
        </CardHeader>
        <CardPanel className={panelClassName}>{children}</CardPanel>
      </Card>
    );
  }

  return (
    <Frame className={className}>
      <FrameHeader className={className ? "shrink-0" : undefined}>
        <FrameTitle>{title}</FrameTitle>
      </FrameHeader>
      <FramePanel className={panelClassName}>{children}</FramePanel>
    </Frame>
  );
}

function InterviewReportDetails({
  activeTurnIndex,
  leftSupplement,
  onEvidenceSelect,
  report,
  surface,
}: {
  activeTurnIndex: number | null;
  leftSupplement?: ReactNode;
  onEvidenceSelect: (evidence: EvidenceQuote) => void;
  report: NonNullable<StudioPersonDetailViewModel["selectedResultReport"]>;
  surface: "card" | "frame";
}) {
  return (
    <div className="flex flex-col gap-4">
      {report.turns.length > 0 ? <KeywordHighlightLegend /> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(400px,1fr)]">
        <div className="space-y-4">
          <InterviewReportDetailSection surface={surface} title="最终总结">
            <div className="text-muted-foreground text-sm leading-6">
              <HighlightedText text={report.transcriptSummary ?? "暂无总结。"} />
            </div>
            {report.latestError ? (
              <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
                {report.latestError}
              </div>
            ) : null}
          </InterviewReportDetailSection>
          {report.keyInformation ? (
            <KeyInterviewInformation
              data={report.keyInformation}
              onEvidenceSelect={onEvidenceSelect}
              surface={surface}
            />
          ) : null}
          <InterviewReportDetailSection surface={surface} title="评估指标">
            <ScrollArea className="max-h-[420px] pr-1" scrollFade>
              <EvaluationResults
                data={(report.evaluationCriteriaResults as Record<string, unknown> | null) ?? {}}
                dataCollectionResults={report.dataCollectionResults}
                onEvidenceSelect={onEvidenceSelect}
              />
            </ScrollArea>
          </InterviewReportDetailSection>
          {leftSupplement}
        </div>
        <div className="lg:relative">
          <InterviewReportDetailSection
            className="h-[480px] overflow-hidden lg:absolute lg:inset-0 lg:h-auto"
            panelClassName={cn(
              "flex min-h-0 flex-1 flex-col overflow-hidden",
              surface === "frame" ? "p-0" : undefined,
            )}
            surface={surface}
            title="对话记录"
          >
            <ConversationTranscript activeTurnIndex={activeTurnIndex} turns={report.turns} />
          </InterviewReportDetailSection>
        </div>
      </div>
    </div>
  );
}

function InterviewReportSupplement({
  activeEvidence,
  model,
  report,
}: {
  activeEvidence: ReturnType<typeof resolveActiveEvidence>;
  model: StudioPersonDetailViewModel;
  report: NonNullable<StudioPersonDetailViewModel["selectedResultReport"]>;
}) {
  const { canViewReportMetadata, isPublic, resultRoundId, setMetadataReport } = model;
  const transcriptStats = countDisplayInterviewTurns(report.turns);

  return (
    <>
      {env.NEXT_PUBLIC_ENABLE_INTERVIEW_DEVELOPER_DETAILS ? (
        <Frame>
          <FrameHeader className="flex-row items-center justify-between gap-3">
            <FrameTitle>会话概览</FrameTitle>
            <ReportMetadataButton
              disabled={!report.snapshotMetadata}
              label=""
              onClick={() => setMetadataReport(report)}
              visible={canViewReportMetadata}
            />
          </FrameHeader>
          <FramePanel>
            <div className="grid gap-x-8 gap-y-4 text-sm md:grid-cols-2">
              <DetailRow
                label="会话 ID"
                value={<span className="break-all">{report.conversationId}</span>}
              />
              <DetailRow label="同步时间" value={<TimeDisplay value={report.lastSyncedAt} />} />
              <DetailRow
                label="消息统计"
                value={`共 ${transcriptStats.turnCount} 条 · 候选人 ${transcriptStats.userTurnCount} 条 · 面试官 ${transcriptStats.agentTurnCount} 条`}
              />
              <DetailRow
                label="Webhook"
                value={
                  report.webhookReceivedAt ? (
                    <TimeDisplay value={report.webhookReceivedAt} />
                  ) : (
                    "未收到"
                  )
                }
              />
            </div>
          </FramePanel>
        </Frame>
      ) : null}
      {env.NEXT_PUBLIC_ENABLE_INTERVIEW_RECORDING ? (
        <RecordingPlayer
          accessMode={isPublic ? "public" : "authed"}
          conversationId={report.conversationId}
          durationSecs={report.recordingDurationSecs}
          key={report.conversationId}
          recordId={resultRoundId ?? ""}
          seekToSecs={activeEvidence?.timeInCallSecs ?? null}
          status={report.recordingStatus}
        />
      ) : null}
      {env.NEXT_PUBLIC_ENABLE_INTERVIEW_DEVELOPER_DETAILS ? (
        <InterviewMetricsPanel metrics={report.metrics ?? {}} />
      ) : null}
    </>
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
  evaluationSummary: StudioPersonDetailViewModel["selectedResultEvaluationSummary"];
  formItems: StudioPersonDetailViewModel["selectedResultFormItems"];
  interviewItems: StudioPersonDetailViewModel["selectedResultInterviewItems"];
  isFormSubmissionsLoading: boolean;
  isReportsLoading: boolean;
  model: StudioPersonDetailViewModel;
  record: NonNullable<StudioPersonDetailViewModel["record"]>;
  report: StudioPersonDetailViewModel["selectedResultReport"];
}) {
  const {
    canUseManagementActions,
    dispatchUi,
    formSubmissions,
    handleResetRound,
    handleToggleAllowTextInput,
    isLatestResultReportSelected,
    isPublic,
    isSelectedReportLoading,
    mode,
    onSelectedReportChange,
    resultReports,
    round,
    resettingRoundId,
    resettingSubmissionId,
    resumePreviewUrl,
    selectedEvidence,
    effectiveSelectedResultConversationId,
    updatingRoundId,
  } = model;
  const showRoundActions = canUseManagementActions && !isPublic;
  const frozenInput = report?.snapshotMetadata?.fullTextInput;
  const frozenCandidate = frozenInput?.candidate;
  const canResetResultRound =
    showRoundActions &&
    isLatestResultReportSelected &&
    Boolean(record.roundId) &&
    record.pipelineStage === "ai_interview";
  const activeEvidence = report
    ? resolveActiveEvidence(selectedEvidence, report.conversationId)
    : null;
  const handleEvidenceSelect = (evidence: EvidenceQuote) => {
    if (!report) {
      return;
    }
    dispatchUi(createSelectedEvidenceAction(report.conversationId, evidence));
  };

  return (
    <div className="flex flex-col gap-6">
      <InterviewRecordSelector
        onSelectedReportChange={onSelectedReportChange}
        reports={resultReports}
        value={effectiveSelectedResultConversationId}
      />
      {isSelectedReportLoading ? (
        <InterviewResultFramesSkeleton />
      ) : (
        <>
          <div className="grid gap-6 md:grid-cols-2">
            {isReportsLoading ? (
              <InterviewResultOverviewSkeleton />
            ) : (
              <InterviewResultFrame
                evaluationSummary={evaluationSummary}
                record={record}
                report={report}
              />
            )}
            <Frame className="h-full">
              <FrameHeader className="flex-row flex-wrap items-center justify-between">
                <FrameTitle>候选人信息</FrameTitle>
              </FrameHeader>
              <FramePanel className="flex-1">
                <CandidateBasicInfoView
                  candidateEmail={
                    frozenCandidate ? frozenCandidate.candidateEmail : record.candidateEmail
                  }
                  candidateName={
                    frozenCandidate ? (frozenCandidate.candidateName ?? "—") : record.candidateName
                  }
                  candidatePhone={
                    frozenCandidate ? frozenCandidate.candidatePhone : record.candidatePhone
                  }
                  creatorName={record.creatorName}
                  hasResumeFile={record.hasResumeFile}
                  jobDescriptionName={
                    frozenInput
                      ? (frozenInput.jobDescription?.name ?? null)
                      : record.jobDescriptionName
                  }
                  pdfPreviewUrl={resumePreviewUrl}
                  resumeFileName={record.resumeFileName}
                  targetRole={frozenCandidate ? frozenCandidate.targetRole : record.targetRole}
                />
                {showRoundActions && isLatestResultReportSelected && record.roundId ? (
                  <Field className="mt-4 w-auto max-w-full gap-0 border-border/50 border-t pt-4">
                    <FieldContent>
                      <div className="flex items-center justify-between gap-3">
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
                ) : null}
              </FramePanel>
            </Frame>
            {isFormSubmissionsLoading || isReportsLoading ? (
              <div className="md:col-span-2">
                <FormsSkeleton />
              </div>
            ) : (
              <>
                <Frame className="h-full">
                  <FrameHeader className="flex-row items-center gap-2">
                    <FrameTitle>表单题</FrameTitle>
                    <Badge variant="outline">共{formItems.length}题</Badge>
                    {mode === "interview" && !isPublic && isLatestResultReportSelected ? (
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
                  <FramePanel className="flex-1 p-0">
                    <ScrollArea className="max-h-[28rem]" scrollFade>
                      <div className="p-4">
                        <CollectedCandidateInfoList emptyLabel="暂无表单答复" items={formItems} />
                      </div>
                    </ScrollArea>
                  </FramePanel>
                </Frame>
                <Frame className="h-full">
                  <FrameHeader className="flex-row items-center gap-2">
                    <FrameTitle>沟通题</FrameTitle>
                    <Badge variant="outline">共{interviewItems.length}题</Badge>
                    {canResetResultRound ? (
                      <Button
                        className="ml-auto"
                        disabled={resettingRoundId === record.roundId}
                        onClick={() => void handleResetRound(record.roundId as string)}
                        size="xs"
                        type="button"
                        variant="outline"
                      >
                        <IconArrowBackUp />
                        {resettingRoundId === record.roundId ? "重置中..." : "重置沟通"}
                      </Button>
                    ) : null}
                  </FrameHeader>
                  <FramePanel className="flex-1 p-0">
                    <ScrollArea className="max-h-[28rem]" scrollFade>
                      <div className="p-4">
                        <CollectedCandidateInfoList
                          emptyLabel="暂无沟通题"
                          items={interviewItems}
                        />
                      </div>
                    </ScrollArea>
                  </FramePanel>
                </Frame>
              </>
            )}
          </div>
          {report ? (
            <InterviewReportDetailsDisclosure>
              <KeywordHighlightProvider extraSkills={round?.jdRequiredSkills}>
                <InterviewReportDetails
                  activeTurnIndex={activeEvidence?.turnIndex ?? null}
                  leftSupplement={
                    <InterviewReportSupplement
                      activeEvidence={activeEvidence}
                      model={model}
                      report={report}
                    />
                  }
                  onEvidenceSelect={handleEvidenceSelect}
                  report={report}
                  surface="frame"
                />
              </KeywordHighlightProvider>
            </InterviewReportDetailsDisclosure>
          ) : null}
        </>
      )}
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
    candidateRounds,
    candidateTimeline,
    detailScrollClassName,
    effectiveRoundId,
    enabled,
    handleReassessResume,
    isFormSubmissionsLoading,
    isLoading,
    isReassessingResume,
    isResumeAssessmentInProgress,
    isReportsLoading,
    isResumeInterviewResultLoading,
    isTimelineLoading,
    mode,
    onRequestClose,
    record,
    resumeRecord,
    resumeInterviewResultRecord,
    selectedResultEvaluationSummary,
    selectedResultFormItems,
    selectedResultInterviewItems,
    selectedResultReport,
    setActiveTab,
    showTimelineRail,
    showAgentInstructions,
    tabContentRootRef,
    tabVisibilityRecord,
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
                  evaluationSummary={selectedResultEvaluationSummary}
                  formItems={selectedResultFormItems}
                  interviewItems={selectedResultInterviewItems}
                  isFormSubmissionsLoading={isFormSubmissionsLoading}
                  isReportsLoading={isReportsLoading}
                  model={model}
                  record={record}
                  report={selectedResultReport}
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
                    evaluationSummary={selectedResultEvaluationSummary}
                    formItems={selectedResultFormItems}
                    interviewItems={selectedResultInterviewItems}
                    isFormSubmissionsLoading={false}
                    isReportsLoading={false}
                    model={model}
                    record={resumeInterviewResultRecord}
                    report={selectedResultReport}
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
