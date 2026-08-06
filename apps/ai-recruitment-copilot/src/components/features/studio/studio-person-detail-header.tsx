/* oxlint-disable complexity -- header builder composes title, tabs, action bar, and layout classes. */
"use client";

import { IconExternalLink, IconRobot } from "@tabler/icons-react";
import type {
  StudioInterviewRoundDetail,
  StudioInterviewRoundListRecord,
} from "@arc/shared/studio-interview-rounds";
import { canLaunchInterviewFromResume } from "@arc/shared/studio-resumes";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import { cn } from "@arc/shared/utils";
import type { QueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ResumeDocumentPreviewButton } from "@/components/features/resume/resume-document-preview-button";
import { JobDescriptionHoverCard } from "@/components/features/studio/job-descriptions/job-description-hover-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { scheduleEntryStatusMeta } from "@arc/db-schema/studio-interviews";
import type { PipelineStage } from "@arc/db-schema/studio-interviews";
import { PipelineStageActionBar } from "./pipeline-stage-action-bar";
import { DetailHeaderSkeleton } from "./studio-person-detail-skeletons";
import {
  findCachedResumeCandidateName,
  renderHeaderDescription,
  shouldShowAiInterviewTab,
  shouldShowHumanInterviewTab,
  shouldShowOfferTab,
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
  onAdvancePipelineStage: (target: PipelineStage) => Promise<void>;
  onClose?: () => void;
  onLaunchInterview?: (candidate: { candidateName: string | null; id: string }) => void;
  onNavigateToInterviews: () => void;
  onRequestClose?: (candidate: { candidateName: string; id: string }) => void;
  onRequestReactivate?: (candidate: { candidateName: string; id: string }) => void;
  onResetRound: (targetRoundId: string) => void;
  onViewCurrentStage: () => void;
  queryClient: QueryClient;
  record: UnifiedRecord | null;
  resettingRoundId: string | null;
  resumeRecord: ResumeLibraryDetail | null | undefined;
  round: StudioInterviewRoundDetail | null | undefined;
  showAgentInstructions: boolean;
  slug: string;
  tabVisibilityRecord: { pipelineStage?: PipelineStage } | null;
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
  onAdvancePipelineStage,
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
      : canLaunchInterviewFromResume(record.resumeParseStatus));
  const showLaunchButton =
    mode === "resume" &&
    record?.pipelineStage === "screening" &&
    canLaunchResumeModeRecord &&
    !isRoundsLoading &&
    candidateRounds.length === 0;
  const launchResumeModeDisabledReason =
    showLaunchButton && !resumeRecord?.jobDescriptionId ? "请先绑定在招岗位后再发起 AI 面试" : null;
  const launchResumeModeButtonContent = showLaunchButton ? (
    <Button
      aria-disabled={Boolean(launchResumeModeDisabledReason)}
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
      发起 AI 面试
      {onLaunchInterview ? null : <IconExternalLink className="size-3.5 opacity-70" />}
    </Button>
  ) : null;
  const launchResumeModeButton =
    launchResumeModeButtonContent && launchResumeModeDisabledReason ? (
      <Tooltip>
        <TooltipTrigger render={launchResumeModeButtonContent} />
        <TooltipContent>{launchResumeModeDisabledReason}</TooltipContent>
      </Tooltip>
    ) : (
      launchResumeModeButtonContent
    );

  const cachedResumeCandidateName =
    mode === "resume" ? findCachedResumeCandidateName(queryClient, effectiveRecordId) : null;
  const resumeTitle = record?.candidateName?.trim() || cachedResumeCandidateName || "候选人详情";
  const title =
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

  const actionBarAiRound = candidateRounds.at(-1);
  const actionBar =
    mode === "resume" &&
    record &&
    canUseManagementActions &&
    actionBarPipelineStage &&
    record.outcome ? (
      <PipelineStageActionBar
        humanInterviewDone={Boolean(
          resumeRecord?.stageProgress.humanInterview &&
          resumeRecord.stageProgress.humanInterview.totalRounds > 0 &&
          resumeRecord.stageProgress.humanInterview.activeRound === null,
        )}
        humanInterviewFeedbackComplete={Boolean(
          resumeRecord?.stageProgress.humanInterview &&
          resumeRecord.stageProgress.humanInterview.completedRoundsMissingFeedback === 0,
        )}
        aiRoundInterviewLink={
          layoutMode === "page" &&
          actionBarPipelineStage === "ai_interview" &&
          !isRoundsLoading &&
          actionBarAiRound?.status === "pending"
            ? actionBarAiRound.interviewLink
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
        canCreateHumanInterview={canCreateHumanInterview}
        canCreateOffer={canCreateOffer}
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
        primaryAction={launchResumeModeButton}
      />
    ) : null;

  const headerActionBar = layoutMode === "modal" ? actionBar : null;
  const floatingActionBar = layoutMode === "page" ? actionBar : null;

  let headerExtra: ReactNode = null;
  if (isLoading) {
    headerExtra = <DetailHeaderSkeleton mode={mode} />;
  } else if (record) {
    headerExtra = (
      <div className="mt-2 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <TabsList className="mt-0 w-full sm:w-auto">
          <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="overview">
            {mode === "interview" ? "结果" : "概览"}
          </TabsTrigger>
          {mode === "interview" ? (
            <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="experience">
              经历
            </TabsTrigger>
          ) : null}
          {mode === "resume" ? (
            <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="ai-analysis">
              AI评分
            </TabsTrigger>
          ) : null}
          {mode === "resume" && shouldShowAiInterviewTab(tabVisibilityRecord) ? (
            <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="rounds">
              AI 面试
            </TabsTrigger>
          ) : null}
          {mode === "resume" &&
          shouldShowHumanInterviewTab(tabVisibilityRecord, canReadHumanInterview) ? (
            <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="human-interview">
              真人复面
            </TabsTrigger>
          ) : null}
          {mode === "resume" && shouldShowOfferTab(tabVisibilityRecord, canReadOffer) ? (
            <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="offer">
              Offer
            </TabsTrigger>
          ) : null}
          {showAgentInstructions ? (
            <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="instructions">
              Agent 提示词
            </TabsTrigger>
          ) : null}
        </TabsList>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-end">
          {headerActionBar}
          <ResumeDocumentPreviewButton
            className="w-full sm:w-auto"
            disabled={!record.hasResumeFile}
            filename={record.resumeFileName ?? undefined}
            label="预览简历"
            url={resumePreviewUrl}
          />
        </div>
      </div>
    );
  }

  const showTimelineRail = mode === "resume" && !isPublic && activeTab === "overview";
  const canUseTimelineRailScroll = showTimelineRail && layoutMode === "modal";
  let bodyLayoutClassName = "flex flex-col gap-8";
  if (showTimelineRail) {
    bodyLayoutClassName = cn(
      "grid gap-4 xl:grid-cols-[minmax(0,1fr)_28rem]",
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
