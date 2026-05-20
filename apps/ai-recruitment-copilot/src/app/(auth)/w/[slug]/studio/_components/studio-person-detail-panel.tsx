"use client";

// 候选人详情视图的共享主体 —— 把数据获取、tab 切换、各 section 渲染抽离出来,
// 让弹窗版本 (StudioPersonDetailDialog) 和独立页面版本同时复用。调用方通过
// renderShell 自己决定 chrome:Modal、全屏页面布局,甚至嵌入式抽屉都行。
//
// Shared body for the candidate detail view. Owns data fetching, tab state,
// and section rendering so both the modal version (StudioPersonDetailDialog)
// and the full-page route version share one implementation. Callers control
// chrome via renderShell — Modal, full-page layout, or any custom frame.

import Markdown from "react-markdown";
import type { StudioInterviewRoundDetail } from "@/lib/shared/studio-interview-rounds";
import type { ResumeLibraryDetail } from "@/lib/shared/studio-resumes";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteStudioInterviewFormSubmission,
  fetchStudioInterviewRound,
  fetchStudioInterviewRoundFormSubmissions,
  fetchStudioInterviewRoundReports,
  fetchStudioResume,
  fetchStudioResumeRounds,
  resetStudioInterviewRound,
  resolveStudioInterviewRecordId,
  updateStudioInterviewRound,
} from "@/lib/client/api";
import { useWorkspaceSlug } from "@/lib/client/workspace-context";
import {
  BotIcon,
  ExternalLinkIcon,
  EyeIcon,
  MessageSquareTextIcon,
  PencilIcon,
  RotateCcwIcon,
  Share2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";
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
import { copyTextToClipboard, toAbsoluteUrl } from "@/lib/client/clipboard";
import { scheduleEntryStatusMeta } from "@arc/db-schema/studio-interviews";
import { AgentInstructionsPanel } from "../interviews/_components/agent-instructions-panel";
import { RoundEmailAction } from "../interviews/_components/round-email/round-email-action";
import { useRoundEmailSummary } from "../interviews/_components/round-email/use-round-email-summary";
import { InterviewLinkQrButton } from "../interviews/_components/interview-link-qr-button";
import { ConversationTranscript } from "../interviews/_components/interview-detail/conversation-transcript";
import { DetailRow } from "../interviews/_components/interview-detail/detail-row";
import { EvaluationResults } from "../interviews/_components/interview-detail/evaluation-results";
import { FormsTab } from "../interviews/_components/interview-detail/forms-tab";
import { InterviewMetricsPanel } from "../interviews/_components/interview-detail/interview-metrics-panel";
import {
  ensureArray,
  formatReportStatus,
  getReportBadgeVariant,
  truncateText,
} from "../interviews/_components/interview-detail/helpers";
import { RecordingPlayer } from "../interviews/_components/interview-detail/recording-player";

export type StudioPersonDetailMode = "interview" | "resume";

export type StudioPersonDetailTab =
  | "overview"
  | "rounds"
  | "experience"
  | "reports"
  | "questions"
  | "transcript"
  | "forms";

/**
 * renderShell 接收的可填槽位。footer 仅简历模式有值 ——
 * 面试模式的「编辑候选人信息」按钮是嵌在概览 tab 内部的,不走 footer。
 *
 * Slots passed to renderShell. footer is only populated in resume mode —
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

// oxlint-disable-next-line complexity -- Panel orchestrates many conditional sections driven by record state and mode; flattening adds noise.
export function StudioPersonDetailPanel({
  recordId,
  roundId,
  mode,
  enabled = true,
  defaultTab,
  onUpdated,
  onEdit,
  onLaunchInterview,
  onViewRoundDetail,
  onClose,
  renderShell,
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
  renderShell: (slots: StudioPersonDetailSlots) => ReactNode;
}) {
  const slug = useWorkspaceSlug();
  const [resettingSubmissionId, setResettingSubmissionId] = useState<string | null>(null);
  const [pendingResetSubmissionId, setPendingResetSubmissionId] = useState<string | null>(null);
  const [resettingRoundId, setResettingRoundId] = useState<string | null>(null);
  const [updatingRoundId, setUpdatingRoundId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

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
    queryFn: () => resolveStudioInterviewRecordId(slug, recordId as string),
    queryKey: ["studio-interview-resolve", slug, recordId],
  });

  // 当前生效的 roundId / recordId —— 后续所有查询、删除、播放器路径都基于
  // 这两个变量,而不是 props 原值。
  // Effective ids used by every downstream query / mutation / URL builder.
  const effectiveRoundId = mode === "interview" ? (roundId ?? resolvedRoundId ?? null) : null;
  const effectiveRecordId = mode === "resume" ? (recordId ?? null) : null;

  // 面试模式查询（`:id` = roundId）/ Interview-mode query (`:id` = roundId)
  const { data: round, isLoading: isInterviewLoading } = useQuery({
    enabled: enabled && !!effectiveRoundId && mode === "interview",
    queryFn: () => fetchStudioInterviewRound(slug, effectiveRoundId as string),
    queryKey: ["studio-interview-round", slug, effectiveRoundId],
    refetchOnWindowFocus: true,
  });

  // 简历库模式查询 / Resume-mode record query
  const { data: resumeRecord, isLoading: isResumeLoading } = useQuery({
    enabled: enabled && !!effectiveRecordId && mode === "resume",
    queryFn: () => fetchStudioResume(slug, effectiveRecordId as string),
    queryKey: ["studio-resumes", slug, "detail", effectiveRecordId] as const,
    staleTime: 30 * 1000,
  });

  // 面试报告与表单仅面试模式查询 / Reports and form submissions only in interview mode
  const { data: reports = [] } = useQuery({
    enabled: enabled && !!effectiveRoundId && mode === "interview",
    queryFn: () => fetchStudioInterviewRoundReports(slug, effectiveRoundId as string),
    queryKey: ["studio-interview-round-reports", slug, effectiveRoundId],
    refetchOnWindowFocus: true,
  });

  const { data: formSubmissions = [] } = useQuery({
    enabled: enabled && !!effectiveRoundId && mode === "interview",
    queryFn: () => fetchStudioInterviewRoundFormSubmissions(slug, effectiveRoundId as string),
    queryKey: ["studio-interview-round-form-submissions", slug, effectiveRoundId],
    refetchOnWindowFocus: true,
  });

  // 简历模式：拉取该候选人的所有 AI 面试轮次，用于「AI 面试」tab。
  // Resume-mode: list this candidate's AI interview rounds for the "AI 面试" tab.
  const { data: candidateRounds = [], isLoading: isRoundsLoading } = useQuery({
    enabled: enabled && !!effectiveRecordId && mode === "resume",
    queryFn: () => fetchStudioResumeRounds(slug, effectiveRecordId as string),
    queryKey: ["studio-resume-rounds", slug, effectiveRecordId] as const,
    refetchOnWindowFocus: true,
  });

  // 中文：当前轮次的邮件发送摘要 — 用于轮次概览里发送按钮显示发送次数与最后一次时间。
  // 仅在 interview 模式且有 roundId 时启用。
  // English: Email-send summary for the current round, powering the "send"
  // button's count + last-sent timestamp in the round overview. Only fires
  // in interview mode when a roundId is present.
  const roundEmailSummaryRoundIds = useMemo(
    () => (mode === "interview" && round?.id ? [round.id] : []),
    [mode, round?.id],
  );
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
      resumeFileName: resumeRecord.resumeFileName,
      resumeProfile: resumeRecord.resumeProfile,
      targetRole: resumeRecord.targetRole,
    };
  }

  async function handleCopy(link: string) {
    try {
      const result = await copyTextToClipboard(link);

      if (result === "copied") {
        toast.success("面试链接已复制");
        return;
      }

      if (result === "manual") {
        toast.info("已弹出链接，请手动复制");
        return;
      }

      if (result === "failed") {
        throw new Error("copy-failed");
      }
    } catch {
      toast.error("复制失败，请手动复制");
    }
  }

  async function confirmResetSubmission() {
    const submissionId = pendingResetSubmissionId;
    if (!effectiveRoundId || !submissionId) {
      return;
    }

    setResettingSubmissionId(submissionId);
    setPendingResetSubmissionId(null);

    try {
      await deleteStudioInterviewFormSubmission(slug, effectiveRoundId, submissionId);
      toast.success("已重置面试表单填写");
      await queryClient.invalidateQueries({
        queryKey: ["studio-interview-round-form-submissions", slug, effectiveRoundId],
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重置失败");
    } finally {
      setResettingSubmissionId(null);
    }
  }

  // 切换「允许文本输入」开关。Toggle the allowTextInput flag for a round.
  async function handleToggleAllowTextInput(targetRoundId: string, next: boolean) {
    if (updatingRoundId) {
      return;
    }
    setUpdatingRoundId(targetRoundId);
    try {
      await updateStudioInterviewRound(slug, targetRoundId, { allowTextInput: next });
      toast.success(next ? "已开启文本作答" : "已关闭文本作答");
      await queryClient.invalidateQueries({
        queryKey: ["studio-interview-round", slug, effectiveRoundId],
      });
      onUpdated?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "更新失败");
    } finally {
      setUpdatingRoundId(null);
    }
  }

  // 重置轮次为「待开始」状态。Reset a round back to pending.
  async function handleResetRound(targetRoundId: string) {
    if (resettingRoundId) {
      return;
    }
    setResettingRoundId(targetRoundId);
    try {
      await resetStudioInterviewRound(slug, targetRoundId);
      toast.success("轮次已重置为待开始");
      await queryClient.invalidateQueries({
        queryKey: ["studio-interview-round", slug, effectiveRoundId],
      });
      onUpdated?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "重置失败");
    } finally {
      setResettingRoundId(null);
    }
  }

  const interviewQuestions = ensureArray<
    StudioInterviewRoundDetail["candidate"]["interviewQuestions"][number]
  >(record?.interviewQuestions);
  const visibleInterviewQuestions = interviewQuestions.slice(0, 20);
  const latestReport = reports[0] ?? null;

  // 面试模式 footer：「编辑候选人信息」跳转到简历库（record.id = candidateId）。
  // Interview-mode footer: "编辑候选人信息" navigates to resume library using candidateId.
  const interviewModeFooter = record ? (
    <Button
      onClick={() => {
        router.push(`/w/${slug}/studio/resumes?recordId=${record.id}`);
        onClose?.();
      }}
      size="sm"
      type="button"
      variant="outline"
    >
      <PencilIcon className="size-3.5" />
      编辑候选人信息
    </Button>
  ) : null;

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
            router.push(`/w/${slug}/studio/interviews`);
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

  const headerExtra = record ? (
    <div className="mt-2 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      <TabsList className="mt-0 w-full sm:w-auto">
        <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="overview">
          概览
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
        <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="experience">
          经历
        </TabsTrigger>
        {mode === "resume" ? (
          <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="rounds">
            AI 面试
          </TabsTrigger>
        ) : null}
        {mode === "interview" ? (
          <>
            <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="instructions">
              Agent 提示词
            </TabsTrigger>
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
        url={
          record.hasResumeFile
            ? `/api/w/${slug}/studio/${mode === "resume" ? "resumes" : "interviews"}/${
                // 面试模式用 roundId（/:id/resume 已是 round-keyed），简历模式用 record.id。
                // Interview mode uses roundId (/:id/resume is now round-keyed); resume mode uses record.id.
                mode === "interview" ? (record.roundId ?? record.id) : record.id
              }/resume`
            : ""
        }
      />
    </div>
  ) : null;

  // oxlint-disable-next-line no-nested-ternary -- Splitting this tri-state body into a helper balloons JSX context; keeping inline.
  const body = isLoading ? (
    <div className="flex min-h-80 items-center justify-center text-muted-foreground text-sm">
      正在加载候选人详情...
    </div>
  ) : // oxlint-disable-next-line no-nested-ternary -- Secondary branch renders based on record presence.
  record ? (
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
            <div className="rounded-2xl border border-border/60 bg-muted/30 p-5">
              <h3 className="font-medium text-sm">候选人信息</h3>
              <div className="mt-4">
                <CandidateBasicInfoView
                  candidateEmail={record.candidateEmail}
                  candidateName={record.candidateName}
                  candidatePhone={record.candidatePhone}
                  creatorName={record.creatorName}
                  footer={mode === "interview" ? interviewModeFooter : null}
                  hasResumeFile={record.hasResumeFile}
                  jobDescriptionName={record.jobDescriptionName}
                  resumeFileName={record.resumeFileName}
                  targetRole={record.targetRole}
                />
              </div>
            </div>
          )}

          {/* 轮次概览（面试模式专属）/ Round overview (interview mode only) */}
          {mode === "interview" && record.roundId ? (
            <div className="rounded-2xl border border-border/60 bg-background p-5">
              <h3 className="font-medium text-sm">轮次概览</h3>
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
                    {record.roundId ? (
                      <RoundEmailAction
                        candidateEmail={record.candidateEmail}
                        roundId={record.roundId}
                        slug={slug}
                        summary={roundEmailSummary}
                      />
                    ) : null}
                    {record.roundInterviewLink ? (
                      <>
                        <Button
                          onClick={() =>
                            void handleCopy(toAbsoluteUrl(record.roundInterviewLink as string))
                          }
                          size="sm"
                          type="button"
                          variant="ghost"
                        >
                          <Share2Icon className="size-3.5" />
                          复制链接
                        </Button>
                        <InterviewLinkQrButton
                          candidateName={record.candidateName}
                          url={toAbsoluteUrl(record.roundInterviewLink as string)}
                        />
                      </>
                    ) : null}
                  </div>
                </div>
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
                        disabled={resettingRoundId === record.roundId}
                        onClick={() => void handleResetRound(record.roundId as string)}
                        size="sm"
                        type="button"
                        variant="outline"
                      >
                        <RotateCcwIcon className="size-3.5" />
                        {resettingRoundId === record.roundId ? "重置中..." : "重置轮次"}
                      </Button>
                    ) : null}
                  </div>
                </div>
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

          {mode === "interview" ? (
            <div className="rounded-2xl border border-border/60 bg-background p-5">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium text-sm">最近一次面试结果</h3>
                <Badge
                  variant={latestReport ? getReportBadgeVariant(latestReport.status) : "outline"}
                >
                  {latestReport ? formatReportStatus(latestReport.status) : "暂无报告"}
                </Badge>
              </div>
              <p className="mt-3 text-muted-foreground text-sm leading-normal">
                {latestReport?.transcriptSummary ?? "候选人完成面试后，这里会显示通话总结。"}
              </p>
            </div>
          ) : null}
        </div>
      </TabsContent>

      {mode === "interview" ? (
        <TabsContent value="reports">
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
                  {reports.reduce((sum, report) => sum + report.turnCount, 0)}
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
                              conversationId={report.conversationId}
                              durationSecs={report.recordingDurationSecs}
                              recordId={effectiveRoundId ?? ""}
                              status={report.recordingStatus}
                            />
                            <div className="rounded-2xl border border-border/60 bg-background p-4">
                              <h4 className="font-medium text-sm">会话概览</h4>
                              <div className="mt-3 grid gap-2 text-sm">
                                <DetailRow
                                  label="会话 ID"
                                  value={<span className="break-all">{report.conversationId}</span>}
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
                                  value={`共 ${report.turnCount} 条 · 候选人 ${report.userTurnCount} 条 · 面试官 ${report.agentTurnCount} 条`}
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
                              <p className="mt-3 text-muted-foreground text-sm leading-normal">
                                {report.transcriptSummary ?? "暂无总结。"}
                              </p>
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
                              <ConversationTranscript turns={report.turns} />
                            </div>
                          </div>

                          <div className="rounded-2xl border border-border/60 bg-background p-4">
                            <h4 className="font-medium text-sm">评估指标</h4>
                            <div className="mt-4 max-h-[420px] overflow-y-auto pr-1">
                              <EvaluationResults
                                data={
                                  (report.evaluationCriteriaResults as Record<string, unknown>) ??
                                  {}
                                }
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
                      <span className="shrink-0 text-muted-foreground text-xs uppercase">
                        {question.difficulty}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-normal">
                      <Markdown>{truncateText(question.question)}</Markdown>
                    </p>
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

      <TabsContent value="experience">
        <div className="rounded-2xl border border-border/60 bg-background p-5">
          <ResumeProfileView profile={record.resumeProfile ?? null} />
        </div>
      </TabsContent>

      {mode === "resume" ? (
        <TabsContent value="rounds">
          <div className="rounded-2xl border border-border/60 bg-background p-5">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-medium text-sm">AI 面试轮次</h3>
              <span className="text-muted-foreground text-xs">共 {candidateRounds.length} 轮</span>
            </div>
            {/* oxlint-disable-next-line no-nested-ternary -- 三态：loading / empty / list */}
            {isRoundsLoading ? (
              <p className="mt-4 text-muted-foreground text-sm">正在加载面试轮次...</p>
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
                  return (
                    <div
                      className="rounded-xl border border-border/60 bg-muted/30 p-3"
                      key={entry.id}
                    >
                      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <div className="flex items-center gap-2">
                          <span className="wrap-break-word font-medium text-sm">
                            {entry.roundLabel}
                          </span>
                          <Badge variant={statusMeta.tone}>{statusMeta.label}</Badge>
                          {entry.hasReport ? <Badge variant="outline">已有报告</Badge> : null}
                        </div>
                        <div className="flex items-center gap-2">
                          {entry.scheduledAt ? (
                            <TimeDisplay
                              className="shrink-0 text-muted-foreground text-xs"
                              options={DATE_TIME_DISPLAY_OPTIONS}
                              value={entry.scheduledAt}
                            />
                          ) : (
                            <span className="text-muted-foreground text-xs">未排期</span>
                          )}
                          {/* 中文：仅在调用方提供回调时显示「查看详情」；不提供时避免渲染无用按钮。
                              English: Only render 查看详情 when the caller supplies a callback; skip it otherwise. */}
                          {onViewRoundDetail ? (
                            <Button
                              onClick={() => onViewRoundDetail(entry.id)}
                              size="sm"
                              type="button"
                              variant="ghost"
                            >
                              <EyeIcon className="size-3.5" />
                              查看详情
                            </Button>
                          ) : null}
                          <Button
                            onClick={() => void handleCopy(fullLink)}
                            size="sm"
                            type="button"
                            variant="ghost"
                          >
                            <Share2Icon className="size-3.5" />
                            复制链接
                          </Button>
                          <InterviewLinkQrButton
                            candidateName={record.candidateName}
                            url={fullLink}
                          />
                        </div>
                      </div>
                      <div className="mt-3 rounded-lg border border-border/50 bg-background/80 px-3 py-2">
                        <p className="text-muted-foreground text-xs">完整面试链接</p>
                        <p className="mt-1 break-all font-mono text-xs leading-normal">
                          {fullLink}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </TabsContent>
      ) : null}

      {mode === "interview" ? (
        <TabsContent value="instructions">
          <AgentInstructionsPanel enabled={enabled} recordId={effectiveRoundId} />
        </TabsContent>
      ) : null}

      {mode === "interview" ? (
        <TabsContent value="forms">
          <FormsTab
            onReset={(submissionId) => setPendingResetSubmissionId(submissionId)}
            resettingId={resettingSubmissionId}
            submissions={formSubmissions}
          />
        </TabsContent>
      ) : null}
    </AnimatedHeight>
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
        {renderShell({ body, description, footer, headerExtra, title })}
      </Tabs>
      {mode === "interview" ? (
        <AlertDialog
          onOpenChange={(next) => {
            if (!next) {
              setPendingResetSubmissionId(null);
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
