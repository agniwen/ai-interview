/* oxlint-disable no-explicit-any no-nested-ternary complexity -- tab body has explicit loading/empty/content branches. */
"use client";

import { IconArrowBackUp, IconLoader2 } from "@tabler/icons-react";

import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";
import { scrollToWorkExperienceCompany } from "@/components/features/resume/work-experience";
import {
  ResumeOverviewPanel,
  ResumeReviewStructuredView,
} from "@/components/features/studio/resumes/resume-overview-panel";
import { StructuredResumeEvaluationPanel } from "@/components/features/studio/resumes/structured-resume-evaluation-panel";
import { QualitativeResumeEvaluationPanel } from "@/components/features/studio/resumes/qualitative-resume-evaluation-panel";
import { CandidateMeetingLinks } from "@/components/features/studio/resumes/candidate-meeting-links";
import { AnimatedHeight } from "@/components/features/motion/animated-height";
import { Button } from "@/components/ui/button";
import { TabsContent } from "@/components/ui/tabs";
import { cn } from "@arc/shared/utils";

import { HumanInterviewStagePanel } from "./human-interview-stage-panel";
import { OfferStagePanel } from "./offer-stage-panel";
import { CandidateDetailRail } from "./candidate-detail-rail";
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
      {isResumeAssessmentInProgress || isReassessingResume ? "评价中" : "重新评价"}
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
                {resumeRecord &&
                (!resumeRecord.jobDescriptionId ||
                  resumeRecord.resumeEvaluationArtifactMode === "qualitative" ||
                  !resumeRecord.resumeEvaluationArtifactMode) ? (
                  <QualitativeResumeEvaluationPanel
                    detail={resumeRecord}
                    slug={model.slug}
                    summaryAction={resumeReassessAction ?? undefined}
                  />
                ) : resumeRecord?.resumeEvaluationArtifactMode === "structured" ? (
                  <StructuredResumeEvaluationPanel
                    canEdit={Boolean(model.canUpdateResumeLibrary)}
                    detail={resumeRecord}
                    onUpdated={model.onResumeIdentityUpdated}
                    slug={model.slug}
                    summaryAction={resumeReassessAction ?? undefined}
                  />
                ) : (
                  <>
                    {resumeRecord?.resumeEvaluationAttemptMode === "qualitative" &&
                    (resumeRecord.resumeReviewStatus === "queued" ||
                      resumeRecord.resumeReviewStatus === "processing") ? (
                      <p className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-3 py-2 text-sm text-yellow-700 dark:text-yellow-300">
                        正在使用新版重新评价，当前展示老版本结果。
                      </p>
                    ) : null}
                    {resumeRecord?.resumeEvaluationAttemptMode === "qualitative" &&
                    resumeRecord.resumeReviewStatus === "failed" ? (
                      <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
                        {resumeRecord.resumeReviewError || "新版评价失败"}，当前展示老版本结果。
                      </p>
                    ) : null}
                    <ResumeReviewStructuredView
                      review={resumeRecord?.resumeReview}
                      screeningResultSlot={
                        <ResumeScreeningResultPanel resumeRecord={resumeRecord} />
                      }
                      summaryAction={resumeReassessAction ?? undefined}
                    />
                  </>
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
            canUseTimelineRailScroll
              ? "xl:h-full"
              : "xl:sticky xl:top-[calc(var(--header-height)+1rem)] xl:self-start",
          )}
        >
          <CandidateDetailRail
            isTimelineLoading={isTimelineLoading}
            onWorkExperienceSelect={(companyName) => {
              scrollToWorkExperienceCompany(tabContentRootRef.current, companyName);
            }}
            profile={resumeRecord?.resumeProfile ?? null}
            timeline={candidateTimeline}
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
