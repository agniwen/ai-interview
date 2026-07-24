/* oxlint-disable complexity max-lines -- detail controller coordinates query and command state. */
"use client";

import { IconExternalLink, IconRobot } from "@tabler/icons-react";

import { useReducedMotion } from "motion/react";
import type { StudioInterviewConversationReport } from "@arc/db-schema/interview-session";
import type { StudioInterviewRoundDetail } from "@arc/shared/studio-interview-rounds";
import { canLaunchInterviewFromResume } from "@arc/shared/studio-resumes";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import { cn } from "@arc/shared/utils";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchPublicInterviewRound,
  fetchPublicInterviewRoundFormSubmissions,
  fetchPublicInterviewRoundReports,
  fetchPublicResume,
  fetchPublicResumeRounds,
  fetchStudioInterviewRound,
  fetchStudioInterviewRoundFormSubmissions,
  fetchStudioInterviewRoundReports,
  fetchStudioResume,
  fetchStudioResumeRounds,
  fetchStudioResumeReview,
  fetchStudioResumeReviewRounds,
  fetchStudioResumeReviewTimeline,
  fetchStudioResumeTimeline,
  resolvePublicInterviewRecordId,
  resolveStudioInterviewRecordId,
} from "@/lib/client/api";
import { useOptionalWorkspaceSlug } from "@/lib/client/workspace-context";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { ResumeDocumentPreviewButton } from "@/components/features/resume/resume-document-preview-button";
import { JobDescriptionHoverCard } from "@/components/features/studio/job-descriptions/job-description-hover-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHasPermission } from "@/hooks/use-has-permission";
import { PipelineStageActionBar } from "./pipeline-stage-action-bar";
import { DetailHeaderSkeleton } from "./studio-person-detail-skeletons";
import { countDisplayInterviewTurns } from "@arc/shared/interview-transcript-turns";
import { pipelineStageMeta, scheduleEntryStatusMeta } from "@arc/db-schema/studio-interviews";
import type { PipelineStage } from "@arc/db-schema/studio-interviews";
import { useRoundEmailSummary } from "./interviews/round-email/use-round-email-summary";
import { ensureArray } from "./interviews/interview-detail/helpers";

import {
  findCachedResumeCandidateName,
  renderHeaderDescription,
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
  advancePipelineStage,
  detailPanelUiReducer,
  getCollectedCandidateInfoItems,
  getEvaluationSummary,
  initialDetailPanelUiState,
  resetInterviewFormSubmission,
  resetInterviewRound,
  updateAllowTextInput,
} from "./studio-person-detail-sections";
import { StudioPersonDetailView } from "./studio-person-detail-view";

interface UnifiedRecord {
  id: string;
  candidateName: string;
  candidateEmail: string | null;
  candidatePhone: string | null;
  targetRole: string | null;
  jobDescriptionId: string | null;
  jobDescriptionName: string | null;
  resumeFileName: string | null;
  resumeParseStatus?: ResumeLibraryDetail["resumeParseStatus"];
  resumeProfile: ResumeLibraryDetail["resumeProfile"];
  notes: string | null;
  hasResumeFile: boolean;
  creatorName: string | null;
  resumeStorageKey?: string | null;
  interviewQuestions?: StudioInterviewRoundDetail["candidate"]["interviewQuestions"];
  pipelineStage?: ResumeLibraryDetail["pipelineStage"];
  outcome?: ResumeLibraryDetail["outcome"];
  roundId?: string;
  roundLabel?: string;
  roundScheduledAt?: string | null;
  roundScheduledEndAt?: string | null;
  roundStatus?: StudioInterviewRoundDetail["status"];
  roundInterviewLink?: string;
  roundAllowTextInput?: boolean;
  roundHasReport?: boolean;
}

function toUnifiedRoundRecord(round: StudioInterviewRoundDetail): UnifiedRecord {
  return {
    candidateEmail: round.candidate.candidateEmail,
    candidateName: round.candidate.candidateName,
    candidatePhone: round.candidate.candidatePhone,
    creatorName: round.candidate.creatorName,
    hasResumeFile: Boolean(round.candidate.resumeStorageKey),
    id: round.candidate.id,
    interviewQuestions: round.candidate.interviewQuestions,
    jobDescriptionId: round.candidate.jobDescriptionId,
    jobDescriptionName: round.candidate.jobDescriptionName,
    notes: round.candidate.notes,
    outcome: round.candidate.outcome,
    pipelineStage: round.candidate.pipelineStage,
    resumeFileName: round.candidate.resumeFileName,
    resumeProfile: round.candidate.resumeProfile ?? null,
    resumeStorageKey: round.candidate.resumeStorageKey,
    roundAllowTextInput: round.allowTextInput,
    roundHasReport: round.hasReport,
    roundId: round.id,
    roundInterviewLink: round.interviewLink,
    roundLabel: round.roundLabel,
    roundScheduledAt: round.scheduledAt,
    roundScheduledEndAt: round.scheduledEndAt,
    roundStatus: round.status,
    targetRole: round.candidate.targetRole,
  };
}

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
  shell,
}: StudioPersonDetailControllerProps) {
  const reduceMotion = useReducedMotion();
  const optionalSlug = useOptionalWorkspaceSlug();
  const isPublic = accessMode === "public";
  const isReview = accessMode === "review";
  const canUseManagementActions = accessMode === "authed";
  const canViewReportMetadata = accessMode === "authed";
  const hasReadHumanInterviewPermission = useHasPermission("humanInterview", "read");
  const hasUpdateInterviewPermission = useHasPermission("interview", "update");
  const hasUpdateResumeLibraryPermission = useHasPermission("resumeLibrary", "update");
  const hasCreateHumanInterviewPermission = useHasPermission("humanInterview", "create");
  const hasUpdateHumanInterviewPermission = useHasPermission("humanInterview", "update");
  const hasDeleteHumanInterviewPermission = useHasPermission("humanInterview", "delete");
  const hasReadOfferPermission = useHasPermission("offer", "read");
  const hasCreateOfferPermission = useHasPermission("offer", "create");
  const hasUpdateOfferPermission = useHasPermission("offer", "update");
  const hasDeleteOfferPermission = useHasPermission("offer", "delete");
  const canReadHumanInterview = canUseManagementActions && hasReadHumanInterviewPermission;
  const canUpdateInterview = canUseManagementActions && hasUpdateInterviewPermission;
  // Same gate as 招聘台列表 card「编辑」: resumeLibrary:update in authed mode.
  // Parse-ready is checked at the call site (canEditResumeRecord), matching
  // resume-library-card-actions.
  const canUpdateResumeLibrary = canUseManagementActions && hasUpdateResumeLibraryPermission;
  const canCreateHumanInterview = canUseManagementActions && hasCreateHumanInterviewPermission;
  const canUpdateHumanInterview = canUseManagementActions && hasUpdateHumanInterviewPermission;
  const canDeleteHumanInterview = canUseManagementActions && hasDeleteHumanInterviewPermission;
  const canReadOffer = canUseManagementActions && hasReadOfferPermission;
  const canCreateOffer = canUseManagementActions && hasCreateOfferPermission;
  const canUpdateOffer = canUseManagementActions && hasUpdateOfferPermission;
  const canDeleteOffer = canUseManagementActions && hasDeleteOfferPermission;
  if (!isPublic && !optionalSlug) {
    throw new Error(
      'StudioPersonDetailPanel(accessMode="authed"|"review") must run under a /w/[slug] route',
    );
  }
  const slug = optionalSlug ?? "";
  const [uiState, dispatchUi] = useReducer(detailPanelUiReducer, initialDetailPanelUiState);
  const [activeTab, setActiveTab] = useState<StudioPersonDetailTab>(defaultTab ?? "overview");
  const [metadataReport, setMetadataReport] = useState<StudioInterviewConversationReport | null>(
    null,
  );
  const [optimisticPipelineStage, setOptimisticPipelineStage] = useState<PipelineStage | null>(
    null,
  );
  const [isReassessingResume, setIsReassessingResume] = useState(false);
  const tabContentRootRef = useRef<HTMLDivElement>(null);
  const {
    pendingResetSubmissionId,
    resettingRoundId,
    resettingSubmissionId,
    selectedEvidence,
    updatingRoundId,
  } = uiState;
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  useEffect(() => {
    setActiveTab(defaultTab ?? "overview");
    setMetadataReport(null);
    setOptimisticPipelineStage(null);
  }, [defaultTab, mode, recordId, roundId]);
  useEffect(() => {
    tabContentRootRef.current?.scrollTo({
      top: 0,
    });
    tabContentRootRef.current?.closest<HTMLElement>('[data-slot="modal-body"]')?.scrollTo({
      top: 0,
    });
  }, [activeTab]);
  const needsResolve = mode === "interview" && !roundId && !!recordId;
  const { data: resolvedRoundId, isLoading: isResolvingRoundId } = useQuery({
    enabled: enabled && needsResolve,
    queryFn: () =>
      isPublic
        ? resolvePublicInterviewRecordId(recordId as string)
        : resolveStudioInterviewRecordId(slug, recordId as string),
    queryKey: ["studio-interview-resolve", slug, recordId, accessMode],
  });
  const effectiveRoundId = mode === "interview" ? (roundId ?? resolvedRoundId ?? null) : null;
  const effectiveRecordId = mode === "resume" ? (recordId ?? null) : null;
  const { data: round, isLoading: isInterviewLoading } = useQuery({
    enabled: enabled && !!effectiveRoundId && mode === "interview",
    queryFn: () =>
      isPublic
        ? fetchPublicInterviewRound(effectiveRoundId as string)
        : fetchStudioInterviewRound(slug, effectiveRoundId as string),
    queryKey: ["studio-interview-round", slug, effectiveRoundId, accessMode],
    refetchOnWindowFocus: true,
  });
  const { data: resumeRecord, isLoading: isResumeLoading } = useQuery({
    enabled: enabled && !!effectiveRecordId && mode === "resume",
    queryFn: () => {
      if (isPublic) {
        return fetchPublicResume(effectiveRecordId as string);
      }
      if (isReview) {
        return fetchStudioResumeReview(slug, effectiveRecordId as string);
      }
      return fetchStudioResume(slug, effectiveRecordId as string);
    },
    queryKey: ["studio-resumes", slug, "detail", effectiveRecordId, accessMode] as const,
    refetchInterval: (query) => {
      const status = query.state.data?.resumeReviewStatus;
      return status === "queued" || status === "processing" ? 30_000 : false;
    },
  });
  const isResumeAssessmentInProgress =
    resumeRecord?.resumeReviewStatus === "queued" ||
    resumeRecord?.resumeReviewStatus === "processing";
  async function handleReassessResume() {
    if (!(slug && effectiveRecordId) || !canUseManagementActions || isResumeAssessmentInProgress) {
      return;
    }
    setIsReassessingResume(true);
    try {
      const response = await fetch(
        `/api/w/${encodeURIComponent(slug)}/studio/resumes/${encodeURIComponent(effectiveRecordId)}/reassess`,
        { method: "POST" },
      );
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) {
        throw new Error(payload?.error ?? "重新评估失败");
      }
      toast.success("已开始重新评估");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["studio-resumes"] }),
        queryClient.invalidateQueries({
          queryKey: ["studio-resumes", slug, "detail", effectiveRecordId],
        }),
        queryClient.invalidateQueries({
          queryKey: ["studio-resumes", slug, "timeline", effectiveRecordId],
        }),
      ]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重新评估失败");
    } finally {
      setIsReassessingResume(false);
    }
  }
  const { data: reports = [], isLoading: isReportsLoading } = useQuery({
    enabled: enabled && !!effectiveRoundId && mode === "interview",
    queryFn: () =>
      isPublic
        ? fetchPublicInterviewRoundReports(effectiveRoundId as string)
        : fetchStudioInterviewRoundReports(slug, effectiveRoundId as string),
    queryKey: ["studio-interview-round-reports", slug, effectiveRoundId, accessMode],
    refetchOnWindowFocus: true,
  });
  const reportTranscriptStats = useMemo(() => {
    const stats = new Map<string, ReturnType<typeof countDisplayInterviewTurns>>();
    for (const report of reports) {
      stats.set(report.conversationId, countDisplayInterviewTurns(report.turns));
    }
    return stats;
  }, [reports]);
  const totalDisplayTurnCount = useMemo(() => {
    let total = 0;
    for (const stats of reportTranscriptStats.values()) {
      total += stats.turnCount;
    }
    return total;
  }, [reportTranscriptStats]);
  const { data: formSubmissions = [], isLoading: isFormSubmissionsLoading } = useQuery({
    enabled: enabled && !!effectiveRoundId && mode === "interview",
    queryFn: () =>
      isPublic
        ? fetchPublicInterviewRoundFormSubmissions(effectiveRoundId as string)
        : fetchStudioInterviewRoundFormSubmissions(slug, effectiveRoundId as string),
    queryKey: ["studio-interview-round-form-submissions", slug, effectiveRoundId, accessMode],
    refetchOnWindowFocus: true,
  });
  const { data: candidateRounds = [], isLoading: isRoundsLoading } = useQuery({
    enabled: enabled && !!effectiveRecordId && mode === "resume",
    queryFn: () => {
      if (isPublic) {
        return fetchPublicResumeRounds(effectiveRecordId as string);
      }
      if (isReview) {
        return fetchStudioResumeReviewRounds(slug, effectiveRecordId as string);
      }
      return fetchStudioResumeRounds(slug, effectiveRecordId as string);
    },
    queryKey: ["studio-resume-rounds", slug, effectiveRecordId, accessMode] as const,
    refetchOnWindowFocus: true,
  });
  const latestCandidateRoundId = mode === "resume" ? (candidateRounds.at(-1)?.id ?? null) : null;
  const shouldLoadResumeInterviewResult =
    enabled && mode === "resume" && activeTab === "rounds" && !!latestCandidateRoundId;
  const { data: latestCandidateRoundReports = [], isLoading: isCandidateRoundReportsLoading } =
    useQuery({
      enabled: shouldLoadResumeInterviewResult,
      queryFn: () =>
        isPublic
          ? fetchPublicInterviewRoundReports(latestCandidateRoundId as string)
          : fetchStudioInterviewRoundReports(slug, latestCandidateRoundId as string),
      queryKey: [
        "studio-interview-round-reports",
        slug,
        latestCandidateRoundId,
        accessMode,
      ] as const,
      refetchOnWindowFocus: true,
    });
  const { data: resumeInterviewRound, isLoading: isResumeInterviewRoundLoading } = useQuery({
    enabled: shouldLoadResumeInterviewResult,
    queryFn: () =>
      isPublic
        ? fetchPublicInterviewRound(latestCandidateRoundId as string)
        : fetchStudioInterviewRound(slug, latestCandidateRoundId as string),
    queryKey: ["studio-interview-round", slug, latestCandidateRoundId, accessMode] as const,
    refetchOnWindowFocus: true,
  });
  const {
    data: resumeInterviewFormSubmissions = [],
    isLoading: isResumeInterviewFormSubmissionsLoading,
  } = useQuery({
    enabled: shouldLoadResumeInterviewResult,
    queryFn: () =>
      isPublic
        ? fetchPublicInterviewRoundFormSubmissions(latestCandidateRoundId as string)
        : fetchStudioInterviewRoundFormSubmissions(slug, latestCandidateRoundId as string),
    queryKey: [
      "studio-interview-round-form-submissions",
      slug,
      latestCandidateRoundId,
      accessMode,
    ] as const,
    refetchOnWindowFocus: true,
  });
  const { data: candidateTimeline, isLoading: isTimelineLoading } = useQuery({
    enabled:
      enabled && !!effectiveRecordId && mode === "resume" && !isPublic && activeTab === "overview",
    queryFn: () =>
      isReview
        ? fetchStudioResumeReviewTimeline(slug, effectiveRecordId as string)
        : fetchStudioResumeTimeline(slug, effectiveRecordId as string),
    queryKey: ["studio-resumes", slug, "timeline", effectiveRecordId, accessMode] as const,
    refetchOnWindowFocus: true,
  });
  let resultRoundId: string | null = null;
  if (mode === "interview") {
    resultRoundId = round?.id ?? null;
  } else if (shouldLoadResumeInterviewResult) {
    resultRoundId = latestCandidateRoundId;
  }
  const roundEmailSummaryRoundIds = canUseManagementActions && resultRoundId ? [resultRoundId] : [];
  const roundEmailSummaryQuery = useRoundEmailSummary(slug, roundEmailSummaryRoundIds);
  const roundEmailSummary = resultRoundId
    ? roundEmailSummaryQuery.data?.[resultRoundId]
    : undefined;
  const isLoading =
    mode === "interview" ? isResolvingRoundId || isInterviewLoading : isResumeLoading;
  let record: UnifiedRecord | null = null;
  if (mode === "interview" && round) {
    record = toUnifiedRoundRecord(round);
  } else if (mode === "resume" && resumeRecord) {
    record = {
      candidateEmail: resumeRecord.candidateEmail,
      candidateName: resumeRecord.candidateName,
      candidatePhone: resumeRecord.candidatePhone,
      creatorName: resumeRecord.creatorName,
      hasResumeFile: resumeRecord.hasResumeFile,
      id: resumeRecord.id,
      interviewQuestions: resumeRecord.interviewQuestions,
      jobDescriptionId: resumeRecord.jobDescriptionId,
      jobDescriptionName: resumeRecord.jobDescriptionName,
      notes: resumeRecord.notes,
      outcome: resumeRecord.outcome,
      pipelineStage: resumeRecord.pipelineStage,
      resumeFileName: resumeRecord.resumeFileName,
      resumeParseStatus: resumeRecord.resumeParseStatus,
      resumeProfile: resumeRecord.resumeProfile,
      targetRole: resumeRecord.targetRole,
    };
  }
  const resumeInterviewResultRecord = resumeInterviewRound
    ? toUnifiedRoundRecord(resumeInterviewRound)
    : null;
  useEffect(() => {
    if (optimisticPipelineStage && record?.pipelineStage === optimisticPipelineStage) {
      setOptimisticPipelineStage(null);
    }
  }, [optimisticPipelineStage, record?.pipelineStage]);
  const visiblePipelineStage = optimisticPipelineStage ?? record?.pipelineStage;
  const hasRecord = record !== null;
  const tabVisibilityRecord = useMemo(
    () =>
      hasRecord
        ? {
            pipelineStage: visiblePipelineStage,
          }
        : null,
    [hasRecord, visiblePipelineStage],
  );
  const availableTabs = useMemo(() => {
    const tabs = new Set<StudioPersonDetailTab>();
    if (!hasRecord) {
      return tabs;
    }
    tabs.add("overview");
    if (mode === "interview") {
      tabs.add("reports");
      tabs.add("questions");
      tabs.add("experience");
      if (!isPublic) {
        tabs.add("instructions");
      }
      tabs.add("forms");
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
  }, [canReadHumanInterview, canReadOffer, hasRecord, isPublic, mode, tabVisibilityRecord]);
  useEffect(() => {
    if (record && !availableTabs.has(activeTab)) {
      setActiveTab("overview");
    }
  }, [activeTab, availableTabs, record]);
  async function confirmResetSubmission() {
    const submissionId = pendingResetSubmissionId;
    if (!effectiveRoundId || !submissionId) {
      return;
    }
    dispatchUi({ id: submissionId, type: "resettingSubmissionChanged" });
    dispatchUi({ id: null, type: "pendingResetSubmissionChanged" });
    const error = await resetInterviewFormSubmission({
      effectiveRoundId,
      queryClient,
      slug,
      submissionId,
    });
    if (error) {
      toast.error(error);
    } else {
      toast.success("已重置面试表单填写");
    }
    dispatchUi({ id: null, type: "resettingSubmissionChanged" });
  }
  async function handleToggleAllowTextInput(targetRoundId: string, next: boolean) {
    if (updatingRoundId) {
      return;
    }
    dispatchUi({ id: targetRoundId, type: "updatingRoundChanged" });
    const error = await updateAllowTextInput({
      next,
      queryClient,
      slug,
      targetRoundId,
    });
    if (error) {
      toast.error(error);
    } else {
      toast.success(next ? "已开启文本作答" : "已关闭文本作答");
      onUpdated?.();
    }
    dispatchUi({ id: null, type: "updatingRoundChanged" });
  }
  async function handleResetRound(targetRoundId: string) {
    if (resettingRoundId) {
      return;
    }
    dispatchUi({ id: targetRoundId, type: "resettingRoundChanged" });
    const error = await resetInterviewRound({
      queryClient,
      slug,
      targetRoundId,
    });
    if (error) {
      toast.error(error);
    } else {
      toast.success("轮次已重置为待开始");
      await queryClient.invalidateQueries({
        queryKey: ["studio-resume-rounds", slug, effectiveRecordId, accessMode],
      });
      onUpdated?.();
    }
    dispatchUi({ id: null, type: "resettingRoundChanged" });
  }
  const aiStageLockedReason: string | null =
    record?.pipelineStage &&
    record.pipelineStage !== "screening" &&
    record.pipelineStage !== "ai_interview"
      ? `候选人已进入「${pipelineStageMeta[record.pipelineStage].label}」阶段，AI 面试相关操作已锁定。如需修改请先回退阶段或重新激活。`
      : null;
  const isAiStageLocked = aiStageLockedReason !== null;
  const interviewQuestions = ensureArray<
    StudioInterviewRoundDetail["candidate"]["interviewQuestions"][number]
  >(record?.interviewQuestions);
  const visibleInterviewQuestions = interviewQuestions.slice(0, 20);
  const latestReport = reports[0] ?? null;
  const latestEvaluationSummary = getEvaluationSummary(
    latestReport?.evaluationCriteriaResults as Record<string, unknown> | undefined,
  );
  const latestCandidateRoundReport = latestCandidateRoundReports[0] ?? null;
  const latestCandidateRoundEvaluationSummary = getEvaluationSummary(
    latestCandidateRoundReport?.evaluationCriteriaResults as Record<string, unknown> | undefined,
  );
  const isResumeInterviewResultLoading =
    isRoundsLoading ||
    (!!latestCandidateRoundId &&
      (isCandidateRoundReportsLoading ||
        isResumeInterviewRoundLoading ||
        isResumeInterviewFormSubmissionsLoading));
  const { formItems, interviewItems } = getCollectedCandidateInfoItems({
    evaluation: latestReport?.evaluationCriteriaResults as Record<string, unknown> | undefined,
    formSubmissions,
  });
  const { formItems: resumeInterviewFormItems, interviewItems: resumeInterviewItems } =
    getCollectedCandidateInfoItems({
      evaluation: latestCandidateRoundReport?.evaluationCriteriaResults as
        | Record<string, unknown>
        | undefined,
      formSubmissions: resumeInterviewFormSubmissions,
    });
  const isRoundCompleted = record?.roundStatus === "completed";
  const canResetAiRound =
    Boolean(record?.roundId) && !isPublic && record?.pipelineStage === "ai_interview";
  const isRoundLive =
    record?.roundStatus === "in_progress" || record?.roundStatus === "interrupted";
  const roundActionLockedReason = isRoundLive ? "面试正在进行中，结束后才能发送或复制链接。" : null;
  const roundActionDisabledReason = roundActionLockedReason ?? aiStageLockedReason;
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
        void navigate({ params: { slug }, to: "/w/$slug/studio/interviews" });
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
  const actionBarPipelineStage = visiblePipelineStage ?? record?.pipelineStage;
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
                onReset: () => void handleResetRound(actionBarAiRound.id),
                roundLabel: actionBarAiRound.roundLabel,
                status: actionBarAiRound.status,
              }
            : undefined
        }
        canCreateHumanInterview={canCreateHumanInterview}
        canCreateOffer={canCreateOffer}
        hasJobDescription={Boolean(resumeRecord?.jobDescriptionId)}
        onAdvance={async (target) => {
          const error = await advancePipelineStage({
            queryClient,
            recordId: record.id,
            slug,
            target,
          });
          if (error) {
            toast.error(error);
            return;
          }
          toast.success(`已推进到「${pipelineStageMeta[target].label}」`);
          setOptimisticPipelineStage(target);
          setActiveTab(tabForPipelineStage(target));
          onUpdated?.();
        }}
        onRequestClose={() =>
          onRequestClose?.({ candidateName: record.candidateName, id: record.id })
        }
        onRequestReactivate={() =>
          onRequestReactivate?.({ candidateName: record.candidateName, id: record.id })
        }
        onViewCurrentStage={() => setActiveTab(tabForPipelineStage(actionBarPipelineStage))}
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
            <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="reports">
              面试报告
            </TabsTrigger>
          ) : null}
          {mode === "interview" ? (
            <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="questions">
              AI 题目
            </TabsTrigger>
          ) : null}
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
          {/* 真人复面 / Offer tab：阶段已到达或经过时才显示，避免新候选人页面过于喧闹。
            Human interview / Offer tabs surface only once the candidate has reached that stage. */}
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
          {mode === "interview" ? (
            <>
              {/* 公开访问下不暴露 Agent 提示词面板 —— 这是面试官调试用，不属于候选人侧/对外可见信息。
                Agent prompts are admin tooling (no public mirror) and are hidden from public access. */}
              {isPublic ? null : (
                <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="instructions">
                  Agent 提示词
                </TabsTrigger>
              )}
              <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="forms">
                表单答复
              </TabsTrigger>
            </>
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
      "grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]",
      canUseTimelineRailScroll && "xl:h-full xl:min-h-0 xl:overflow-hidden",
      !canUseTimelineRailScroll && "xl:items-start",
    );
  }
  const detailScrollClassName = cn(
    "min-w-0 flex flex-col gap-8",
    canUseTimelineRailScroll && "xl:h-full xl:min-h-0 xl:overflow-y-auto xl:pr-1",
  );
  return {
    activeTab,
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
    canUpdateResumeLibrary,
    canUseManagementActions,
    canUseTimelineRailScroll,
    canViewReportMetadata,
    candidateRounds,
    candidateTimeline,
    confirmResetSubmission,
    description,
    detailScrollClassName,
    dispatchUi,
    effectiveRoundId,
    enabled,
    floatingActionBar,
    formItems,
    formSubmissions,
    handleReassessResume,
    handleResetRound,
    handleToggleAllowTextInput,
    headerExtra,
    interviewItems,
    isAiStageLocked,
    isFormSubmissionsLoading,
    isLoading,
    isPublic,
    isReassessingResume,
    isReportsLoading,
    isResumeAssessmentInProgress,
    isResumeInterviewResultLoading,
    isRoundCompleted,
    isRoundsLoading,
    isTimelineLoading,
    latestCandidateRoundEvaluationSummary,
    latestCandidateRoundReport,
    latestEvaluationSummary,
    latestReport,
    metadataReport,
    mode,
    onRequestClose,
    onResumeIdentityUpdated: () => {
      void queryClient.invalidateQueries({ queryKey: ["studio-resumes", slug] });
      void queryClient.invalidateQueries({ queryKey: ["studio-interview-round", slug] });
      void queryClient.invalidateQueries({ queryKey: ["studio-interview-rounds", slug] });
    },
    pendingResetSubmissionId,
    record,
    recordId,
    reduceMotion,
    reportTranscriptStats,
    reports,
    resettingRoundId,
    resettingSubmissionId,
    resumeInterviewFormItems,
    resumeInterviewItems,
    resumeInterviewResultRecord,
    resumePreviewUrl,
    resumeRecord,
    round,
    roundActionDisabledReason,
    roundActionLockedReason,
    roundEmailSummary,
    roundId,
    selectedEvidence,
    setActiveTab,
    setMetadataReport,
    shell,
    showTimelineRail,
    slug,
    tabContentRootRef,
    tabVisibilityRecord,
    title,
    totalDisplayTurnCount,
    updatingRoundId,
    visibleInterviewQuestions,
  };
}

export type StudioPersonDetailViewModel = ReturnType<typeof useStudioPersonDetailController>;

export function StudioPersonDetailPanel(
  props: Parameters<typeof useStudioPersonDetailController>[0],
) {
  return <StudioPersonDetailView model={useStudioPersonDetailController(props)} />;
}
