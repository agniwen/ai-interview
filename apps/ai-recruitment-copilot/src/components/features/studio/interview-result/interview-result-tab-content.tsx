/* oxlint-disable complexity -- result tab composes overview frames, forms, and report disclosure branches. */
"use client";

import { IconArrowBackUp } from "@tabler/icons-react";

import { CandidateBasicInfoView } from "@/components/features/candidate/candidate-basic-info-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";

import { InterviewReportDetailsDisclosure } from "../interview-report-details-disclosure";
import {
  FormsSkeleton,
  InterviewResultFramesSkeleton,
  InterviewResultOverviewSkeleton,
} from "../studio-person-detail-skeletons";
import { KeywordHighlightProvider } from "../interviews/interview-detail/keyword-highlight/context";
import type { EvidenceQuote } from "../interviews/interview-detail/evaluation-results";
import {
  CollectedCandidateInfoList,
  resolveActiveEvidence,
} from "../studio-person-detail-sections";
import type { StudioPersonDetailViewModel } from "../studio-person-detail-controller";
import { createSelectedEvidenceAction } from "./interview-result-evidence";
import { FormSubmissionResetAction, InterviewRecordSelector } from "./interview-record-selector";
import { InterviewResultFrame } from "./interview-result-frame";
import { InterviewReportDetails, InterviewReportSupplement } from "./interview-report-details";

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
    resumePreviewUrl,
    selectedEvidence,
    effectiveSelectedResultConversationId,
    updatingRoundId,
  } = model;
  const showRoundActions = canUseManagementActions && !isPublic;
  const selectedRoundId = record.roundId;
  const handleResetSelectedRound = selectedRoundId ? () => handleResetRound(selectedRoundId) : null;
  const handleToggleSelectedRoundTextInput = selectedRoundId
    ? (allowTextInput: boolean) => handleToggleAllowTextInput(selectedRoundId, allowTextInput)
    : null;
  const frozenInput = report?.snapshotMetadata?.fullTextInput;
  const frozenCandidate = frozenInput?.candidate;
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
                {showRoundActions &&
                isLatestResultReportSelected &&
                handleToggleSelectedRoundTextInput ? (
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
                          onCheckedChange={handleToggleSelectedRoundTextInput}
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
                    {canResetResultRound && handleResetSelectedRound ? (
                      <Button
                        className="ml-auto"
                        disabled={resettingRoundId === record.roundId}
                        onClick={handleResetSelectedRound}
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
