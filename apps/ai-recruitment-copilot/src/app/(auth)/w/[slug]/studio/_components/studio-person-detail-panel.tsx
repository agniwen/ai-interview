"use client";

// 候选人详情视图的共享主体 —— 把数据获取、tab 切换、各 section 渲染抽离出来,
// 让弹窗版本 (StudioPersonDetailDialog) 和独立页面版本同时复用。调用方通过
// shell 自己决定 chrome:Modal、全屏页面布局,甚至嵌入式抽屉都行。
//
// Shared body for the candidate detail view. Owns data fetching, tab state,
// and section rendering so both the modal version (StudioPersonDetailDialog)
// and the full-page route version share one implementation. Callers control
// chrome via shell — Modal, full-page layout, or any custom frame.

import Markdown from "react-markdown";
import type { StudioInterviewRoundDetail } from "@/lib/shared/studio-interview-rounds";
import type { ResumeLibraryDetail } from "@/lib/shared/studio-resumes";
import { DIFFICULTY_LABEL } from "@/lib/shared/interview-question-difficulty";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
  deleteStudioInterviewFormSubmission,
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
  resetStudioInterviewRound,
  resolvePublicInterviewRecordId,
  resolveStudioInterviewRecordId,
  transitionInterviewRecord,
  updateStudioInterviewRound,
} from "@/lib/client/api";
import { useOptionalWorkspaceSlug } from "@/lib/client/workspace-context";
import {
  BotIcon,
  ExternalLinkIcon,
  EyeIcon,
  MessageSquareTextIcon,
  PencilIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useMemo, useReducer } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CandidateBasicInfoView } from "@/components/candidate-basic-info-view";
import { ResumeProfileView } from "@/components/resume-profile-view";
import { ResumeOverviewPanel } from "@/app/(auth)/w/[slug]/studio/resumes/_components/resume-overview-panel";
import { toast } from "sonner";
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/time-display";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AnimatedHeight } from "@/components/animated-height";
import { PdfPreviewButton } from "@/components/pdf-preview-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HumanInterviewStagePanel } from "./human-interview-stage-panel";
import { OfferStagePanel } from "./offer-stage-panel";
import { PipelineStageActionBar } from "./pipeline-stage-action-bar";
import {
  DetailBodySkeleton,
  DetailHeaderSkeleton,
  FormsSkeleton,
  ReportsSkeleton,
  RoundsSkeleton,
  SummaryMetric,
} from "./studio-person-detail-skeletons";
import { toAbsoluteUrl } from "@/lib/client/clipboard";
import { countDisplayInterviewTurns } from "@/lib/shared/interview-transcript-turns";
import { pipelineStageMeta, scheduleEntryStatusMeta } from "@arc/db-schema/studio-interviews";
import type { PipelineStage } from "@arc/db-schema/studio-interviews";
import { AgentInstructionsPanel } from "../interviews/_components/agent-instructions-panel";
import { RoundEmailAction } from "../interviews/_components/round-email/round-email-action";
import { useRoundEmailSummary } from "../interviews/_components/round-email/use-round-email-summary";
import { InterviewLinkQrButton } from "../interviews/_components/interview-link-qr-button";
import { ConversationTranscript } from "../interviews/_components/interview-detail/conversation-transcript";
import { DetailRow } from "../interviews/_components/interview-detail/detail-row";
import { EvaluationResults } from "../interviews/_components/interview-detail/evaluation-results";
import type { EvidenceQuote } from "../interviews/_components/interview-detail/evaluation-results";
import { FormsTab } from "../interviews/_components/interview-detail/forms-tab";
import { InterviewMetricsPanel } from "../interviews/_components/interview-detail/interview-metrics-panel";
import {
  ensureArray,
  formatReportStatus,
  getReportBadgeVariant,
  resolveRecommendationVariant,
  truncateText,
} from "../interviews/_components/interview-detail/helpers";
import { RecordingPlayer } from "../interviews/_components/interview-detail/recording-player";

export type StudioPersonDetailMode = "interview" | "resume";

/**
 * 数据来源 + 是否可写。"authed" 走 `/api/w/:slug/studio/*` 既有路由族；
 * "public" 走 `/api/public/*`，所有写操作 UI 被隐藏。
 *
 * Data source + write capability.
 * "authed" routes through the existing workspace-scoped API; "public" hits
 * the slug-less `/api/public/*` mirrors and hides all write UI.
 */
export type StudioPersonDetailAccessMode = "authed" | "public";

export type StudioPersonDetailTab =
  | "overview"
  | "rounds"
  | "human-interview"
  | "offer"
  | "experience"
  | "reports"
  | "questions"
  | "transcript"
  | "forms";

// 真人复面 / Offer tab 的可见性：阶段已到达或经过时才显示，避免新候选人页面噪音。
// 关闭后仍显示（HR 想回看历史 / 重新激活时直接点）。
// Human-interview tab is visible once the candidate has reached or passed that
// stage; remains visible after close for HR audit and reactivation.
function shouldShowHumanInterviewTab(record: { pipelineStage?: string } | null): boolean {
  if (!record?.pipelineStage) {
    return false;
  }
  return ["human_interview", "offer", "closed"].includes(record.pipelineStage);
}

function shouldShowOfferTab(record: { pipelineStage?: string } | null): boolean {
  if (!record?.pipelineStage) {
    return false;
  }
  return ["offer", "closed"].includes(record.pipelineStage);
}

/**
 * shell 接收的可填槽位。footer 仅简历模式有值 ——
 * 面试模式的「编辑候选人信息」按钮是嵌在概览 tab 内部的,不走 footer。
 *
 * Slots passed to shell. footer is only populated in resume mode —
 * the interview-mode "edit candidate" button is embedded inside the overview
 * tab and does not flow through this slot.
 */
export interface StudioPersonDetailSlots {
  title: ReactNode;
  description: ReactNode;
  headerExtra: ReactNode;
  body: ReactNode;
  footer: ReactNode;
}

function renderHeaderDescription({
  isLoading,
  round,
}: {
  isLoading: boolean;
  round: StudioInterviewRoundDetail | null | undefined;
}) {
  if (round) {
    return (
      <>
        {round.candidate.targetRole ?? "待识别岗位"}
        {" · "}
        {round.candidate.resumeFileName ?? "未上传简历"}
      </>
    );
  }
  return isLoading ? "正在加载候选人详情..." : "暂无可展示的候选人详情。";
}

interface EvaluationSummary {
  overallScore: number | null;
  recommendation: string | null;
  overallAssessment: string | null;
}

function getEvaluationSummary(data: Record<string, unknown> | null | undefined): EvaluationSummary {
  if (!data) {
    return {
      overallAssessment: null,
      overallScore: null,
      recommendation: null,
    };
  }

  return {
    overallAssessment: typeof data.overallAssessment === "string" ? data.overallAssessment : null,
    overallScore: typeof data.overallScore === "number" ? data.overallScore : null,
    recommendation: typeof data.recommendation === "string" ? data.recommendation : null,
  };
}

function compactText(value: string | null | undefined, fallback: string, limit = 420) {
  if (!value?.trim()) {
    return fallback;
  }
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function resolveDisplayTurnStats(
  report: { agentTurnCount: number; turnCount: number; userTurnCount: number },
  stats: ReturnType<typeof countDisplayInterviewTurns> | undefined,
) {
  return {
    displayAgentTurnCount: stats?.agentTurnCount ?? report.agentTurnCount,
    displayTurnCount: stats?.turnCount ?? report.turnCount,
    displayUserTurnCount: stats?.userTurnCount ?? report.userTurnCount,
  };
}

async function resetInterviewFormSubmission({
  effectiveRoundId,
  queryClient,
  slug,
  submissionId,
}: {
  effectiveRoundId: string;
  queryClient: QueryClient;
  slug: string;
  submissionId: string;
}): Promise<string | null> {
  try {
    await deleteStudioInterviewFormSubmission(slug, effectiveRoundId, submissionId);
    await queryClient.invalidateQueries({
      queryKey: ["studio-interview-round-form-submissions", slug, effectiveRoundId],
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "重置失败";
  }
}

async function updateAllowTextInput({
  effectiveRoundId,
  next,
  queryClient,
  slug,
  targetRoundId,
}: {
  effectiveRoundId: string | null;
  next: boolean;
  queryClient: QueryClient;
  slug: string;
  targetRoundId: string;
}): Promise<string | null> {
  try {
    await updateStudioInterviewRound(slug, targetRoundId, { allowTextInput: next });
    await queryClient.invalidateQueries({
      queryKey: ["studio-interview-round", slug, effectiveRoundId],
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "更新失败";
  }
}

async function resetInterviewRound({
  effectiveRoundId,
  queryClient,
  slug,
  targetRoundId,
}: {
  effectiveRoundId: string | null;
  queryClient: QueryClient;
  slug: string;
  targetRoundId: string;
}): Promise<string | null> {
  try {
    await resetStudioInterviewRound(slug, targetRoundId);
    await queryClient.invalidateQueries({
      queryKey: ["studio-interview-round", slug, effectiveRoundId],
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "重置失败";
  }
}

async function advancePipelineStage({
  queryClient,
  recordId,
  slug,
  target,
}: {
  queryClient: QueryClient;
  recordId: string;
  slug: string;
  target: PipelineStage;
}): Promise<string | null> {
  try {
    await transitionInterviewRecord(slug, recordId, { pipelineStage: target });
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["studio-resumes"] }),
      queryClient.invalidateQueries({
        queryKey: ["studio-resumes", slug, "detail", recordId],
      }),
    ]);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "推进失败";
  }
}

interface SelectedEvidenceState {
  conversationId: string;
  timeInCallSecs: number | null;
  turnIndex: number | null;
}

interface DetailPanelUiState {
  pendingResetSubmissionId: string | null;
  resettingRoundId: string | null;
  resettingSubmissionId: string | null;
  selectedEvidence: SelectedEvidenceState | null;
  updatingRoundId: string | null;
}

type DetailPanelUiAction =
  | { id: string | null; type: "pendingResetSubmissionChanged" }
  | { id: string | null; type: "resettingRoundChanged" }
  | { id: string | null; type: "resettingSubmissionChanged" }
  | { evidence: SelectedEvidenceState | null; type: "selectedEvidenceChanged" }
  | { id: string | null; type: "updatingRoundChanged" };

const initialDetailPanelUiState: DetailPanelUiState = {
  pendingResetSubmissionId: null,
  resettingRoundId: null,
  resettingSubmissionId: null,
  selectedEvidence: null,
  updatingRoundId: null,
};

function detailPanelUiReducer(
  state: DetailPanelUiState,
  action: DetailPanelUiAction,
): DetailPanelUiState {
  switch (action.type) {
    case "pendingResetSubmissionChanged": {
      return { ...state, pendingResetSubmissionId: action.id };
    }
    case "resettingRoundChanged": {
      return { ...state, resettingRoundId: action.id };
    }
    case "resettingSubmissionChanged": {
      return { ...state, resettingSubmissionId: action.id };
    }
    case "selectedEvidenceChanged": {
      return { ...state, selectedEvidence: action.evidence };
    }
    case "updatingRoundChanged": {
      return { ...state, updatingRoundId: action.id };
    }
    default: {
      return state;
    }
  }
}

// oxlint-disable-next-line complexity -- Panel orchestrates many conditional sections driven by record state and mode; flattening adds noise.
function useStudioPersonDetailPanel({
  recordId,
  roundId,
  mode,
  enabled = true,
  defaultTab,
  accessMode = "authed",
  onUpdated,
  onEdit,
  onLaunchInterview,
  onViewRoundDetail,
  onClose,
  onRequestClose,
  onRequestReactivate,
  shell,
}: {
  /**
   * 候选人级 id (studio_interview.id)。简历模式必传;面试模式作为兜底入口,
   * 通过 resolve 接口换出最新一轮 roundId 后再走 round-keyed 查询。
   *
   * Candidate-level id (studio_interview.id). Required in resume mode and
   * accepted in interview mode as a fallback — it is resolved to the latest
   * roundId before any round-keyed query fires.
   */
  recordId?: string | null;
  /**
   * 轮次级 id (studio_interview_schedule.id)。面试模式优先使用;
   * 简历模式忽略。
   *
   * Round-level id (studio_interview_schedule.id). Preferred in interview
   * mode; ignored in resume mode.
   */
  roundId?: string | null;
  mode: StudioPersonDetailMode;
  /**
   * 控制内部 react-query 是否启用。弹窗版本传 open;独立页面默认 true。
   * Gates internal react-query. The modal wrapper passes `open`; the page route uses the default.
   */
  enabled?: boolean;
  defaultTab?: StudioPersonDetailTab;
  /**
   * 是否走公开访问数据源 + 隐藏所有写 UI。默认 "authed"。
   * Whether to use the public data source and hide all write UI. Defaults to "authed".
   */
  accessMode?: StudioPersonDetailAccessMode;
  /** 轮次级写操作（toggle / reset）成功后调用。/ Called after a round-level write (toggle / reset). */
  onUpdated?: () => void;
  onEdit?: (recordId: string) => void;
  /**
   * 简历模式下点「发起 AI 面试」时调用；提供后改为 in-place 弹出
   * LaunchInterviewDialog，不再 router.push 到 /studio/interviews。
   *
   * Resume-mode "launch AI interview" callback. When provided, the button
   * delegates to the caller's LaunchInterviewDialog instead of routing.
   */
  onLaunchInterview?: (input: { id: string; candidateName: string | null }) => void;
  /**
   * 中文：在 resume 模式的「AI 面试轮次」tab 里点单条轮次的「查看详情」时触发。
   * 调用方应自己关闭本面板并以 mode="interview" 重新打开。
   * English: Fired from the per-round 查看详情 button inside the resume-mode
   * "AI 面试轮次" tab. The caller should close this panel and re-open it in
   * mode="interview" using the given roundId.
   */
  onViewRoundDetail?: (roundId: string) => void;
  /**
   * 调用方关闭面板的入口。弹窗版本接 onOpenChange(false);页面版本可不传。
   * Caller-side close hook. The modal wrapper passes onOpenChange(false);
   * the page route can omit it.
   */
  onClose?: () => void;
  /**
   * 简历模式 action bar 点「标记结案」时触发，调用方负责弹结案 dialog。
   * Fired from the resume-mode action bar's 「标记结案」 button.
   */
  onRequestClose?: (input: {
    id: string;
    candidateName: string | null;
    initialOutcome?: "hired" | "rejected" | "withdrawn" | "archived";
  }) => void;
  /**
   * 简历模式 action bar 点「重新激活」时触发（仅 pipelineStage=closed 时显示）。
   * Fired from the resume-mode action bar's 「重新激活」 button.
   */
  onRequestReactivate?: (input: { id: string; candidateName: string | null }) => void;
  shell: (slots: StudioPersonDetailSlots) => ReactNode;
}) {
  const optionalSlug = useOptionalWorkspaceSlug();
  const isPublic = accessMode === "public";
  // 公开模式下故意不依赖 slug；authed 模式下我们仍要求 workspace 上下文。
  // Public mode is slug-agnostic by design; authed mode still needs the workspace ctx.
  if (!isPublic && !optionalSlug) {
    throw new Error(
      'StudioPersonDetailPanel(accessMode="authed") must run under a /w/[slug] route',
    );
  }
  // 仅 authed 路径下使用 slug；以变量形式保留，方便下文 string-only 接口拼接。
  // Slug is only consumed on the authed path; declare as string for downstream callers.
  const slug = optionalSlug ?? "";
  const [uiState, dispatchUi] = useReducer(detailPanelUiReducer, initialDetailPanelUiState);
  const {
    pendingResetSubmissionId,
    resettingRoundId,
    resettingSubmissionId,
    selectedEvidence,
    updatingRoundId,
  } = uiState;
  const queryClient = useQueryClient();
  const { push } = useRouter();

  // 面试模式需要 roundId 来驱动 round-keyed 查询。优先用显式传入的 roundId,
  // 缺失时走 resolver 把 recordId(候选人级) 换成最新一轮的 roundId ——
  // resolver 端会同时尝试 roundId / recordId 两种入参,所以不论调用方传哪种 id
  // 都能落地到同一份数据。
  //
  // Interview mode needs a roundId for the round-keyed queries below. Prefer
  // the explicit roundId prop; when only recordId is provided, hit the
  // resolver endpoint (which tries the id as both roundId and recordId) to
  // get the latest round for that candidate.
  const needsResolve = mode === "interview" && !roundId && !!recordId;
  const { data: resolvedRoundId, isLoading: isResolvingRoundId } = useQuery({
    enabled: enabled && needsResolve,
    queryFn: () =>
      isPublic
        ? resolvePublicInterviewRecordId(recordId as string)
        : resolveStudioInterviewRecordId(slug, recordId as string),
    queryKey: ["studio-interview-resolve", slug, recordId, accessMode],
  });

  // 当前生效的 roundId / recordId —— 后续所有查询、删除、播放器路径都基于
  // 这两个变量,而不是 props 原值。
  // Effective ids used by every downstream query / mutation / URL builder.
  const effectiveRoundId = mode === "interview" ? (roundId ?? resolvedRoundId ?? null) : null;
  const effectiveRecordId = mode === "resume" ? (recordId ?? null) : null;

  // 面试模式查询（`:id` = roundId）/ Interview-mode query (`:id` = roundId)
  const { data: round, isLoading: isInterviewLoading } = useQuery({
    enabled: enabled && !!effectiveRoundId && mode === "interview",
    queryFn: () =>
      isPublic
        ? fetchPublicInterviewRound(effectiveRoundId as string)
        : fetchStudioInterviewRound(slug, effectiveRoundId as string),
    queryKey: ["studio-interview-round", slug, effectiveRoundId, accessMode],
    refetchOnWindowFocus: true,
  });

  // 简历库模式查询 / Resume-mode record query
  const { data: resumeRecord, isLoading: isResumeLoading } = useQuery({
    enabled: enabled && !!effectiveRecordId && mode === "resume",
    queryFn: () =>
      isPublic
        ? fetchPublicResume(effectiveRecordId as string)
        : fetchStudioResume(slug, effectiveRecordId as string),
    queryKey: ["studio-resumes", slug, "detail", effectiveRecordId, accessMode] as const,
    staleTime: 30 * 1000,
  });

  // 面试报告与表单仅面试模式查询 / Reports and form submissions only in interview mode
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

  // 简历模式：拉取该候选人的所有 AI 面试轮次，用于「AI 面试」tab。
  // Resume-mode: list this candidate's AI interview rounds for the "AI 面试" tab.
  const { data: candidateRounds = [], isLoading: isRoundsLoading } = useQuery({
    enabled: enabled && !!effectiveRecordId && mode === "resume",
    queryFn: () =>
      isPublic
        ? fetchPublicResumeRounds(effectiveRecordId as string)
        : fetchStudioResumeRounds(slug, effectiveRecordId as string),
    queryKey: ["studio-resume-rounds", slug, effectiveRecordId, accessMode] as const,
    refetchOnWindowFocus: true,
  });

  // 中文：当前轮次的邮件发送摘要 — 用于轮次概览里发送按钮显示发送次数与最后一次时间。
  // 仅在 interview 模式且有 roundId 时启用。
  // English: Email-send summary for the current round, powering the "send"
  // button's count + last-sent timestamp in the round overview. Only fires
  // in interview mode when a roundId is present.
  const roundEmailSummaryRoundIds = mode === "interview" && round?.id ? [round.id] : [];
  const roundEmailSummaryQuery = useRoundEmailSummary(slug, roundEmailSummaryRoundIds);
  const roundEmailSummary = round?.id ? roundEmailSummaryQuery.data?.[round.id] : undefined;

  const isLoading =
    mode === "interview" ? isResolvingRoundId || isInterviewLoading : isResumeLoading;

  // 统一的 record 视图：面试模式取 round，简历模式取 resumeRecord。
  // Unified record view: interview mode uses round, resume mode uses resumeRecord.
  interface UnifiedRecord {
    // candidateId（编辑跳转 / resume-mode id）
    id: string;
    candidateName: string;
    candidateEmail: string | null;
    candidatePhone: string | null;
    targetRole: string | null;
    jobDescriptionName: string | null;
    resumeFileName: string | null;
    resumeProfile: ResumeLibraryDetail["resumeProfile"];
    notes: string | null;
    hasResumeFile: boolean;
    creatorName: string | null;
    resumeStorageKey?: string | null;
    interviewQuestions?: StudioInterviewRoundDetail["candidate"]["interviewQuestions"];
    // pipeline 维度（resume 模式可用；interview 模式没有，留 undefined）
    // Pipeline axes (populated in resume mode; absent in interview mode).
    pipelineStage?: ResumeLibraryDetail["pipelineStage"];
    outcome?: ResumeLibraryDetail["outcome"];

    // 面试模式轮次字段 / Interview-mode round fields
    roundId?: string;
    roundLabel?: string;
    roundScheduledAt?: string | null;
    roundStatus?: StudioInterviewRoundDetail["status"];
    roundInterviewLink?: string;
    roundAllowTextInput?: boolean;
    roundHasReport?: boolean;
  }

  let record: UnifiedRecord | null = null;
  if (mode === "interview" && round) {
    record = {
      candidateEmail: round.candidate.candidateEmail,
      candidateName: round.candidate.candidateName,
      candidatePhone: round.candidate.candidatePhone,
      creatorName: round.candidate.creatorName,
      hasResumeFile: Boolean(round.candidate.resumeStorageKey),
      // id = candidateId，用于「编辑候选人信息」跳转和简历 URL。
      // id = candidateId, used for the "edit candidate" deep-link and resume URL.
      id: round.candidate.id,
      interviewQuestions: round.candidate.interviewQuestions,
      jobDescriptionName: round.candidate.jobDescriptionName,
      notes: round.candidate.notes,
      // 透传 pipeline 轴，让面试模式也能感知 AI 阶段锁。
      // Forward pipeline axes so interview mode honors the AI-stage lock.
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
      roundStatus: round.status,
      targetRole: round.candidate.targetRole,
    };
  } else if (mode === "resume" && resumeRecord) {
    record = {
      candidateEmail: resumeRecord.candidateEmail,
      candidateName: resumeRecord.candidateName,
      candidatePhone: resumeRecord.candidatePhone,
      creatorName: resumeRecord.creatorName,
      hasResumeFile: resumeRecord.hasResumeFile,
      id: resumeRecord.id,
      interviewQuestions: resumeRecord.interviewQuestions,
      jobDescriptionName: resumeRecord.jobDescriptionName,
      notes: resumeRecord.notes,
      outcome: resumeRecord.outcome,
      pipelineStage: resumeRecord.pipelineStage,
      resumeFileName: resumeRecord.resumeFileName,
      resumeProfile: resumeRecord.resumeProfile,
      targetRole: resumeRecord.targetRole,
    };
  }

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

  // 切换「允许文本输入」开关。Toggle the allowTextInput flag for a round.
  async function handleToggleAllowTextInput(targetRoundId: string, next: boolean) {
    if (updatingRoundId) {
      return;
    }
    dispatchUi({ id: targetRoundId, type: "updatingRoundChanged" });
    const error = await updateAllowTextInput({
      effectiveRoundId,
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

  // 重置轮次为「待开始」状态。Reset a round back to pending.
  async function handleResetRound(targetRoundId: string) {
    if (resettingRoundId) {
      return;
    }
    dispatchUi({ id: targetRoundId, type: "resettingRoundChanged" });
    const error = await resetInterviewRound({
      effectiveRoundId,
      queryClient,
      slug,
      targetRoundId,
    });
    if (error) {
      toast.error(error);
    } else {
      toast.success("轮次已重置为待开始");
      onUpdated?.();
    }
    dispatchUi({ id: null, type: "resettingRoundChanged" });
  }

  // AI 面试阶段锁：候选人推进到真人复面/Offer/已结案后，AI 轮次相关写操作全部禁用。
  // AI-stage lock: once the candidate moves past ai_interview, all AI round write actions are disabled.
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
  const isRoundCompleted = record?.roundStatus === "completed";
  const isRoundLive =
    record?.roundStatus === "in_progress" || record?.roundStatus === "interrupted";
  const roundActionLockedReason = isRoundLive ? "面试正在进行中，结束后才能发送或复制链接。" : null;
  const roundActionDisabledReason = roundActionLockedReason ?? aiStageLockedReason;

  // 简历模式底部双按钮：两个按钮各占一半宽度。
  // 已存在 AI 面试轮次的简历隐藏「发起 AI 面试」按钮，避免重复创建；
  // 编辑按钮以 flex-1 自动撑满剩余空间。轮次列表加载中也先隐藏，避免闪烁。
  //
  // Resume-mode footer: two buttons sharing flex space. Hide the launch
  // button once the resume has any rounds (to prevent dup-creates) — the edit
  // button stays flex-1 and naturally expands. Suppressed during rounds-load
  // to avoid a flash-then-hide.
  const showLaunchButton = mode === "resume" && !isRoundsLoading && candidateRounds.length === 0;
  const resumeModeFooter = record ? (
    <div className="flex w-full gap-2">
      <Button
        className="flex-1"
        onClick={() => {
          if (onEdit) {
            onEdit(record.id);
          }
        }}
        type="button"
        variant="outline"
      >
        <PencilIcon className="size-4" />
        编辑
      </Button>
      {showLaunchButton ? (
        <Button
          className="flex-1"
          onClick={() => {
            if (onLaunchInterview) {
              // 简历库详情入口：交给外层 LaunchInterviewDialog 处理；关闭本面板
              // 让 modal 切换显得自然。
              // Resume-library entry: hand off to the parent LaunchInterviewDialog
              // and close this panel so the swap reads naturally.
              onLaunchInterview({
                candidateName: record.candidateName ?? null,
                id: record.id,
              });
              onClose?.();
              return;
            }
            push(`/w/${slug}/studio/interviews`);
            onClose?.();
          }}
          type="button"
        >
          <BotIcon className="size-4" />
          发起 AI 面试
          {onLaunchInterview ? null : <ExternalLinkIcon className="size-3.5 opacity-70" />}
        </Button>
      ) : null}
    </div>
  ) : null;

  const title =
    mode === "resume" ? (
      "候选人详情"
    ) : (
      <span className="flex flex-wrap items-center gap-3">
        <span className="break-words">{record?.candidateName ?? "候选人详情"}</span>
        {record?.roundStatus ? (
          <Badge variant={scheduleEntryStatusMeta[record.roundStatus].tone}>
            {scheduleEntryStatusMeta[record.roundStatus].label}
          </Badge>
        ) : null}
      </span>
    );

  const description =
    mode === "resume"
      ? "查看候选人基础信息与结构化简历。"
      : renderHeaderDescription({ isLoading, round });
  const resumePreviewUrl = (() => {
    if (!record?.hasResumeFile) {
      return "";
    }
    if (isPublic) {
      return `/api/public/interview-rounds/${record.roundId ?? record.id}/resume`;
    }
    const previewRecordId = mode === "interview" ? (record.roundId ?? record.id) : record.id;
    return `/api/w/${slug}/studio/${mode === "resume" ? "resumes" : "interviews"}/${previewRecordId}/resume`;
  })();

  // resume 模式下且非公开访问时，渲染全局流程条；它描述候选人整体状态，
  // 所以放在所有 tab 内容之上，而不是某个 tab 内容里。
  // Action bar shows only on the authed resume-mode view. It is candidate-wide
  // state, so it lives above all tab content rather than inside a tab panel.
  const actionBar =
    mode === "resume" && record && !isPublic && record.pipelineStage && record.outcome ? (
      <PipelineStageActionBar
        aiInterviewDone={Boolean(
          resumeRecord?.stageProgress.aiInterview &&
          resumeRecord.stageProgress.aiInterview.totalRounds > 0 &&
          resumeRecord.stageProgress.aiInterview.activeRound === null,
        )}
        humanInterviewDone={Boolean(
          resumeRecord?.stageProgress.humanInterview &&
          resumeRecord.stageProgress.humanInterview.totalRounds > 0 &&
          resumeRecord.stageProgress.humanInterview.activeRound === null,
        )}
        onAdvance={(target) => {
          // 行内推进（不带元数据）：直接调 transition API，刷新缓存。
          // Inline advance: call transition + invalidate so the bar/tabs update.
          void (async () => {
            const error = await advancePipelineStage({
              queryClient,
              recordId: record.id,
              slug,
              target,
            });
            if (error) {
              toast.error(error);
            } else {
              toast.success(`已推进到「${pipelineStageMeta[target].label}」`);
              onUpdated?.();
            }
          })();
        }}
        onRequestClose={() =>
          onRequestClose?.({ candidateName: record.candidateName, id: record.id })
        }
        onRequestReactivate={() =>
          onRequestReactivate?.({ candidateName: record.candidateName, id: record.id })
        }
        outcome={record.outcome}
        pipelineStage={record.pipelineStage}
      />
    ) : null;

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
            <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="rounds">
              AI 面试
            </TabsTrigger>
          ) : null}
          {/* 真人复面 / Offer tab：阶段已到达或经过时才显示，避免新候选人页面过于喧闹。
            Human interview / Offer tabs surface only once the candidate has reached that stage. */}
          {mode === "resume" && shouldShowHumanInterviewTab(record) ? (
            <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="human-interview">
              真人复面
            </TabsTrigger>
          ) : null}
          {mode === "resume" && shouldShowOfferTab(record) ? (
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
        <PdfPreviewButton
          className="w-full sm:w-auto"
          disabled={!record.hasResumeFile}
          filename={record.resumeFileName ?? undefined}
          label="预览简历"
          url={resumePreviewUrl}
        />
      </div>
    );
  }

  // oxlint-disable-next-line no-nested-ternary -- Splitting this tri-state body into a helper balloons JSX context; keeping inline.
  const body = isLoading ? (
    <DetailBodySkeleton mode={mode} />
  ) : // oxlint-disable-next-line no-nested-ternary -- Secondary branch renders based on record presence.
  record ? (
    <div className="flex flex-col gap-5">
      {actionBar}
      <AnimatedHeight>
        <TabsContent value="overview">
          <div className="space-y-6">
            {/* 简历模式：复用 ResumeOverviewPanel —— 与「发起 AI 面试」
              弹窗的概览 tab 同一布局，后续要扩字段也只改一处。
              Resume mode: defer to ResumeOverviewPanel so the
              launch-interview dialog and this view stay in sync. */}
            {mode === "resume" && resumeRecord ? (
              <ResumeOverviewPanel detail={resumeRecord} />
            ) : (
              <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                <div className="h-full rounded-2xl border border-border/60 bg-background p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-medium text-sm">面试结果</h3>
                    <Badge
                      variant={
                        latestReport ? getReportBadgeVariant(latestReport.status) : "outline"
                      }
                    >
                      {latestReport ? formatReportStatus(latestReport.status) : "暂无报告"}
                    </Badge>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <SummaryMetric
                      label="评分"
                      value={
                        latestEvaluationSummary.overallScore === null
                          ? "—"
                          : `${latestEvaluationSummary.overallScore} / 100`
                      }
                    />
                    <SummaryMetric
                      label="建议"
                      value={
                        latestEvaluationSummary.recommendation ? (
                          <Badge
                            variant={resolveRecommendationVariant(
                              latestEvaluationSummary.recommendation,
                            )}
                          >
                            {latestEvaluationSummary.recommendation}
                          </Badge>
                        ) : (
                          "待生成"
                        )
                      }
                    />
                    <SummaryMetric
                      label="对话"
                      value={
                        latestReport
                          ? `${latestReport.userTurnCount} 次候选人回复`
                          : "候选人完成后生成"
                      }
                    />
                  </div>
                  <div className="mt-4 text-muted-foreground text-sm leading-normal">
                    <Markdown>
                      {compactText(
                        latestEvaluationSummary.overallAssessment ??
                          latestReport?.transcriptSummary ??
                          null,
                        "候选人完成面试后，这里会优先显示结论、评分和关键摘要。",
                      )}
                    </Markdown>
                  </div>
                </div>

                <div className="h-full rounded-2xl border border-border/60 bg-background p-5">
                  <h3 className="font-medium text-sm">候选人信息</h3>
                  <div className="mt-4">
                    <CandidateBasicInfoView
                      candidateEmail={record.candidateEmail}
                      candidateName={record.candidateName}
                      candidatePhone={record.candidatePhone}
                      creatorName={record.creatorName}
                      hasResumeFile={record.hasResumeFile}
                      jobDescriptionName={record.jobDescriptionName}
                      resumeFileName={record.resumeFileName}
                      targetRole={record.targetRole}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* 轮次概览（面试模式专属）/ Round overview (interview mode only) */}
            {mode === "interview" && record.roundId ? (
              <div className="rounded-2xl border border-border/60 bg-background p-5">
                <h3 className="font-medium text-sm">轮次概览</h3>
                {isAiStageLocked ? (
                  <p className="mt-2 rounded-md border border-border/50 bg-muted/40 px-3 py-2 text-muted-foreground text-xs leading-normal">
                    {aiStageLockedReason}
                  </p>
                ) : null}
                <div className="mt-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{record.roundLabel}</span>
                      {record.roundStatus ? (
                        <Badge variant={scheduleEntryStatusMeta[record.roundStatus].tone}>
                          {scheduleEntryStatusMeta[record.roundStatus].label}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      {record.roundScheduledAt ? (
                        <TimeDisplay
                          className="shrink-0 text-muted-foreground text-xs"
                          options={DATE_TIME_DISPLAY_OPTIONS}
                          value={record.roundScheduledAt}
                        />
                      ) : (
                        <span className="text-muted-foreground text-xs">未排期</span>
                      )}
                      {record.roundId && !isPublic && !isRoundCompleted ? (
                        <RoundEmailAction
                          candidateEmail={record.candidateEmail}
                          lockedReason={roundActionDisabledReason}
                          roundId={record.roundId}
                          slug={slug}
                          summary={roundEmailSummary}
                        />
                      ) : null}
                      {record.roundInterviewLink && !isPublic && !isRoundCompleted ? (
                        <InterviewLinkQrButton
                          candidateName={record.candidateName}
                          disabled={Boolean(roundActionDisabledReason)}
                          url={toAbsoluteUrl(record.roundInterviewLink as string)}
                        />
                      ) : null}
                    </div>
                  </div>
                  {isPublic ? null : (
                    <div className="flex items-center justify-between gap-3 rounded-lg border border-border/50 bg-background/80 px-3 py-2">
                      <div className="min-w-0">
                        {/* 允许面试者文本输入 / Allow candidate text input */}
                        <p className="font-medium text-sm">允许面试者文本输入</p>
                        <p className="mt-0.5 text-muted-foreground text-xs">
                          关闭时面试界面文字输入框被禁用，仅支持语音作答。
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Switch
                          checked={record.roundAllowTextInput ?? false}
                          disabled={
                            record.roundStatus === "completed" || updatingRoundId === record.roundId
                          }
                          onCheckedChange={(next) =>
                            void handleToggleAllowTextInput(record.roundId as string, next)
                          }
                        />
                        {record.roundStatus === "completed" ? (
                          <Button
                            disabled={resettingRoundId === record.roundId || isAiStageLocked}
                            onClick={() => void handleResetRound(record.roundId as string)}
                            size="sm"
                            title={aiStageLockedReason ?? undefined}
                            type="button"
                            variant="outline"
                          >
                            <RotateCcwIcon className="size-3.5" />
                            {resettingRoundId === record.roundId ? "重置中..." : "重置轮次"}
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : null}

            {mode === "interview" ? (
              <div className="rounded-2xl border border-border/60 bg-background p-5">
                <h3 className="font-medium text-sm">简历评价</h3>
                <div className="mt-3 text-muted-foreground text-sm leading-normal">
                  <Markdown>{truncateText(record.notes) || "暂无简历评价"}</Markdown>
                </div>
              </div>
            ) : null}
          </div>
        </TabsContent>

        {mode === "interview" ? (
          <TabsContent value="reports">
            {isReportsLoading ? (
              <ReportsSkeleton />
            ) : (
              <div className="space-y-6">
                <div className="grid gap-4 md:grid-cols-4">
                  <div className="rounded-2xl border border-border/60 bg-background p-4">
                    {/* 本轮通话次数 / Call count for this round */}
                    <p className="text-muted-foreground text-xs">本轮通话次数</p>
                    <p className="mt-2 font-medium text-2xl text-primary tabular-nums">
                      {reports.length}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background p-4">
                    <p className="text-muted-foreground text-xs">已完成</p>
                    <p className="mt-2 font-medium text-2xl text-primary tabular-nums">
                      {reports.filter((report) => report.status === "done").length}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background p-4">
                    <p className="text-muted-foreground text-xs">失败</p>
                    <p className="mt-2 font-medium text-2xl text-primary tabular-nums">
                      {reports.filter((report) => report.status === "failed").length}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border/60 bg-background p-4">
                    <p className="text-muted-foreground text-xs">累计对话轮次</p>
                    <p className="mt-2 font-medium text-2xl text-primary tabular-nums">
                      {totalDisplayTurnCount}
                    </p>
                  </div>
                </div>

                {reports.length === 0 ? (
                  <div className="flex min-h-60 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/20 px-6 py-10 text-center">
                    <MessageSquareTextIcon className="size-8 text-muted-foreground" />
                    <p className="mt-4 font-medium text-sm">暂无面试报告</p>
                    <p className="mt-2 max-w-xl text-muted-foreground text-sm leading-normal">
                      候选人开始并结束语音面试后，这里会展示逐场面试的总结、状态和完整对话记录。
                    </p>
                  </div>
                ) : (
                  <Accordion
                    className="space-y-4"
                    defaultValue={[reports[0].conversationId]}
                    type="multiple"
                  >
                    {reports.map((report) => {
                      const startedAt = report.startedAt ?? report.createdAt;
                      const endedAt = report.endedAt ?? report.updatedAt;
                      const { displayAgentTurnCount, displayTurnCount, displayUserTurnCount } =
                        resolveDisplayTurnStats(
                          report,
                          reportTranscriptStats.get(report.conversationId),
                        );
                      const activeEvidence =
                        selectedEvidence?.conversationId === report.conversationId
                          ? selectedEvidence
                          : null;
                      const handleEvidenceSelect = (evidence: EvidenceQuote) => {
                        dispatchUi({
                          evidence: {
                            conversationId: report.conversationId,
                            timeInCallSecs: evidence.timeInCallSecs ?? null,
                            turnIndex: evidence.turnIndex ?? null,
                          },
                          type: "selectedEvidenceChanged",
                        });
                      };

                      return (
                        <AccordionItem
                          className="overflow-hidden rounded-2xl border border-border/60 bg-background px-0 last:border-b"
                          key={report.conversationId}
                          value={report.conversationId}
                        >
                          <AccordionTrigger className="px-5 py-4 hover:no-underline">
                            <div className="min-w-0 flex-1 text-left">
                              <div className="flex flex-wrap items-center gap-2">
                                <TimeDisplay
                                  className="font-medium text-sm"
                                  options={DATE_TIME_DISPLAY_OPTIONS}
                                  value={startedAt}
                                />
                                <Badge variant={getReportBadgeVariant(report.status)}>
                                  {formatReportStatus(report.status)}
                                </Badge>
                                {report.callSuccessful ? (
                                  <Badge variant="outline">{report.callSuccessful}</Badge>
                                ) : null}
                              </div>
                              <p className="mt-2 line-clamp-2 text-muted-foreground text-sm leading-normal">
                                {report.transcriptSummary ??
                                  report.latestError ??
                                  "暂无总结，等待后续同步。"}
                              </p>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent className="px-5 pb-5">
                            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(400px,1fr)]">
                              <div className="space-y-4">
                                <RecordingPlayer
                                  accessMode={accessMode}
                                  conversationId={report.conversationId}
                                  durationSecs={report.recordingDurationSecs}
                                  recordId={effectiveRoundId ?? ""}
                                  seekToSecs={activeEvidence?.timeInCallSecs ?? null}
                                  status={report.recordingStatus}
                                />
                                <div className="rounded-2xl border border-border/60 bg-background p-4">
                                  <h4 className="font-medium text-sm">会话概览</h4>
                                  <div className="mt-3 grid gap-2 text-sm">
                                    <DetailRow
                                      label="会话 ID"
                                      value={
                                        <span className="break-all">{report.conversationId}</span>
                                      }
                                    />
                                    <DetailRow
                                      label="开始时间"
                                      value={
                                        <TimeDisplay
                                          options={DATE_TIME_DISPLAY_OPTIONS}
                                          value={startedAt}
                                        />
                                      }
                                    />
                                    <DetailRow
                                      label="结束时间"
                                      value={
                                        <TimeDisplay
                                          options={DATE_TIME_DISPLAY_OPTIONS}
                                          value={endedAt}
                                        />
                                      }
                                    />
                                    <DetailRow
                                      label="消息统计"
                                      value={`共 ${displayTurnCount} 条 · 候选人 ${displayUserTurnCount} 条 · 面试官 ${displayAgentTurnCount} 条`}
                                    />
                                    <DetailRow
                                      label="同步时间"
                                      value={
                                        <TimeDisplay
                                          options={DATE_TIME_DISPLAY_OPTIONS}
                                          value={report.lastSyncedAt}
                                        />
                                      }
                                    />
                                    <DetailRow
                                      label="Webhook"
                                      value={
                                        report.webhookReceivedAt ? (
                                          <TimeDisplay
                                            options={DATE_TIME_DISPLAY_OPTIONS}
                                            value={report.webhookReceivedAt}
                                          />
                                        ) : (
                                          "未收到"
                                        )
                                      }
                                    />
                                  </div>
                                </div>

                                <div className="rounded-2xl border border-border/60 bg-background p-4">
                                  <h4 className="font-medium text-sm">最终总结</h4>
                                  <div className="mt-3 text-muted-foreground text-sm leading-normal">
                                    <Markdown>{report.transcriptSummary ?? "暂无总结。"}</Markdown>
                                  </div>
                                  {report.latestError ? (
                                    <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
                                      {report.latestError}
                                    </div>
                                  ) : null}
                                </div>
                              </div>

                              <div className="lg:relative">
                                <div className="flex h-[480px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-background lg:absolute lg:inset-0 lg:h-auto">
                                  <h4 className="shrink-0 px-4 pt-4 pb-2 font-medium text-sm">
                                    对话记录
                                  </h4>
                                  <ConversationTranscript
                                    activeTurnIndex={activeEvidence?.turnIndex ?? null}
                                    turns={report.turns}
                                  />
                                </div>
                              </div>

                              <div className="rounded-2xl border border-border/60 bg-background p-4">
                                <h4 className="font-medium text-sm">评估指标</h4>
                                <div className="mt-4 max-h-[420px] overflow-y-auto pr-1">
                                  <EvaluationResults
                                    data={
                                      (report.evaluationCriteriaResults as Record<
                                        string,
                                        unknown
                                      >) ?? {}
                                    }
                                    onEvidenceSelect={handleEvidenceSelect}
                                  />
                                </div>
                              </div>

                              <InterviewMetricsPanel metrics={report.metrics ?? {}} />
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                )}
              </div>
            )}
          </TabsContent>
        ) : null}

        {mode === "interview" ? (
          <TabsContent value="questions">
            <div className="rounded-2xl border border-border/60 bg-background p-4">
              <h3 className="font-medium text-sm">AI 面试题</h3>
              <div className="mt-4 space-y-3">
                {visibleInterviewQuestions.length > 0 ? (
                  visibleInterviewQuestions.map((question) => (
                    <div
                      className="rounded-xl border border-border/60 bg-muted/30 p-3"
                      key={question.order}
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                        <span className="font-medium text-sm">第{question.order} 题</span>
                        <span className="shrink-0 text-muted-foreground text-xs">
                          {DIFFICULTY_LABEL[question.difficulty] ?? question.difficulty}
                        </span>
                      </div>
                      <div className="mt-2 text-sm leading-normal">
                        <Markdown>{truncateText(question.question)}</Markdown>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-sm">
                    暂无面试题，可通过上传简历自动生成。
                  </p>
                )}
              </div>
            </div>
          </TabsContent>
        ) : null}

        {mode === "interview" ? (
          <TabsContent value="experience">
            <div className="rounded-2xl border border-border/60 bg-background p-5">
              <ResumeProfileView profile={record.resumeProfile ?? null} />
            </div>
          </TabsContent>
        ) : null}

        {mode === "resume" ? (
          <TabsContent value="rounds">
            <div className="rounded-2xl border border-border/60 bg-background p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium text-sm">AI 面试轮次</h3>
                <span className="text-muted-foreground text-xs">
                  共 {candidateRounds.length} 轮
                </span>
              </div>
              {isAiStageLocked ? (
                <p className="mt-3 rounded-md border border-border/50 bg-muted/40 px-3 py-2 text-muted-foreground text-xs leading-normal">
                  {aiStageLockedReason}
                </p>
              ) : null}
              {/* oxlint-disable-next-line no-nested-ternary -- 三态：loading / empty / list */}
              {isRoundsLoading ? (
                <RoundsSkeleton />
              ) : /* oxlint-disable-next-line no-nested-ternary -- Secondary branch renders empty-state or list. */
              candidateRounds.length === 0 ? (
                <p className="mt-4 text-muted-foreground text-sm leading-normal">
                  该候选人还没有发起面试。在简历库点「保存并发起面试」即可创建。
                </p>
              ) : (
                <div className="mt-4 space-y-3">
                  {candidateRounds.map((entry) => {
                    const statusMeta = scheduleEntryStatusMeta[entry.status];
                    const fullLink = toAbsoluteUrl(entry.interviewLink);
                    const isEntryLive =
                      entry.status === "in_progress" || entry.status === "interrupted";
                    const entryActionDisabledReason = isEntryLive
                      ? roundActionLockedReason
                      : aiStageLockedReason;
                    return (
                      <div
                        className="rounded-xl border border-border/60 bg-muted/30 p-3"
                        key={entry.id}
                      >
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="wrap-break-word font-medium text-sm">
                              {entry.roundLabel}
                            </span>
                            <Badge variant={statusMeta.tone}>{statusMeta.label}</Badge>
                            {entry.hasReport ? <Badge variant="outline">已有报告</Badge> : null}
                          </div>
                          {entry.scheduledAt ? (
                            <TimeDisplay
                              className="shrink-0 text-muted-foreground text-xs"
                              options={DATE_TIME_DISPLAY_OPTIONS}
                              value={entry.scheduledAt}
                            />
                          ) : (
                            <span className="text-muted-foreground text-xs">未排期</span>
                          )}
                        </div>
                        <div className="mt-3 rounded-lg border border-border/50 bg-background/80 px-3 py-2">
                          <p className="text-muted-foreground text-xs">完整面试链接</p>
                          <p className="mt-1 break-all font-mono text-xs leading-normal">
                            {fullLink}
                          </p>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                          {/* 中文：仅在调用方提供回调时显示「查看详情」；不提供时避免渲染无用按钮。
                            English: Only render 查看详情 when the caller supplies a callback; skip it otherwise. */}
                          {onViewRoundDetail ? (
                            <Button
                              className="flex-1 sm:flex-none"
                              onClick={() => onViewRoundDetail(entry.id)}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              <EyeIcon className="size-3.5" />
                              查看详情
                            </Button>
                          ) : null}
                          <InterviewLinkQrButton
                            candidateName={record.candidateName}
                            className="flex-1 sm:flex-none"
                            disabled={Boolean(entryActionDisabledReason)}
                            url={fullLink}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </TabsContent>
        ) : null}

        {mode === "resume" && shouldShowHumanInterviewTab(record) ? (
          <TabsContent value="human-interview">
            <HumanInterviewStagePanel
              candidateId={record.id}
              candidateName={record.candidateName}
              disabled={record.pipelineStage === "closed"}
            />
          </TabsContent>
        ) : null}

        {mode === "resume" && shouldShowOfferTab(record) ? (
          <TabsContent value="offer">
            <OfferStagePanel
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

        {mode === "interview" && !isPublic ? (
          <TabsContent value="instructions">
            <AgentInstructionsPanel enabled={enabled} recordId={effectiveRoundId} />
          </TabsContent>
        ) : null}

        {mode === "interview" ? (
          <TabsContent value="forms">
            {isFormSubmissionsLoading ? (
              <FormsSkeleton />
            ) : (
              <FormsTab
                onReset={
                  isPublic
                    ? undefined
                    : (submissionId) =>
                        dispatchUi({
                          id: submissionId,
                          type: "pendingResetSubmissionChanged",
                        })
                }
                resettingId={resettingSubmissionId}
                submissions={formSubmissions}
              />
            )}
          </TabsContent>
        ) : null}
      </AnimatedHeight>
    </div>
  ) : (
    <div className="flex min-h-[240px] items-center justify-center text-muted-foreground text-sm">
      暂无可展示的候选人详情。
    </div>
  );

  const footer = mode === "resume" ? resumeModeFooter : null;

  return (
    <>
      <Tabs
        defaultValue={defaultTab ?? "overview"}
        key={`${roundId ?? recordId ?? "empty"}-${defaultTab ?? "overview"}`}
      >
        {shell({ body, description, footer, headerExtra, title })}
      </Tabs>
      {mode === "interview" && !isPublic ? (
        <AlertDialog
          onOpenChange={(next) => {
            if (!next) {
              dispatchUi({ id: null, type: "pendingResetSubmissionChanged" });
            }
          }}
          open={pendingResetSubmissionId !== null}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>重置面试表单填写？</AlertDialogTitle>
              <AlertDialogDescription>
                候选人本份面试表单的答复将被删除，下次进入面试时需要重新填写。该操作不可撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={() => void confirmResetSubmission()}>
                确认重置
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </>
  );
}

export function StudioPersonDetailPanel(props: Parameters<typeof useStudioPersonDetailPanel>[0]) {
  return useStudioPersonDetailPanel(props);
}
