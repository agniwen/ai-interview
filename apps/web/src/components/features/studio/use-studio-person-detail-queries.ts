/* oxlint-disable complexity -- query hook coordinates resolve, reports, forms, timeline, and record assembly. */
"use client";

import type { StudioInterviewConversationReport } from "@arc/db-schema/interview-session";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { toast } from "sonner";
import {
  fetchPublicInterviewRound,
  fetchPublicInterviewRoundFormSubmissions,
  fetchPublicInterviewRoundReport,
  fetchPublicInterviewRoundReports,
  fetchPublicResume,
  fetchPublicResumeRounds,
  fetchStudioInterviewRound,
  fetchStudioInterviewRoundFormSubmissions,
  fetchStudioInterviewRoundReport,
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
import type {
  StudioPersonDetailAccessMode,
  StudioPersonDetailMode,
  StudioPersonDetailTab,
} from "./studio-person-detail-model";
import { toUnifiedRoundRecord } from "./studio-person-detail-record";
import type { UnifiedRecord } from "./studio-person-detail-record";

export interface UseStudioPersonDetailQueriesParams {
  accessMode: StudioPersonDetailAccessMode;
  activeTab: StudioPersonDetailTab;
  enabled: boolean;
  isPublic: boolean;
  isReview: boolean;
  mode: StudioPersonDetailMode;
  recordId: string | null | undefined;
  roundId: string | null | undefined;
  selectedResultConversationId: string | null;
  slug: string;
}

function toUnifiedResumeRecord(resumeRecord: ResumeLibraryDetail): UnifiedRecord {
  return {
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

function requireIdentifier(value: string | null | undefined, label: string): string {
  if (!value) {
    throw new Error(`${label}不能为空`);
  }
  return value;
}

export function useStudioPersonDetailQueries({
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
}: UseStudioPersonDetailQueriesParams) {
  const needsResolve = mode === "interview" && !roundId && !!recordId;
  const { data: resolvedRoundId, isLoading: isResolvingRoundId } = useQuery({
    enabled: enabled && needsResolve,
    queryFn: () =>
      isPublic
        ? resolvePublicInterviewRecordId(requireIdentifier(recordId, "面试记录 ID"))
        : resolveStudioInterviewRecordId(slug, requireIdentifier(recordId, "面试记录 ID")),
    queryKey: ["studio-interview-resolve", slug, recordId, accessMode],
  });
  const effectiveRoundId = mode === "interview" ? (roundId ?? resolvedRoundId ?? null) : null;
  const effectiveRecordId = mode === "resume" ? (recordId ?? null) : null;

  const { data: round, isLoading: isInterviewLoading } = useQuery({
    enabled: enabled && !!effectiveRoundId && mode === "interview",
    queryFn: () =>
      isPublic
        ? fetchPublicInterviewRound(requireIdentifier(effectiveRoundId, "面试轮次 ID"))
        : fetchStudioInterviewRound(slug, requireIdentifier(effectiveRoundId, "面试轮次 ID")),
    queryKey: ["studio-interview-round", slug, effectiveRoundId, accessMode],
    refetchOnWindowFocus: true,
  });

  const { data: resumeRecord, isLoading: isResumeLoading } = useQuery({
    enabled: enabled && !!effectiveRecordId && mode === "resume",
    queryFn: () => {
      if (isPublic) {
        return fetchPublicResume(requireIdentifier(effectiveRecordId, "简历记录 ID"));
      }
      if (isReview) {
        return fetchStudioResumeReview(slug, requireIdentifier(effectiveRecordId, "简历记录 ID"));
      }
      return fetchStudioResume(slug, requireIdentifier(effectiveRecordId, "简历记录 ID"));
    },
    queryKey: ["studio-resumes", slug, "detail", effectiveRecordId, accessMode] as const,
    refetchInterval: (query) => {
      const status = query.state.data?.resumeReviewStatus;
      return status === "queued" || status === "processing" ? 30_000 : false;
    },
  });

  const { data: reports = [], isLoading: isReportsLoading } = useQuery({
    enabled: enabled && !!effectiveRoundId && mode === "interview",
    queryFn: () =>
      isPublic
        ? fetchPublicInterviewRoundReports(requireIdentifier(effectiveRoundId, "面试轮次 ID"))
        : fetchStudioInterviewRoundReports(
            slug,
            requireIdentifier(effectiveRoundId, "面试轮次 ID"),
          ),
    queryKey: ["studio-interview-round-reports", slug, effectiveRoundId, accessMode],
    refetchOnWindowFocus: true,
  });

  const { data: formSubmissions = [], isLoading: isFormSubmissionsLoading } = useQuery({
    enabled: enabled && !!effectiveRoundId && mode === "interview",
    queryFn: () =>
      isPublic
        ? fetchPublicInterviewRoundFormSubmissions(
            requireIdentifier(effectiveRoundId, "面试轮次 ID"),
          )
        : fetchStudioInterviewRoundFormSubmissions(
            slug,
            requireIdentifier(effectiveRoundId, "面试轮次 ID"),
          ),
    queryKey: ["studio-interview-round-form-submissions", slug, effectiveRoundId, accessMode],
    refetchOnWindowFocus: true,
  });

  const { data: candidateRounds = [], isLoading: isRoundsLoading } = useQuery({
    enabled: enabled && !!effectiveRecordId && mode === "resume",
    queryFn: () => {
      if (isPublic) {
        return fetchPublicResumeRounds(requireIdentifier(effectiveRecordId, "简历记录 ID"));
      }
      if (isReview) {
        return fetchStudioResumeReviewRounds(
          slug,
          requireIdentifier(effectiveRecordId, "简历记录 ID"),
        );
      }
      return fetchStudioResumeRounds(slug, requireIdentifier(effectiveRecordId, "简历记录 ID"));
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
          ? fetchPublicInterviewRoundReports(
              requireIdentifier(latestCandidateRoundId, "候选人面试轮次 ID"),
            )
          : fetchStudioInterviewRoundReports(
              slug,
              requireIdentifier(latestCandidateRoundId, "候选人面试轮次 ID"),
            ),
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
        ? fetchPublicInterviewRound(requireIdentifier(latestCandidateRoundId, "候选人面试轮次 ID"))
        : fetchStudioInterviewRound(
            slug,
            requireIdentifier(latestCandidateRoundId, "候选人面试轮次 ID"),
          ),
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
        ? fetchPublicInterviewRoundFormSubmissions(
            requireIdentifier(latestCandidateRoundId, "候选人面试轮次 ID"),
          )
        : fetchStudioInterviewRoundFormSubmissions(
            slug,
            requireIdentifier(latestCandidateRoundId, "候选人面试轮次 ID"),
          ),
    queryKey: [
      "studio-interview-round-form-submissions",
      slug,
      latestCandidateRoundId,
      accessMode,
    ] as const,
    refetchOnWindowFocus: true,
  });

  const resultReports = mode === "interview" ? reports : latestCandidateRoundReports;
  const resultRoundId = mode === "interview" ? effectiveRoundId : latestCandidateRoundId;
  const latestResultReport = resultReports[0] ?? null;
  const hasSelectedResultReport = resultReports.some(
    (report) => report.conversationId === selectedResultConversationId,
  );
  const effectiveSelectedResultConversationId =
    (hasSelectedResultReport ? selectedResultConversationId : null) ??
    latestResultReport?.conversationId ??
    null;
  const selectedResultReportFromList =
    resultReports.find(
      (report) => report.conversationId === effectiveSelectedResultConversationId,
    ) ?? null;
  const shouldFetchSelectedReport =
    Boolean(resultRoundId) && hasSelectedResultReport && Boolean(selectedResultConversationId);

  const {
    data: fetchedSelectedReport,
    error: selectedReportError,
    isError: isSelectedReportError,
    isFetching: isSelectedReportFetching,
  } = useQuery({
    enabled: enabled && shouldFetchSelectedReport,
    queryFn: () =>
      isPublic
        ? fetchPublicInterviewRoundReport(
            requireIdentifier(resultRoundId, "面试轮次 ID"),
            requireIdentifier(effectiveSelectedResultConversationId, "面试会话 ID"),
          )
        : fetchStudioInterviewRoundReport(
            slug,
            requireIdentifier(resultRoundId, "面试轮次 ID"),
            requireIdentifier(effectiveSelectedResultConversationId, "面试会话 ID"),
          ),
    queryKey: [
      "studio-interview-round-reports",
      slug,
      resultRoundId,
      accessMode,
      "detail",
      effectiveSelectedResultConversationId,
    ] as const,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (isSelectedReportError) {
      toast.error(
        selectedReportError instanceof Error
          ? selectedReportError.message
          : "加载面试记录失败，请稍后重试。",
      );
    }
  }, [isSelectedReportError, selectedReportError]);

  const selectedResultReport: StudioInterviewConversationReport | null = shouldFetchSelectedReport
    ? (fetchedSelectedReport ?? (isSelectedReportError ? selectedResultReportFromList : null))
    : latestResultReport;

  const { data: candidateTimeline, isLoading: isTimelineLoading } = useQuery({
    enabled:
      enabled && !!effectiveRecordId && mode === "resume" && !isPublic && activeTab === "overview",
    queryFn: () =>
      isReview
        ? fetchStudioResumeReviewTimeline(slug, requireIdentifier(effectiveRecordId, "简历记录 ID"))
        : fetchStudioResumeTimeline(slug, requireIdentifier(effectiveRecordId, "简历记录 ID")),
    queryKey: ["studio-resumes", slug, "timeline", effectiveRecordId, accessMode] as const,
    refetchOnWindowFocus: true,
  });

  const isLoading =
    mode === "interview" ? isResolvingRoundId || isInterviewLoading : isResumeLoading;

  let record: UnifiedRecord | null = null;
  if (mode === "interview" && round) {
    record = toUnifiedRoundRecord(round);
  } else if (mode === "resume" && resumeRecord) {
    record = toUnifiedResumeRecord(resumeRecord);
  }

  const resumeInterviewResultRecord = resumeInterviewRound
    ? toUnifiedRoundRecord(resumeInterviewRound)
    : null;

  const isResumeInterviewResultLoading =
    isRoundsLoading ||
    (!!latestCandidateRoundId &&
      (isCandidateRoundReportsLoading ||
        isResumeInterviewRoundLoading ||
        isResumeInterviewFormSubmissionsLoading));

  return {
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
    reports,
    resultReports,
    resultRoundId,
    resumeInterviewFormSubmissions,
    resumeInterviewResultRecord,
    resumeRecord,
    round,
    selectedResultReport,
    shouldFetchSelectedReport,
  };
}
