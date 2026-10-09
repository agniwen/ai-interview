import { ScreeningAdvanceActions } from "./screening-advance-actions";
import { findEffectiveAiRound } from "./effective-ai-round";
import { RecruitingNodeActions } from "./recruiting-node-actions";
/* oxlint-disable complexity -- header builder composes title, tabs, action bar, and layout classes. */

import { IconExternalLink, IconRobot, IconRefresh } from "@tabler/icons-react";
import type {
  StudioInterviewRoundDetail,
  StudioInterviewRoundListRecord,
} from "@app/shared/studio-interview-rounds";
import {
  canLaunchInterviewFromResume,
  getHumanInterviewProgressForStage,
} from "@app/shared/studio-resumes";
import type { ResumeLibraryDetail } from "@app/shared/studio-resumes";
import { cn } from "@app/shared/utils";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ResumeDocumentPreviewButton } from "@/components/features/resume/resume-document-preview-button";
import { JobDescriptionHoverCard } from "@/components/features/studio/job-descriptions/job-description-hover-card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { RecruitingActionButton as Button } from "./recruiting-action-button";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { scheduleEntryStatusMeta } from "@app/db-schema/studio-interviews";
import type { PipelineStage } from "@app/db-schema/studio-interviews";
import { ScheduleHumanInterviewButton } from "./schedule-human-interview-button";
import { canShowHumanInterviewScheduleAction } from "./human-interview-stage-utils";
import {
  CandidatePipelineActionBar,
  LaunchAiInterviewAction,
} from "./candidate-action-dock/candidate-pipeline-action-bar";
import { DetailHeaderSkeleton, DetailTitleSkeleton } from "./studio-person-detail-skeletons";
import {
  findCachedResumeCandidateName,
  renderHeaderDescription,
  shouldShowAiInterviewTab,
  shouldShowHumanInterviewTab,
  shouldShowOfferTab,
  shouldShowOnboardingTab,
} from "./studio-person-detail-model";
import type {
  StudioPersonDetailLayoutMode,
  StudioPersonDetailMode,
  StudioPersonDetailTab,
} from "./studio-person-detail-model";
import type { UnifiedRecord } from "./studio-person-detail-record";

export interface BuildStudioPersonDetailHeaderParams {
  actionBarPipelineStage: PipelineStage | undefined;
  activeTab: StudioPersonDetailTab;
  canCreateHumanInterview: boolean;
  canCreateOffer: boolean;
  canReadHumanInterview: boolean;
  canReadOffer: boolean;
  canUpdateInterview: boolean;
  canUseManagementActions: boolean;
  candidateRounds: StudioInterviewRoundListRecord[];
  effectiveRecordId: string | null;
  isLoading: boolean;
  isPublic: boolean;
  isReview: boolean;
  isRoundsLoading: boolean;
  layoutMode: StudioPersonDetailLayoutMode;
  mode: StudioPersonDetailMode;
  isRefreshing: boolean;
  onRefresh: () => void;
  onInterviewStageReady: (target: PipelineStage) => void;
  onAdvancePipelineStage: (target: PipelineStage) => Promise<void>;
  onClose?: () => void;
  onLaunchInterview?: (candidate: { candidateName: string | null; id: string }) => void;
  onNavigateToInterviews: () => void;
  onRequestClose?: (candidate: { candidateName: string; id: string }) => void;
  onRequestReactivate?: (candidate: { candidateName: string; id: string }) => void;
  onResetRound: (targetRoundId: string) => Promise<boolean>;
  onViewCurrentStage: () => void;
  queryClient: QueryClient;
  record: UnifiedRecord | null;
  resettingRoundId: string | null;
  resumeRecord: ResumeLibraryDetail | null | undefined;
  round: StudioInterviewRoundDetail | null | undefined;
  showAgentInstructions: boolean;
  slug: string;
  tabVisibilityRecord: {
    pipelineStage?: PipelineStage;
    closedFromNode?: string | null;
    hasInitialInterview?: boolean;
  } | null;
}

export interface StudioPersonDetailHeaderResult {
  bodyLayoutClassName: string;
  canUseTimelineRailScroll: boolean;
  description: ReactNode;
  detailScrollClassName: string;
  floatingActionBar: ReactNode;
  headerExtra: ReactNode;
  resumePreviewUrl: string;
  showTimelineRail: boolean;
  title: ReactNode;
}

export function buildStudioPersonDetailHeader({
  actionBarPipelineStage,
  activeTab,
  canCreateHumanInterview,
  canCreateOffer,
  canReadHumanInterview,
  canReadOffer,
  canUpdateInterview,
  canUseManagementActions,
  candidateRounds,
  effectiveRecordId,
  isLoading,
  isPublic,
  isReview,
  isRoundsLoading,
  layoutMode,
  mode,
  isRefreshing,
  onRefresh,
  onAdvancePipelineStage,
  onInterviewStageReady,
  onClose,
  onLaunchInterview,
  onNavigateToInterviews,
  onRequestClose,
  onRequestReactivate,
  onResetRound,
  onViewCurrentStage,
  queryClient,
  record,
  resettingRoundId,
  resumeRecord,
  round,
  showAgentInstructions,
  slug,
  tabVisibilityRecord,
}: BuildStudioPersonDetailHeaderParams): StudioPersonDetailHeaderResult {
  const canLaunchResumeModeRecord =
    canUseManagementActions &&
    (mode !== "resume" || !record?.resumeParseStatus
      ? true
      : canLaunchInterviewFromResume(
          record.resumeParseStatus,
          record.pipelineStage,
          resumeRecord?.resumeEvaluationStatus ?? null,
        ));
  const showLaunchButton =
    mode === "resume" &&
    record?.pipelineStage === "ai_interview" &&
    canLaunchResumeModeRecord &&
    !isRoundsLoading &&
    !resumeRecord?.nodeStates.some(
      (node) => node.node === "ai_interview" && node.effectiveAiRoundId,
    );
  const launchResumeModeDisabledReason =
    showLaunchButton && !resumeRecord?.jobDescriptionId ? "请先绑定在招岗位后再发起 AI初面" : null;
  const launchResumeModeButtonContent = showLaunchButton ? (
    <Button
      disabledReason={launchResumeModeDisabledReason}
      className={cn(launchResumeModeDisabledReason && "opacity-50")}
      size="sm"
      onClick={() => {
        if (!record) {
          return;
        }
        if (launchResumeModeDisabledReason) {
          return;
        }
        if (onLaunchInterview) {
          onLaunchInterview({
            candidateName: record.candidateName ?? null,
            id: record.id,
          });
          onClose?.();
          return;
        }
        onNavigateToInterviews();
        onClose?.();
      }}
      type="button"
    >
      <IconRobot className="size-4" />
      发起 AI初面
      {onLaunchInterview ? null : <IconExternalLink className="size-3.5 opacity-70" />}
    </Button>
  ) : null;
  const launchResumeModeButton =
    layoutMode === "page" && showLaunchButton && record ? (
      <LaunchAiInterviewAction
        candidate={{ candidateName: record.candidateName, id: record.id }}
        disabledReason={launchResumeModeDisabledReason}
      />
    ) : (
      launchResumeModeButtonContent
    );

  const cachedResumeCandidateName =
    mode === "resume" ? findCachedResumeCandidateName(queryClient, effectiveRecordId) : null;
  const resumeTitle = record?.candidateName?.trim() || cachedResumeCandidateName || "候选人详情";
  let title =
    mode === "resume" ? (
      <span className="wrap-break-word">{resumeTitle}</span>
    ) : (
      <span className="flex flex-wrap items-center gap-3">
        <span className="wrap-break-word">{record?.candidateName ?? "候选人详情"}</span>
        {record?.roundStatus ? (
          <Badge variant={scheduleEntryStatusMeta[record.roundStatus].tone}>
            {scheduleEntryStatusMeta[record.roundStatus].label}
          </Badge>
        ) : null}
      </span>
    );

  let description: ReactNode = renderHeaderDescription({ isLoading, round });
  if (mode === "resume" || (mode === "interview" && layoutMode === "modal")) {
    const linkedJobDescriptionName = record?.jobDescriptionName?.trim();
    description = (
      <JobDescriptionHoverCard
        jobDescriptionId={record?.jobDescriptionId}
        name={linkedJobDescriptionName}
      />
    );
  }

  if (layoutMode === "modal" || isReview || isPublic || mode === "interview") {
    const avatarName = record?.candidateName?.trim() || cachedResumeCandidateName;
    const avatarLabel = avatarName || record?.candidateEmail?.trim() || "候选人";
    title = (
      <span className="flex min-w-0 items-center gap-3">
        <Avatar
          className="size-14 shrink-0"
          generatedSize={56}
          label={`${avatarLabel}的头像`}
          seed={avatarName || "未命名候选人"}
        >
          <AvatarFallback>{avatarLabel.slice(0, 1).toUpperCase()}</AvatarFallback>
        </Avatar>
        <span className="flex min-w-0 flex-col gap-2">
          {title}
          {description ? (
            <span className="text-sm font-normal text-muted-foreground">{description}</span>
          ) : null}
        </span>
      </span>
    );
    description = null;
  }

  if (isLoading && (layoutMode === "modal" || isReview || isPublic || mode === "interview")) {
    title = (
      <>
        <span className="sr-only">候选人详情正在加载</span>
        <DetailTitleSkeleton />
      </>
    );
    description = null;
  }

  const resumePreviewUrl = (() => {
    if (!record?.hasResumeFile) {
      return "";
    }
    if (isPublic) {
      return `/api/public/interview-rounds/${record.roundId ?? record.id}/resume`;
    }
    if (isReview) {
      return `/api/w/${slug}/studio/resumes/${record.id}/review/resume`;
    }
    const previewRecordId = mode === "interview" ? (record.roundId ?? record.id) : record.id;
    return `/api/w/${slug}/studio/${mode === "resume" ? "resumes" : "interviews"}/${previewRecordId}/resume`;
  })();
  const currentHumanInterviewProgress =
    resumeRecord &&
    (resumeRecord.pipelineStage === "second_interview" ||
      resumeRecord.pipelineStage === "final_interview")
      ? getHumanInterviewProgressForStage(
          resumeRecord.stageProgress.humanInterview,
          resumeRecord.pipelineStage,
        )
      : null;

  const actionBarAiRound = findEffectiveAiRound(candidateRounds, resumeRecord?.nodeStates);
  const actionBar =
    mode === "resume" &&
    record &&
    canUseManagementActions &&
    actionBarPipelineStage &&
    record.outcome ? (
      <CandidatePipelineActionBar
        key={`${record.id}:${actionBarPipelineStage}`}
        candidate={{ candidateName: record.candidateName, id: record.id }}
        hasUnfinishedHumanInterview={Boolean(
          currentHumanInterviewProgress?.activeRound ||
          (currentHumanInterviewProgress?.completedRoundsMissingFeedback ?? 0) > 0,
        )}
        humanInterviewDone={Boolean(
          currentHumanInterviewProgress &&
          currentHumanInterviewProgress.totalRounds > 0 &&
          currentHumanInterviewProgress.activeRound === null,
        )}
        humanInterviewFeedbackComplete={Boolean(
          currentHumanInterviewProgress &&
          currentHumanInterviewProgress.completedRoundsMissingFeedback === 0,
        )}
        aiRoundInterviewLink={
          layoutMode === "page" &&
          actionBarPipelineStage === "ai_interview" &&
          !isRoundsLoading &&
          actionBarAiRound?.status === "pending"
            ? {
                candidateInviteExpiresAt: actionBarAiRound.candidateInviteExpiresAt,
                interviewLink: actionBarAiRound.interviewLink,
                status: actionBarAiRound.status,
              }
            : undefined
        }
        aiRoundReset={
          layoutMode === "page" &&
          actionBarPipelineStage === "ai_interview" &&
          !isRoundsLoading &&
          canUpdateInterview &&
          actionBarAiRound
            ? {
                isResetting: resettingRoundId === actionBarAiRound.id,
                onReset: () => onResetRound(actionBarAiRound.id),
                roundLabel: actionBarAiRound.roundLabel,
                status: actionBarAiRound.status,
              }
            : undefined
        }
        canCreateHumanInterview={actionBarPipelineStage !== "screening" && canCreateHumanInterview}
        canCreateOffer={canCreateOffer}
        currentNodePassed={
          resumeRecord?.nodeResult === "pass" ||
          (actionBarPipelineStage === "ai_interview" &&
            resumeRecord?.stageProgress.initialInterview?.latestStatus === "ready")
        }
        hasJobDescription={Boolean(resumeRecord?.jobDescriptionId)}
        onAdvance={onAdvancePipelineStage}
        onRequestClose={() =>
          onRequestClose?.({ candidateName: record.candidateName, id: record.id })
        }
        onRequestReactivate={() =>
          onRequestReactivate?.({ candidateName: record.candidateName, id: record.id })
        }
        onViewCurrentStage={onViewCurrentStage}
        pipelineStage={actionBarPipelineStage}
        primaryAction={
          <>
            {actionBarPipelineStage === "screening" && resumeRecord ? (
              <ScreeningAdvanceActions
                onAdvanced={onInterviewStageReady}
                key={`screening:${resumeRecord.id}`}
                record={resumeRecord}
              />
            ) : null}
            {resumeRecord &&
              canUpdateInterview &&
              (canCreateOffer ||
                ![
                  "income_proof",
                  "salary_negotiation",
                  "offer",
                  "background_check",
                  "onboarding",
                ].includes(actionBarPipelineStage)) && (
                <RecruitingNodeActions
                  key={`node:${resumeRecord.id}:${resumeRecord.pipelineStage}`}
                  record={resumeRecord}
                />
              )}
            {canShowHumanInterviewScheduleAction(
              actionBarPipelineStage,
              canCreateHumanInterview,
              canReadHumanInterview,
            ) ? (
              <ScheduleHumanInterviewButton
                key={`${record.id}:${actionBarPipelineStage}`}
                onScheduled={() => onInterviewStageReady(actionBarPipelineStage)}
                targetStage={actionBarPipelineStage}
                candidateId={record.id}
                candidateName={record.candidateName}
              />
            ) : (
              actionBarPipelineStage !== "screening" && launchResumeModeButton
            )}
          </>
        }
      />
    ) : null;

  const headerActionBar = layoutMode === "modal" ? actionBar : null;
  const floatingActionBar = layoutMode === "page" ? actionBar : null;

  const headerControls = record ? (
    <div className="mt-2 flex flex-col gap-3">
      <div className="flex min-w-0 flex-col items-stretch gap-2 sm:flex-row sm:items-end sm:justify-between">
        <TabsList
          aria-label="候选人详情"
          className="order-2 mt-0 w-full sm:order-1 sm:w-auto sm:flex-1"
          variant="underline"
        >
          <TabsTrigger className="min-w-[6em] flex-none" value="overview">
            {mode === "interview" ? "结果" : "概览"}
          </TabsTrigger>
          {mode === "interview" ? (
            <TabsTrigger className="min-w-[6em] flex-none" value="experience">
              经历
            </TabsTrigger>
          ) : null}
          {mode === "resume" ? (
            <TabsTrigger className="min-w-[6em] flex-none" value="ai-analysis">
              AI评价
            </TabsTrigger>
          ) : null}
          {mode === "resume" && shouldShowAiInterviewTab(tabVisibilityRecord) ? (
            <TabsTrigger className="min-w-[6em] flex-none" value="rounds">
              AI初面
            </TabsTrigger>
          ) : null}
          {mode === "resume" &&
          shouldShowHumanInterviewTab(tabVisibilityRecord, canReadHumanInterview) ? (
            <TabsTrigger className="min-w-[6em] flex-none" value="human-interview">
              真人面试
            </TabsTrigger>
          ) : null}
          {mode === "resume" && shouldShowOfferTab(tabVisibilityRecord, canReadOffer) ? (
            <TabsTrigger className="min-w-[6em] flex-none" value="offer">
              Offer
            </TabsTrigger>
          ) : null}
          {mode === "resume" && shouldShowOnboardingTab(tabVisibilityRecord) ? (
            <TabsTrigger className="min-w-[6em] flex-none" value="onboarding">
              入职办理
            </TabsTrigger>
          ) : null}
          {showAgentInstructions ? (
            <TabsTrigger className="min-w-[6em] flex-none" value="instructions">
              Agent 提示词
            </TabsTrigger>
          ) : null}
        </TabsList>
        <div className="order-1 flex shrink-0 flex-col items-stretch gap-2 sm:order-2 sm:flex-row sm:items-center sm:justify-end sm:pb-1.5">
          {headerActionBar}
          <div className="flex items-center gap-2">
            <ResumeDocumentPreviewButton
              className="flex-1 sm:flex-none"
              disabled={!record.hasResumeFile}
              filename={record.resumeFileName ?? undefined}
              label="预览简历"
              variant="outline"
              url={resumePreviewUrl}
            />
            {mode === "resume" && (
              <Button
                className="h-8 flex-1 gap-1.5 sm:flex-none"
                size="sm"
                variant="outline"
                isLoading={isRefreshing}
                onClick={onRefresh}
              >
                <IconRefresh
                  className={cn("size-3.5", isRefreshing && "animate-spin")}
                  data-icon="inline-start"
                />
                {isRefreshing ? "刷新中…" : "刷新信息"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  ) : null;
  const headerExtra =
    isLoading || record ? (
      <SkeletonReveal loading={isLoading} skeleton={<DetailHeaderSkeleton mode={mode} />}>
        {headerControls}
      </SkeletonReveal>
    ) : null;

  const showTimelineRail = mode === "resume" && !isPublic && activeTab === "overview";
  const canUseTimelineRailScroll = showTimelineRail && layoutMode === "modal";
  let bodyLayoutClassName = "flex flex-col gap-8";
  if (showTimelineRail) {
    bodyLayoutClassName = cn(
      "grid gap-4 xl:grid-cols-[minmax(0,1fr)_20rem] xl:gap-x-10 2xl:grid-cols-[minmax(0,1fr)_24rem]",
      canUseTimelineRailScroll && "xl:h-full xl:min-h-0 xl:overflow-hidden",
      !canUseTimelineRailScroll && "xl:items-start",
    );
  }
  const detailScrollClassName = cn(
    "min-w-0 flex flex-col gap-8",
    canUseTimelineRailScroll && "xl:h-full xl:min-h-0 xl:overflow-y-auto xl:pr-1",
  );

  return {
    bodyLayoutClassName,
    canUseTimelineRailScroll,
    description,
    detailScrollClassName,
    floatingActionBar,
    headerExtra,
    resumePreviewUrl,
    showTimelineRail,
    title,
  };
}
