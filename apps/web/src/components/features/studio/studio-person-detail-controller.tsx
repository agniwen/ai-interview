/* oxlint-disable complexity -- detail controller coordinates query and command state. */
"use client";

import type { StudioInterviewConversationReport } from "@app/db-schema/interview-session";
import type { InterviewQuestion } from "@app/db-schema/interview/types";
import type { PipelineStage } from "@app/db-schema/studio-interviews";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { matchesDetailRefresh } from "./detail-refresh";
import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { useOptionalWorkspaceSlug } from "@/lib/client/workspace-context";
import { buildStudioPersonDetailHeader } from "./studio-person-detail-header";
import {
  shouldShowAiInterviewTab,
  shouldShowHumanInterviewTab,
  shouldShowOfferTab,
  tabForPipelineStage,
} from "./studio-person-detail-model";
import type {
  StudioPersonDetailControllerProps,
  StudioPersonDetailTab,
} from "./studio-person-detail-model";
import {
  detailPanelUiReducer,
  getCollectedCandidateInfoItems,
  getEvaluationSummary,
  getReportFormItems,
  initialDetailPanelUiState,
} from "./studio-person-detail-sections";
import { StudioPersonDetailView } from "./studio-person-detail-view";
import { useStudioPersonDetailMutations } from "./use-studio-person-detail-mutations";
import { useStudioPersonDetailPermissions } from "./use-studio-person-detail-permissions";
import { useStudioPersonDetailQueries } from "./use-studio-person-detail-queries";

export function useStudioPersonDetailController({
  recordId,
  roundId,
  mode,
  enabled = true,
  defaultTab,
  accessMode = "authed",
  layoutMode = "modal",
  onUpdated,
  onLaunchInterview,
  onClose,
  onRequestClose,
  onRequestReactivate,
  onTabChange,
  shell,
}: StudioPersonDetailControllerProps) {
  const reduceMotion = useReducedMotion();
  const optionalSlug = useOptionalWorkspaceSlug();
  const {
    canCreateHumanInterview,
    canCreateOffer,
    canDeleteHumanInterview,
    canDeleteOffer,
    canReadHumanInterview,
    canReadOffer,
    canUpdateInterview,
    canUpdateHumanInterview,
    canUpdateOffer,
    canUpdateResumeLibrary,
    canUseManagementActions,
    canViewReportMetadata,
    isPublic,
    isReview,
  } = useStudioPersonDetailPermissions(accessMode);
  if (!isPublic && !optionalSlug) {
    throw new Error(
      'StudioPersonDetailPanel(accessMode="authed"|"review") must run under a /w/[slug] route',
    );
  }
  const slug = optionalSlug ?? "";
  const [uiState, dispatchUi] = useReducer(detailPanelUiReducer, initialDetailPanelUiState);
  const [activeTab, setActiveTabState] = useState<StudioPersonDetailTab>(defaultTab ?? "overview");
  const [metadataReport, setMetadataReport] = useState<StudioInterviewConversationReport | null>(
    null,
  );
  const [selectedResultConversationId, setSelectedResultConversationId] = useState<string | null>(
    null,
  );
  const [optimisticPipelineStage, setOptimisticPipelineStage] = useState<PipelineStage | null>(
    null,
  );
  const [humanInterviewQuestionDialogOpen, setHumanInterviewQuestionDialogOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const tabContentRootRef = useRef<HTMLDivElement>(null);
  const previousStageRef = useRef<{ id: string; stage: PipelineStage } | null>(null);
  const {
    pendingResetSubmissionId,
    resettingRoundId,
    resettingSubmissionId,
    selectedEvidence,
    updatingRoundId,
  } = uiState;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const setActiveTab = useCallback(
    (tab: StudioPersonDetailTab) => {
      setActiveTabState(tab);
      onTabChange?.(tab);
    },
    [onTabChange],
  );

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- This effect intentionally synchronizes state with an external lifecycle.
    setActiveTabState(defaultTab ?? "overview");
    setMetadataReport(null);
    setOptimisticPipelineStage(null);
    setHumanInterviewQuestionDialogOpen(false);
    setSelectedResultConversationId(null);
  }, [defaultTab, mode, recordId, roundId]);

  useEffect(() => {
    tabContentRootRef.current?.scrollTo({ top: 0 });
    tabContentRootRef.current?.closest<HTMLElement>('[data-slot="modal-body"]')?.scrollTo({
      top: 0,
    });
  }, [activeTab]);

  const queries = useStudioPersonDetailQueries({
    accessMode,
    activeTab,
    enabled,
    isPublic,
    isReview,
    mode,
    recordId,
    roundId,
    selectedResultConversationId,
    slug,
  });

  const {
    candidateRounds,
    candidateTimeline,
    effectiveRecordId,
    effectiveRoundId,
    effectiveSelectedResultConversationId,
    formSubmissions,
    isFormSubmissionsLoading,
    isLoading,
    isReportsLoading,
    isResumeInterviewResultLoading,
    isRoundsLoading,
    isSelectedReportFetching,
    isTimelineLoading,
    latestCandidateRoundId,
    latestResultReport,
    record,
    resultReports,
    resultRoundId,
    resumeInterviewFormSubmissions,
    resumeInterviewResultRecord,
    resumeRecord,
    round,
    selectedResultReport,
    shouldFetchSelectedReport,
  } = queries;

  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- This effect intentionally synchronizes state with an external lifecycle.
    setSelectedResultConversationId(null);
  }, [latestCandidateRoundId]);

  const isResumeAssessmentInProgress =
    resumeRecord?.resumeReviewStatus === "queued" ||
    resumeRecord?.resumeReviewStatus === "processing";

  const {
    confirmResetSubmission,
    handleAdvancePipelineStage,
    handleReassessResume,
    handleResetRound,
    handleToggleAllowTextInput,
    handleUpdateInterviewQuestions,
    isReassessingResume,
  } = useStudioPersonDetailMutations({
    accessMode,
    canUpdateResumeLibrary,
    canUseManagementActions,
    dispatchUi,
    effectiveRecordId,
    effectiveRoundId,
    isResumeAssessmentInProgress,
    onUpdated,
    pendingResetSubmissionId,
    queryClient,
    record,
    resettingRoundId,
    setActiveTab,
    setOptimisticPipelineStage,
    slug,
    updatingRoundId,
  });

  useEffect(() => {
    if (optimisticPipelineStage && record?.pipelineStage === optimisticPipelineStage) {
      // oxlint-disable-next-line react/set-state-in-effect -- This effect intentionally synchronizes state with an external lifecycle.
      setOptimisticPipelineStage(null);
    }
  }, [optimisticPipelineStage, record?.pipelineStage]);

  const visiblePipelineStage = optimisticPipelineStage ?? record?.pipelineStage;
  const hasRecord = record !== null;
  const tabVisibilityRecord = hasRecord ? { pipelineStage: visiblePipelineStage } : null;
  const showAgentInstructions = import.meta.env.DEV && mode === "interview" && !isPublic;

  const availableTabs = (() => {
    const tabs = new Set<StudioPersonDetailTab>();
    if (!hasRecord) {
      return tabs;
    }
    tabs.add("overview");
    if (mode === "interview") {
      tabs.add("experience");
      if (showAgentInstructions) {
        tabs.add("instructions");
      }
      return tabs;
    }
    tabs.add("ai-analysis");
    if (shouldShowAiInterviewTab(tabVisibilityRecord)) {
      tabs.add("rounds");
    }
    if (shouldShowHumanInterviewTab(tabVisibilityRecord, canReadHumanInterview)) {
      tabs.add("human-interview");
    }
    if (shouldShowOfferTab(tabVisibilityRecord, canReadOffer)) {
      tabs.add("offer");
    }
    return tabs;
  })();

  useEffect(() => {
    if (mode === "resume" && record?.pipelineStage) {
      const previous = previousStageRef.current;
      previousStageRef.current = { id: record.id, stage: record.pipelineStage };
      if (previous?.id === record.id && previous.stage !== record.pipelineStage) {
        const targetTab = tabForPipelineStage(record.pipelineStage);
        if (availableTabs.has(targetTab) && activeTab !== targetTab) {
          // 同步确认、回退等操作刷新后的真实节点；初次打开仍尊重 URL 指定的 tab。
          // oxlint-disable-next-line react/set-state-in-effect -- 同步服务端节点变化到受控 tab 与 URL。
          setActiveTab(targetTab);
          return;
        }
      }
    }
    if (record && !availableTabs.has(activeTab)) {
      // oxlint-disable-next-line react/set-state-in-effect -- This effect intentionally synchronizes state with an external lifecycle.
      setActiveTab("overview");
    }
  }, [activeTab, availableTabs, mode, record, setActiveTab]);

  const selectedResultEvaluationSummary = getEvaluationSummary(
    selectedResultReport?.evaluationCriteriaResults,
  );
  const currentResultFormSubmissions =
    mode === "interview" ? formSubmissions : resumeInterviewFormSubmissions;
  const currentResultFormItems = getCollectedCandidateInfoItems({
    evaluation: null,
    formSubmissions: currentResultFormSubmissions,
  }).formItems;
  const selectedResultFormItems =
    getReportFormItems(selectedResultReport) ??
    (effectiveSelectedResultConversationId === latestResultReport?.conversationId
      ? currentResultFormItems
      : []);
  const selectedResultInterviewItems = getCollectedCandidateInfoItems({
    evaluation: selectedResultReport?.evaluationCriteriaResults,
    formSubmissions: [],
  }).interviewItems;
  const isLatestResultReportSelected =
    effectiveSelectedResultConversationId === latestResultReport?.conversationId;
  const isRoundCompleted = record?.roundStatus === "completed";
  const canResetAiRound =
    Boolean(record?.roundId) && !isPublic && record?.pipelineStage === "ai_interview";

  const actionBarPipelineStage = visiblePipelineStage ?? record?.pipelineStage;
  async function requestPipelineStageAdvance(target: PipelineStage): Promise<void> {
    if (target === "second_interview") {
      setHumanInterviewQuestionDialogOpen(true);
      return;
    }
    await handleAdvancePipelineStage(target);
  }

  function confirmHumanInterviewQuestions(
    interviewQuestions: InterviewQuestion[],
  ): Promise<boolean> {
    return handleAdvancePipelineStage("second_interview", interviewQuestions);
  }
  async function refreshCurrentTab() {
    if (!effectiveRecordId || isRefreshing) {
      return;
    }
    setIsRefreshing(true);
    try {
      await queryClient.refetchQueries(
        {
          predicate: (query) =>
            matchesDetailRefresh(query.queryKey, {
              recordId: effectiveRecordId,
              roundIds: candidateRounds.map((candidateRound) => candidateRound.id),
              slug,
              tab: activeTab,
            }),
          type: "active",
        },
        { throwOnError: true },
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "刷新失败，请重试");
    } finally {
      setIsRefreshing(false);
    }
  }
  const header = buildStudioPersonDetailHeader({
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
    isRefreshing,
    isReview,
    isRoundsLoading,
    layoutMode,
    mode,
    onAdvancePipelineStage: requestPipelineStageAdvance,
    onClose,
    onInterviewStageReady: (target) => {
      setOptimisticPipelineStage(target);
      setActiveTab(tabForPipelineStage(target));
    },
    onLaunchInterview,
    onNavigateToInterviews: () => {
      void navigate({ params: { slug }, to: "/w/$slug/studio/interviews" });
    },
    onRefresh: () => {
      void refreshCurrentTab();
    },
    onRequestClose,
    onRequestReactivate,
    onResetRound: (targetRoundId) => {
      void handleResetRound(targetRoundId);
    },
    onViewCurrentStage: () => {
      if (actionBarPipelineStage) {
        setActiveTab(tabForPipelineStage(actionBarPipelineStage));
      }
    },
    queryClient,
    record,
    resettingRoundId,
    resumeRecord,
    round,
    showAgentInstructions,
    slug,
    tabVisibilityRecord,
  });

  return {
    activeTab,
    bodyLayoutClassName: header.bodyLayoutClassName,
    canCreateHumanInterview,
    canCreateOffer,
    canDeleteHumanInterview,
    canDeleteOffer,
    canReadHumanInterview,
    canReadOffer,
    canResetAiRound,
    canUpdateHumanInterview,
    canUpdateOffer,
    canUpdateResumeLibrary,
    canUseManagementActions,
    canUseTimelineRailScroll: header.canUseTimelineRailScroll,
    canViewReportMetadata,
    candidateRounds,
    candidateTimeline,
    confirmResetSubmission,
    description: header.description,
    detailScrollClassName: header.detailScrollClassName,
    dispatchUi,
    effectiveRoundId,
    effectiveSelectedResultConversationId,
    enabled,
    floatingActionBar: header.floatingActionBar,
    formSubmissions,
    handleReassessResume,
    handleResetRound,
    handleToggleAllowTextInput,
    handleUpdateInterviewQuestions,
    headerExtra: header.headerExtra,
    humanInterviewQuestionDialogOpen,
    isFormSubmissionsLoading,
    isLatestResultReportSelected,
    isLoading,
    isPublic,
    isReassessingResume,
    isReportsLoading,
    isResumeAssessmentInProgress,
    isResumeInterviewResultLoading,
    isRoundCompleted,
    isRoundsLoading,
    isSelectedReportLoading: shouldFetchSelectedReport && isSelectedReportFetching,
    isTimelineLoading,
    metadataReport,
    mode,
    onConfirmHumanInterviewQuestions: confirmHumanInterviewQuestions,
    onHumanInterviewQuestionDialogOpenChange: setHumanInterviewQuestionDialogOpen,
    onRequestClose,
    onResumeIdentityUpdated: () => {
      void queryClient.invalidateQueries({ queryKey: ["studio-resumes", slug] });
      void queryClient.invalidateQueries({ queryKey: ["studio-interview-round", slug] });
      void queryClient.invalidateQueries({ queryKey: ["studio-interview-rounds", slug] });
    },
    onSelectedReportChange: setSelectedResultConversationId,
    pendingResetSubmissionId,
    record,
    recordId,
    reduceMotion,
    resettingRoundId,
    resettingSubmissionId,
    resultReports,
    resultRoundId,
    resumeInterviewResultRecord,
    resumePreviewUrl: header.resumePreviewUrl,
    resumeRecord,
    round,
    roundId,
    selectedEvidence,
    selectedResultEvaluationSummary,
    selectedResultFormItems,
    selectedResultInterviewItems,
    selectedResultReport,
    setActiveTab,
    setMetadataReport,
    shell,
    showAgentInstructions,
    showRecruitingMeetings: mode === "resume" && !isPublic && !isReview,
    showTimelineRail: header.showTimelineRail,
    slug,
    tabContentRootRef,
    tabVisibilityRecord,
    title: header.title,
    updatingRoundId,
  };
}

export type StudioPersonDetailViewModel = ReturnType<typeof useStudioPersonDetailController>;

export function StudioPersonDetailPanel(
  props: Parameters<typeof useStudioPersonDetailController>[0],
) {
  return <StudioPersonDetailView model={useStudioPersonDetailController(props)} />;
}
