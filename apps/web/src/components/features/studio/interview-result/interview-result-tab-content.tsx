/* oxlint-disable complexity -- result tab composes overview frames, forms, and report disclosure branches. */
"use client";

import { IconArrowBackUp, IconForms, IconMessageQuestion, IconSettings } from "@tabler/icons-react";
import { useState } from "react";

import { cn } from "@app/shared/utils";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsPanel, TabsTab } from "@/components/ui/tabs";

import { useHasPermission } from "@/hooks/use-has-permission";

import {
  FormsSkeleton,
  InterviewResultFramesSkeleton,
  InterviewResultOverviewSkeleton,
} from "../studio-person-detail-skeletons";
import { KeywordHighlightProvider } from "../interviews/interview-detail/keyword-highlight/context";
import { RecordingPlaybackProvider } from "../interviews/interview-detail/recording-playback";
import type { EvidenceQuote } from "../interviews/interview-detail/evaluation-results";
import {
  CollectedCandidateInfoList,
  resolveActiveEvidence,
} from "../studio-person-detail-sections";
import type { StudioPersonDetailViewModel } from "../studio-person-detail-controller";
import { createSelectedEvidenceAction } from "./interview-result-evidence";
import { FormSubmissionResetAction, InterviewRecordSelector } from "./interview-record-selector";
import { InterviewResultOverview } from "./interview-result-frame";
import { useFillScrollParentHeight } from "./use-fill-scroll-parent-height";
import { useIsWideContainer } from "./use-is-wide-container";
import { resolveCandidateAvatarSource } from "../candidate-avatar-image";
import { ResultSection, ResultSectionStack } from "./result-section";
import {
  InterviewReportOverallSection,
  InterviewReportRecording,
  InterviewReportSummarySections,
  InterviewReportTranscriptSection,
} from "./interview-report-details";

type InterviewResultView = "overview" | "questions" | "transcript" | "forms";

// 没有面试报告时这些页签不渲染。Views that need a report; hidden without one.
const REPORT_ONLY_VIEWS: ReadonlySet<InterviewResultView> = new Set(["questions", "transcript"]);
const INTERVIEW_RESULT_VIEWS: ReadonlySet<unknown> = new Set<InterviewResultView>([
  "overview",
  "questions",
  "transcript",
  "forms",
]);

// 容器达到这个宽度时改为左右分栏：左侧固定宽度的结果列，右侧常驻录像与对话。
// At this container width the tab splits into a fixed-width result column and a
// persistent recording + transcript pane.
const SPLIT_LAYOUT_MIN_WIDTH = 960;

function isInterviewResultView(value: unknown): value is InterviewResultView {
  return INTERVIEW_RESULT_VIEWS.has(value);
}

export function InterviewResultTabContent({
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
    selectedEvidence,
    effectiveSelectedResultConversationId,
    updatingRoundId,
  } = model;
  const [resultView, setResultView] = useState<InterviewResultView>("overview");
  const [containerRef, isSplitLayout] = useIsWideContainer(SPLIT_LAYOUT_MIN_WIDTH);
  const showRoundActions = canUseManagementActions && !isPublic;
  const canReadInterviewers = useHasPermission("interviewer", "read");
  const interviewerAgents =
    canReadInterviewers && !isPublic && model.slug && record.jobDescriptionId
      ? { jobDescriptionId: record.jobDescriptionId, slug: model.slug }
      : undefined;
  const selectedRoundId = record.roundId;
  const handleResetSelectedRound = selectedRoundId ? () => handleResetRound(selectedRoundId) : null;
  const handleToggleSelectedRoundTextInput = selectedRoundId
    ? (allowTextInput: boolean) => handleToggleAllowTextInput(selectedRoundId, allowTextInput)
    : null;
  const canResetResultRound =
    showRoundActions &&
    isLatestResultReportSelected &&
    handleResetSelectedRound &&
    record.pipelineStage === "ai_interview";
  const activeEvidence = report
    ? resolveActiveEvidence(selectedEvidence, report.conversationId)
    : null;

  const handleEvidenceSelect = (evidence: EvidenceQuote) => {
    if (!report) {
      return;
    }
    // 单列布局里对话在独立页签，先切过去再定位原话；分栏时对话常驻右侧。
    // In the single-column layout the transcript is its own tab, so switch to it first;
    // the split layout keeps it on the right.
    if (!isSplitLayout) {
      setResultView("transcript");
    }
    dispatchUi(createSelectedEvidenceAction(report.conversationId, evidence));
  };
  const isViewAvailable =
    (report || !REPORT_ONLY_VIEWS.has(resultView)) &&
    !(isSplitLayout && resultView === "transcript");
  const effectiveResultView = isViewAvailable ? resultView : "overview";
  // 单列（侧栏）下的对话与录像页签：录像固定，只有对话记录滚动，侧栏本身不再滚。
  // Single-column transcript tab: the recording stays put and only the transcript scrolls.
  const [transcriptFillRef, transcriptFillHeight] = useFillScrollParentHeight(
    !isSplitLayout && effectiveResultView === "transcript",
  );
  // record 可能是轮次记录，头像按简历记录 → 轮次详情的顺序取。
  // The record may be a round, so resolve the headshot from the resume record, then the round.
  const candidateAvatar = resolveCandidateAvatarSource({
    resumeRecord: mode === "resume" ? model.resumeRecord : null,
    round,
  });

  // 分栏时左右两栏各自滚动：左侧页签头固定、内容滚动；右侧录像固定、只有对话滚动，页面本身不再跟着滚。
  // In the split layout each column scrolls on its own: the left tab list stays put while its
  // content scrolls, and on the right only the transcript scrolls under a fixed recording.
  // relative 让面板成为绝对定位子元素（如 sr-only 标签）的包含块，否则它们会逃出面板的滚动裁剪、把整页撑长。
  // relative makes the panel the containing block for absolutely positioned children (e.g. sr-only
  // labels); otherwise they escape its scroll clipping and stretch the whole page.
  const splitPanelClassName = isSplitLayout ? "relative min-h-0 overflow-y-auto pr-3" : undefined;
  const fillsDrawer = transcriptFillHeight !== null;
  const transcriptPane = report ? (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-6",
        (isSplitLayout || fillsDrawer) && "h-full min-h-0",
      )}
      ref={transcriptFillRef}
      style={fillsDrawer ? { height: transcriptFillHeight } : undefined}
    >
      <div className="shrink-0">
        <InterviewReportRecording activeEvidence={activeEvidence} model={model} report={report} />
      </div>
      <InterviewReportTranscriptSection
        activeTurnIndex={activeEvidence?.turnIndex ?? null}
        candidateAvatar={candidateAvatar}
        candidateName={record.candidateName}
        className={isSplitLayout || fillsDrawer ? "min-h-0 flex-1" : undefined}
        report={report}
        scroll={isSplitLayout || fillsDrawer ? "contained" : "flow"}
      />
    </div>
  ) : null;

  const recordSelector = (
    <InterviewRecordSelector
      onSelectedReportChange={onSelectedReportChange}
      reports={resultReports}
      value={effectiveSelectedResultConversationId}
    />
  );

  return (
    <div className="flex flex-col gap-6 pt-3" ref={containerRef}>
      {isSelectedReportLoading ? (
        <>
          {recordSelector}
          <InterviewResultFramesSkeleton />
        </>
      ) : (
        // 播放联动按会话重建，切换面试记录时不残留上一场的播放位置。
        // Playback state is keyed per conversation so switching reports drops the old position.
        <RecordingPlaybackProvider key={report?.conversationId ?? "no-report"}>
          <KeywordHighlightProvider extraSkills={round?.jdRequiredSkills}>
            <div
              className={cn(
                isSplitLayout &&
                  "grid h-[min(calc(100dvh-8rem),56rem)] min-h-[32rem] grid-cols-[minmax(0,600px)_minmax(0,1fr)] gap-8",
              )}
            >
              <Tabs
                className={cn("min-w-0 gap-4", isSplitLayout && "h-full min-h-0")}
                onValueChange={(value) => {
                  if (isInterviewResultView(value)) {
                    setResultView(value);
                  }
                }}
                value={effectiveResultView}
              >
                {/* 子页签与面试记录选择固定在顶部，滚动时始终可切换。 */}
                {/* Sub-tabs and the record selector stay pinned while the content scrolls. */}
                <div className="sticky top-0 z-10 -mt-3 flex flex-wrap items-center justify-between gap-3 bg-background py-3">
                  <TabsList aria-label="面试结果内容">
                    <TabsTab value="overview">概览</TabsTab>
                    {report ? <TabsTab value="questions">逐题评估</TabsTab> : null}
                    {report && !isSplitLayout ? (
                      <TabsTab value="transcript">对话与录像</TabsTab>
                    ) : null}
                    <TabsTab value="forms">表单填写</TabsTab>
                  </TabsList>
                  {recordSelector}
                </div>

                <TabsPanel className={splitPanelClassName} value="overview">
                  <ResultSectionStack>
                    {isReportsLoading ? (
                      <InterviewResultOverviewSkeleton />
                    ) : (
                      <InterviewResultOverview
                        interviewerAgents={interviewerAgents}
                        invitation={
                          model.canUpdateInterview &&
                          showRoundActions &&
                          isLatestResultReportSelected &&
                          record.roundId &&
                          record.pipelineStage === "ai_interview"
                            ? { roundId: record.roundId, slug: model.slug }
                            : undefined
                        }
                        canEditQuestions={
                          model.mode === "resume" &&
                          Boolean(model.canUpdateResumeLibrary) &&
                          !model.isPublic
                        }
                        evaluationSummary={evaluationSummary}
                        onSaveQuestions={model.handleUpdateInterviewQuestions}
                        record={record}
                        report={report}
                      />
                    )}
                    {report ? (
                      <InterviewReportSummarySections
                        onEvidenceSelect={handleEvidenceSelect}
                        report={report}
                      />
                    ) : null}
                    {showRoundActions &&
                    isLatestResultReportSelected &&
                    handleToggleSelectedRoundTextInput ? (
                      <ResultSection icon={IconSettings} title="面试设置">
                        <Field className="w-auto max-w-full gap-0">
                          <FieldContent>
                            <div className="flex items-center justify-between gap-3">
                              <FieldLabel htmlFor={`round-allow-text-input-${record.roundId}`}>
                                允许面试者文本输入
                              </FieldLabel>
                              <Switch
                                checked={record.roundAllowTextInput ?? false}
                                className="shrink-0"
                                disabled={
                                  record.roundStatus === "completed" ||
                                  updatingRoundId === record.roundId
                                }
                                id={`round-allow-text-input-${record.roundId}`}
                                onCheckedChange={handleToggleSelectedRoundTextInput}
                              />
                            </div>
                            <FieldDescription className="text-xs">
                              关闭时面试界面文字输入框被禁用，仅支持语音作答。
                            </FieldDescription>
                          </FieldContent>
                        </Field>
                      </ResultSection>
                    ) : null}
                  </ResultSectionStack>
                </TabsPanel>

                {report ? (
                  <TabsPanel className={splitPanelClassName} value="questions">
                    {isReportsLoading ? (
                      <FormsSkeleton />
                    ) : (
                      <ResultSectionStack>
                        <InterviewReportOverallSection report={report} />
                        <ResultSection
                          action={
                            canResetResultRound && handleResetSelectedRound ? (
                              <Button
                                disabled={resettingRoundId === record.roundId}
                                onClick={handleResetSelectedRound}
                                size="xs"
                                type="button"
                                variant="outline"
                              >
                                <IconArrowBackUp />
                                {resettingRoundId === record.roundId ? "重置中..." : "重置沟通"}
                              </Button>
                            ) : null
                          }
                          meta={<Badge variant="outline">共{interviewItems.length}题</Badge>}
                          icon={IconMessageQuestion}
                          title="沟通题问答"
                        >
                          <CollectedCandidateInfoList
                            emptyLabel="暂无沟通题"
                            items={interviewItems}
                            speaker={{ avatar: candidateAvatar, name: record.candidateName }}
                          />
                        </ResultSection>
                      </ResultSectionStack>
                    )}
                  </TabsPanel>
                ) : null}

                {transcriptPane && !isSplitLayout ? (
                  // 保持挂载：切换页签时录像不中断、已加载的录像地址不丢失。
                  // Kept mounted so switching tabs neither stops playback nor drops the loaded video.
                  <TabsPanel keepMounted value="transcript">
                    {transcriptPane}
                  </TabsPanel>
                ) : null}

                <TabsPanel className={splitPanelClassName} value="forms">
                  <ResultSectionStack>
                    {isFormSubmissionsLoading || isReportsLoading ? (
                      <FormsSkeleton />
                    ) : (
                      <ResultSection
                        action={
                          mode === "interview" && !isPublic && isLatestResultReportSelected ? (
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
                          ) : null
                        }
                        meta={<Badge variant="outline">共{formItems.length}题</Badge>}
                        icon={IconForms}
                        title="表单题"
                      >
                        <CollectedCandidateInfoList emptyLabel="暂无表单答复" items={formItems} />
                      </ResultSection>
                    )}
                  </ResultSectionStack>
                </TabsPanel>
              </Tabs>
              {isSplitLayout && transcriptPane ? (
                <aside className="min-h-0 border-border/60 border-l pl-8">{transcriptPane}</aside>
              ) : null}
            </div>
          </KeywordHighlightProvider>
        </RecordingPlaybackProvider>
      )}
    </div>
  );
}
