/* oxlint-disable no-explicit-any no-nested-ternary complexity -- tab body has explicit loading/empty/content branches. */
"use client";

import { IconArrowBackUp, IconLoader2 } from "@tabler/icons-react";

import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";
import {
  ResumeOverviewPanel,
  ResumeReviewStructuredView,
} from "@/components/features/studio/resumes/resume-overview-panel";
import { StructuredResumeEvaluationPanel } from "@/components/features/studio/resumes/structured-resume-evaluation-panel";
import { CandidateMeetingLinks } from "@/components/features/studio/resumes/candidate-meeting-links";
import { AnimatedHeight } from "@/components/features/motion/animated-height";
import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";
import { cn } from "@arc/shared/utils";

import { HumanInterviewStagePanel } from "./human-interview-stage-panel";
import { OfferStagePanel } from "./offer-stage-panel";
import { CandidateTimeline } from "./candidate-timeline";
import { DetailBodySkeleton } from "./studio-person-detail-skeletons";
import { AgentInstructionsPanel } from "./interviews/agent-instructions-panel";
import {
  shouldShowAiInterviewTab,
  shouldShowHumanInterviewTab,
  shouldShowOfferTab,
} from "./studio-person-detail-model";
import { ResumeScreeningResultPanel } from "./studio-person-detail-sections";
import type { StudioPersonDetailViewModel } from "./studio-person-detail-controller";
import { InterviewResultTabContent } from "./interview-result/interview-result-tab-content";

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
    canUseTimelineRailScroll,
    showTimelineRail,
    showAgentInstructions,
    showRecruitingMeetings,
    tabContentRootRef,
    tabVisibilityRecord,
  } = model;
  const resumeReassessAction = canUseManagementActions ? (
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
      {isResumeAssessmentInProgress || isReassessingResume ? "评估中" : "重新评估"}
    </Button>
  ) : null;
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
                <>
                  <ResumeOverviewPanel
                    canEdit={Boolean(model.canUpdateResumeLibrary)}
                    detail={resumeRecord}
                    onUpdated={model.onResumeIdentityUpdated}
                    onViewAiScore={() => setActiveTab("ai-analysis")}
                    slug={model.slug}
                  />
                  {showRecruitingMeetings ? (
                    <CandidateMeetingLinks candidateId={resumeRecord.id} slug={model.slug} />
                  ) : null}
                </>
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
                {resumeRecord?.resumeEvaluationArtifactMode === "structured" ? (
                  <StructuredResumeEvaluationPanel
                    canEdit={Boolean(model.canUpdateResumeLibrary)}
                    detail={resumeRecord}
                    onUpdated={model.onResumeIdentityUpdated}
                    slug={model.slug}
                    summaryAction={resumeReassessAction ?? undefined}
                  />
                ) : (
                  <ResumeReviewStructuredView
                    review={resumeRecord?.resumeReview}
                    screeningResultSlot={<ResumeScreeningResultPanel resumeRecord={resumeRecord} />}
                    summaryAction={resumeReassessAction ?? undefined}
                  />
                )}
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
