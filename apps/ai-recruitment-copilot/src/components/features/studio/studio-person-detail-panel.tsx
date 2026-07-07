"use client";

import {
  IconArrowBackUp,
  IconExternalLink,
  IconEye,
  IconInfoCircle,
  IconMessage2,
  IconRobot,
} from "@tabler/icons-react";
// 候选人详情视图的共享主体 —— 把数据获取、tab 切换、各 section 渲染抽离出来,
// 让弹窗版本 (StudioPersonDetailDialog) 和独立页面版本同时复用。调用方通过
// shell 自己决定 chrome:Modal、全屏页面布局,甚至嵌入式抽屉都行。
//
// Shared body for the candidate detail view. Owns data fetching, tab state,
// and section rendering so both the modal version (StudioPersonDetailDialog)
// and the full-page route version share one implementation. Callers control
// chrome via shell — Modal, full-page layout, or any custom frame.

import Markdown from "react-markdown";
import type { CandidateFormSubmissionWithSnapshot } from "@arc/db-schema/candidate-forms";
import type { StudioInterviewConversationReport } from "@arc/db-schema/interview-session";
import type { StudioInterviewRoundDetail } from "@arc/shared/studio-interview-rounds";
import {
  canLaunchInterviewFromResume,
  describeResumeReviewStatus,
} from "@arc/shared/studio-resumes";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import { DIFFICULTY_LABEL } from "@arc/shared/interview-question-difficulty";
import { cn } from "@arc/shared/utils";
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
  fetchStudioResumeReview,
  fetchStudioResumeReviewRounds,
  fetchStudioResumeReviewTimeline,
  fetchStudioResumeTimeline,
  resetStudioInterviewRound,
  resolvePublicInterviewRecordId,
  resolveStudioInterviewRecordId,
  transitionInterviewRecord,
  updateStudioInterviewRound,
} from "@/lib/client/api";
import { env } from "@/env/client";
import { useOptionalWorkspaceSlug } from "@/lib/client/workspace-context";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { CandidateBasicInfoView } from "@/components/features/candidate/candidate-basic-info-view";
import { ResumeProfileView } from "@/components/features/resume/resume-profile-view";
import {
  ResumeOverviewPanel,
  ResumeReviewStructuredView,
} from "@/components/features/studio/resumes/resume-overview-panel";
import { toast } from "sonner";
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/features/display/time-display";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { AnimatedHeight } from "@/components/features/motion/animated-height";
import { ResumeDocumentPreviewButton } from "@/components/features/resume/resume-document-preview-button";
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
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHasPermission } from "@/hooks/use-has-permission";
import { HumanInterviewStagePanel } from "./human-interview-stage-panel";
import { OfferStagePanel } from "./offer-stage-panel";
import { PipelineStageActionBar } from "./pipeline-stage-action-bar";
import { CandidateTimeline } from "./candidate-timeline";
import {
  DetailBodySkeleton,
  DetailHeaderSkeleton,
  FormsSkeleton,
  InterviewResultOverviewSkeleton,
  ReportsSkeleton,
  RoundsSkeleton,
  SummaryMetric,
} from "./studio-person-detail-skeletons";
import { toAbsoluteUrl } from "@/lib/client/clipboard";
import { countDisplayInterviewTurns } from "@arc/shared/interview-transcript-turns";
import { pipelineStageMeta, scheduleEntryStatusMeta } from "@arc/db-schema/studio-interviews";
import type { PipelineStage } from "@arc/db-schema/studio-interviews";
import { AgentInstructionsPanel } from "./interviews/agent-instructions-panel";
import { RoundEmailAction } from "./interviews/round-email/round-email-action";
import { useRoundEmailSummary } from "./interviews/round-email/use-round-email-summary";
import { InterviewLinkQrButton } from "./interviews/interview-link-qr-button";
import { ConversationTranscript } from "./interviews/interview-detail/conversation-transcript";
import { DetailRow } from "./interviews/interview-detail/detail-row";
import { EvaluationResults } from "./interviews/interview-detail/evaluation-results";
import type { EvidenceQuote } from "./interviews/interview-detail/evaluation-results";
import { FormsTab } from "./interviews/interview-detail/forms-tab";
import { InterviewMetricsPanel } from "./interviews/interview-detail/interview-metrics-panel";
import {
  ensureArray,
  formatReportStatus,
  getReportBadgeVariant,
  resolveRecommendationVariant,
  truncateText,
} from "./interviews/interview-detail/helpers";
import { RecordingPlayer } from "./interviews/interview-detail/recording-player";

export type StudioPersonDetailMode = "interview" | "resume";
export type StudioPersonDetailLayoutMode = "modal" | "page";

/**
 * 数据来源 + 是否可写。"authed" 走 `/api/w/:slug/studio/*` 既有路由族；
 * "public" 走 `/api/public/*`，所有写操作 UI 被隐藏。
 * "review" 走 workspace 成员级详情 API，给详情链接访问者使用。
 *
 * Data source + write capability.
 * "authed" routes through the existing workspace-scoped API; "public" hits
 * the slug-less `/api/public/*` mirrors and hides all write UI.
 * "review" uses workspace member-scoped detail APIs for reviewer links.
 */
export type StudioPersonDetailAccessMode = "authed" | "public" | "review";

export type StudioPersonDetailTab =
  | "overview"
  | "ai-analysis"
  | "rounds"
  | "human-interview"
  | "offer"
  | "experience"
  | "reports"
  | "questions"
  | "instructions"
  | "transcript"
  | "forms";

function shouldShowAiInterviewTab(record: { pipelineStage?: string } | null): boolean {
  if (!record?.pipelineStage) {
    return false;
  }
  return ["ai_interview", "human_interview", "offer", "closed"].includes(record.pipelineStage);
}

// 真人复面 / Offer tab 的可见性：阶段已到达或经过时才显示，避免新候选人页面噪音。
// 关闭后仍显示（HR 想回看历史 / 重新激活时直接点）。
// Human-interview tab is visible once the candidate has reached or passed that
// stage; remains visible after close for HR audit and reactivation.
function shouldShowHumanInterviewTab(
  record: { pipelineStage?: string } | null,
  canReadHumanInterview: boolean,
): boolean {
  if (!canReadHumanInterview) {
    return false;
  }
  if (!record?.pipelineStage) {
    return false;
  }
  return ["human_interview", "offer", "closed"].includes(record.pipelineStage);
}

function shouldShowOfferTab(
  record: { pipelineStage?: string } | null,
  canReadOffer: boolean,
): boolean {
  if (!canReadOffer) {
    return false;
  }
  if (!record?.pipelineStage) {
    return false;
  }
  return ["offer", "closed"].includes(record.pipelineStage);
}

function tabForPipelineStage(stage: PipelineStage): StudioPersonDetailTab {
  if (stage === "human_interview") {
    return "human-interview";
  }
  if (stage === "offer") {
    return "offer";
  }
  if (stage === "ai_interview") {
    return "rounds";
  }
  return "overview";
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
  bodyClassName?: string;
  modalClassName?: string;
  modalSize?: "sm" | "md" | "lg" | "xl" | "2xl" | "3xl" | "full";
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

type FormQuestion = CandidateFormSubmissionWithSnapshot["snapshot"]["questions"][number];

interface CollectedCandidateInfoItem {
  analysis: string | null;
  answers: string[];
  id: string;
  kind: "form" | "interview";
  question: string;
  sequence: number;
}

type ReportSnapshotMetadata = NonNullable<StudioInterviewConversationReport["snapshotMetadata"]>;
type ReportFullTextInput = NonNullable<ReportSnapshotMetadata["fullTextInput"]>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
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

function formatFormAnswer(question: FormQuestion, rawValue: string | string[] | undefined) {
  if (
    rawValue === undefined ||
    rawValue === "" ||
    (Array.isArray(rawValue) && rawValue.length === 0)
  ) {
    return null;
  }

  if (question.type === "single" || question.type === "multi") {
    const values = Array.isArray(rawValue) ? rawValue : [rawValue];
    const labels = values.map((v) => question.options.find((opt) => opt.value === v)?.label ?? v);
    return labels.join("、");
  }

  return Array.isArray(rawValue) ? rawValue.join(", ") : rawValue;
}

function getCollectedCandidateInfoItems({
  evaluation,
  formSubmissions,
}: {
  evaluation: Record<string, unknown> | null | undefined;
  formSubmissions: CandidateFormSubmissionWithSnapshot[];
}) {
  const formItems: CollectedCandidateInfoItem[] = [];

  for (const submission of formSubmissions) {
    for (const question of submission.snapshot.questions) {
      const answer = formatFormAnswer(question, submission.answers[question.id]);
      formItems.push({
        analysis: null,
        answers: answer ? [answer] : [],
        id: `form-${submission.id}-${question.id}`,
        kind: "form",
        question: question.label,
        sequence: formItems.length + 1,
      });
    }
  }

  const interviewItems: CollectedCandidateInfoItem[] = [];
  const questions = Array.isArray(evaluation?.questions) ? evaluation.questions : [];

  for (const [index, rawQuestion] of questions.entries()) {
    if (!isRecord(rawQuestion)) {
      continue;
    }

    const question =
      typeof rawQuestion.question === "string" && rawQuestion.question.trim()
        ? rawQuestion.question.trim()
        : "未知题目";
    const analysis =
      typeof rawQuestion.assessment === "string" && rawQuestion.assessment.trim()
        ? rawQuestion.assessment.trim()
        : null;
    const order = typeof rawQuestion.order === "number" ? rawQuestion.order : index + 1;
    const rawEvidence = Array.isArray(rawQuestion.evidence) ? rawQuestion.evidence : [];
    const answers = rawEvidence.flatMap((item) => {
      if (!isRecord(item) || typeof item.quote !== "string") {
        return [];
      }
      const quote = item.quote.trim();
      return quote ? [quote] : [];
    });

    interviewItems.push({
      analysis,
      answers,
      id: `interview-${order}-${question}`,
      kind: "interview",
      question,
      sequence: interviewItems.length + 1,
    });
  }

  return { formItems, interviewItems };
}

function CollectedCandidateInfoList({
  items,
  emptyLabel,
}: {
  items: CollectedCandidateInfoItem[];
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-center text-muted-foreground text-sm">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <article
          className="min-w-0 border-border/60 border-b py-4 last:border-b-0 text-sm"
          key={item.id}
        >
          <div className="flex items-start gap-3">
            <span className="mt-0.5 w-7 shrink-0 font-medium text-muted-foreground tabular-nums">
              {item.sequence}.
            </span>
            <div className="min-w-0 flex-1">
              <div className="space-y-1">
                <div className="font-medium text-[11px] text-muted-foreground">问题</div>
                <p className="font-medium text-foreground leading-normal">{item.question}</p>
              </div>
              {item.analysis ? (
                <div className="mt-3 space-y-1">
                  <div className="font-medium text-[11px] text-muted-foreground">AI 分析</div>
                  <p className="font-medium text-foreground leading-6">{item.analysis}</p>
                </div>
              ) : null}
              <div className="mt-3 space-y-1">
                <div className="font-medium text-[11px] text-muted-foreground">
                  {item.kind === "interview" ? "候选人回答" : "回答"}
                </div>
                {item.answers.length > 0 ? (
                  <div className="flex flex-col gap-1.5">
                    {item.answers.map((answer, index) => (
                      <Tooltip key={`${index}-${answer}`}>
                        <TooltipTrigger
                          render={
                            <p
                              className={
                                item.kind === "interview"
                                  ? "line-clamp-2 cursor-help text-muted-foreground leading-6 break-words"
                                  : "line-clamp-2 cursor-help text-foreground leading-6 break-words"
                              }
                            >
                              “{answer}”
                            </p>
                          }
                        />
                        <TooltipContent className="max-w-[min(32rem,calc(100vw-2rem))] whitespace-pre-wrap break-words leading-6">
                          {answer}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground text-sm">暂无提取答案</p>
                )}
              </div>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function compactText(value: string | null | undefined, fallback: string, limit = 420) {
  if (!value?.trim()) {
    return fallback;
  }
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

function ResumeAiAnalysisPlaceholder({
  resumeRecord,
}: {
  resumeRecord: ResumeLibraryDetail | null | undefined;
}) {
  const status = resumeRecord?.resumeReviewStatus ?? "idle";
  const statusMeta = describeResumeReviewStatus(status);

  if (status === "queued" || status === "processing") {
    return (
      <section className="space-y-3 rounded-2xl border border-muted/60 bg-muted/20 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium text-sm">简历筛选 · 分析中</h3>
          <Badge variant={statusMeta.tone}>{statusMeta.label}</Badge>
        </div>
        <p className="text-muted-foreground text-sm leading-6">
          系统正在基于绑定岗位生成 AI 分析，完成后会自动展示在这里。
        </p>
      </section>
    );
  }

  if (status === "failed") {
    return (
      <section className="space-y-3 rounded-2xl border border-muted/60 bg-muted/20 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-medium text-sm">AI 解析失败</h3>
          <Badge variant={statusMeta.tone}>{statusMeta.label}</Badge>
        </div>
        <p className="text-muted-foreground text-sm leading-6">
          {resumeRecord?.resumeReviewError ?? "AI 分析生成失败，请稍后重试。"}
        </p>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-2xl border border-muted/60 bg-muted/20 p-5">
      <h3 className="font-medium text-sm">AI 解析</h3>
      <div className="text-muted-foreground text-sm leading-6">
        <Markdown>{truncateText(resumeRecord?.notes) || "暂无 AI 解析结果"}</Markdown>
      </div>
    </section>
  );
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
    await queryClient.invalidateQueries({
      queryKey: ["studio-interview-agent-instructions", slug, effectiveRoundId],
    });
    await queryClient.invalidateQueries({
      queryKey: ["interview-question-bindings", slug, effectiveRoundId],
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
      queryClient.invalidateQueries({
        queryKey: ["studio-resumes", slug, "timeline", recordId],
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

function resolveActiveEvidence(
  selectedEvidence: SelectedEvidenceState | null,
  conversationId: string,
) {
  return selectedEvidence?.conversationId === conversationId ? selectedEvidence : null;
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

function ReportMetadataButton({
  disabled,
  label,
  onClick,
  visible,
}: {
  disabled: boolean;
  label: string;
  onClick: () => void;
  visible: boolean;
}) {
  if (!visible) {
    return null;
  }

  return (
    <Button disabled={disabled} onClick={onClick} size="sm" type="button" variant="outline">
      <IconInfoCircle className="size-3.5" />
      {label}
    </Button>
  );
}

function InterviewReportMetadataSnapshotSection({
  metadata,
}: {
  metadata: ReportSnapshotMetadata;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-background p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-medium text-sm">快照</h4>
        {metadata.contextSnapshot ? (
          <Badge variant="outline">v{metadata.contextSnapshot.version}</Badge>
        ) : null}
      </div>
      <div className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-2">
        <DetailRow
          label="Context Snapshot"
          value={
            metadata.contextSnapshot ? (
              <span className="break-all">{metadata.contextSnapshot.id}</span>
            ) : (
              "暂无"
            )
          }
        />
        <DetailRow
          label="Evidence Snapshot"
          value={
            metadata.evidenceSnapshot ? (
              <span className="break-all">{metadata.evidenceSnapshot.id}</span>
            ) : (
              "暂无"
            )
          }
        />
        <DetailRow
          label="Context Hash"
          value={
            metadata.contextSnapshot ? (
              <span className="break-all">{metadata.contextSnapshot.contentHash}</span>
            ) : (
              "暂无"
            )
          }
        />
        <DetailRow
          label="Evidence Hash"
          value={
            metadata.evidenceSnapshot ? (
              <span className="break-all">{metadata.evidenceSnapshot.contentHash}</span>
            ) : (
              "暂无"
            )
          }
        />
        <DetailRow
          label="Context 创建时间"
          value={
            metadata.contextSnapshot ? (
              <TimeDisplay
                options={DATE_TIME_DISPLAY_OPTIONS}
                value={metadata.contextSnapshot.createdAt}
              />
            ) : (
              "暂无"
            )
          }
        />
        <DetailRow
          label="Evidence 生成时间"
          value={
            metadata.evidenceSnapshot?.generatedAt ? (
              <TimeDisplay
                options={DATE_TIME_DISPLAY_OPTIONS}
                value={metadata.evidenceSnapshot.generatedAt}
              />
            ) : (
              "暂无"
            )
          }
        />
        <DetailRow label="原因" value={metadata.contextSnapshot?.reason ?? "暂无"} />
        <DetailRow label="状态" value={metadata.contextSnapshot?.status ?? "暂无"} />
      </div>
    </section>
  );
}

function InterviewReportMetadataFrozenInputSection({
  metadata,
}: {
  metadata: ReportSnapshotMetadata;
}) {
  return (
    <section className="rounded-xl border border-border/60 bg-background p-4 shadow-sm">
      <h4 className="font-medium text-sm">冻结输入</h4>
      {metadata.frozenInput ? (
        <div className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-2">
          <DetailRow label="候选人" value={metadata.frozenInput.candidateName ?? "暂无"} />
          <DetailRow label="邮箱" value={metadata.frozenInput.candidateEmail ?? "暂无"} />
          <DetailRow label="目标岗位" value={metadata.frozenInput.targetRole ?? "暂无"} />
          <DetailRow label="JD" value={metadata.frozenInput.jobDescriptionName ?? "未绑定"} />
          <DetailRow label="面试官数" value={metadata.frozenInput.interviewerCount} />
          <DetailRow label="表单模板数" value={metadata.frozenInput.formCount} />
          <DetailRow label="表单问题数" value={metadata.frozenInput.formQuestionCount} />
          <DetailRow label="表单提交数" value={metadata.frozenInput.formSubmissionCount} />
          <DetailRow label="面试题模板数" value={metadata.frozenInput.questionTemplateCount} />
          <DetailRow
            label="模板题目数"
            value={metadata.frozenInput.questionTemplateQuestionCount}
          />
          <DetailRow
            label="候选人专属题数"
            value={metadata.frozenInput.personalizedQuestionCount}
          />
        </div>
      ) : (
        <p className="mt-3 text-muted-foreground text-sm">
          暂无冻结输入摘要，可能需要先执行快照回填。
        </p>
      )}
    </section>
  );
}

function InterviewReportMetadataSessionSection({ metadata }: { metadata: ReportSnapshotMetadata }) {
  return (
    <section className="rounded-xl border border-border/60 bg-background p-4 shadow-sm">
      <h4 className="font-medium text-sm">会话</h4>
      <div className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-2">
        <DetailRow
          label="轮次 ID"
          value={
            metadata.session.scheduleEntryId ? (
              <span className="break-all">{metadata.session.scheduleEntryId}</span>
            ) : (
              "暂无"
            )
          }
        />
        <DetailRow label="对话轮次" value={metadata.session.transcriptTurnCount} />
        <DetailRow label="录制状态" value={metadata.session.recordingStatus ?? "未录制"} />
        <DetailRow
          label="录制时长"
          value={
            metadata.session.recordingDurationSecs === null
              ? "暂无"
              : `${metadata.session.recordingDurationSecs} 秒`
          }
        />
      </div>
    </section>
  );
}

function joinTextLines(lines: (string | null | undefined)[]) {
  return lines
    .map((line) => line?.trim())
    .filter(Boolean)
    .join("\n");
}

function joinTextBlocks(blocks: string[]) {
  return blocks
    .map((block) => block.trim())
    .filter(Boolean)
    .join("\n\n");
}

function formatCandidateFullTextInput(input: ReportFullTextInput) {
  return joinTextLines([
    `候选人：${input.candidate.candidateName ?? "暂无"}`,
    `邮箱：${input.candidate.candidateEmail ?? "暂无"}`,
    `电话：${input.candidate.candidatePhone ?? "暂无"}`,
    `目标岗位：${input.candidate.targetRole ?? "暂无"}`,
    input.candidate.resumeProfileJson
      ? `简历画像 JSON：\n${input.candidate.resumeProfileJson}`
      : null,
  ]);
}

function formatJobFullTextInput(input: ReportFullTextInput) {
  return joinTextLines([
    input.jobDescription ? `JD：${input.jobDescription.name}` : "JD：未绑定",
    input.jobDescription?.prompt ? `JD 原文：\n${input.jobDescription.prompt}` : "JD 原文：暂无",
    input.globalConfig.companyContext
      ? `公司上下文：\n${input.globalConfig.companyContext}`
      : "公司上下文：暂无",
    input.globalConfig.openingInstructions
      ? `开场指令：\n${input.globalConfig.openingInstructions}`
      : "开场指令：暂无",
    input.globalConfig.closingInstructions
      ? `结束指令：\n${input.globalConfig.closingInstructions}`
      : "结束指令：暂无",
  ]);
}

function formatInterviewersFullTextInput(input: ReportFullTextInput) {
  return joinTextBlocks(
    input.interviewers.map((interviewer, index) =>
      joinTextLines([
        `${index + 1}. ${interviewer.name}`,
        interviewer.voice ? `声音：${interviewer.voice}` : null,
        interviewer.prompt ? `Prompt：\n${interviewer.prompt}` : "Prompt：暂无",
      ]),
    ),
  );
}

function formatFormsFullTextInput(input: ReportFullTextInput) {
  const templates = input.forms.map((form) =>
    joinTextLines([
      `表单：${form.title} v${form.version}`,
      form.description ? `描述：${form.description}` : null,
      ...form.questions.map((question, index) =>
        joinTextLines([
          `${index + 1}. ${question.label}`,
          `类型：${question.type}${question.required ? " · 必填" : ""}`,
          question.helperText ? `提示：${question.helperText}` : null,
          question.optionsText ? `选项：\n${question.optionsText}` : null,
        ]),
      ),
    ]),
  );
  const submissions = input.formSubmissions.map((submission) =>
    joinTextLines([
      `提交：${submission.title} v${submission.version}`,
      `提交时间：${submission.submittedAt}`,
      ...submission.answers.map(
        (answer, index) => `${index + 1}. ${answer.label}\n${answer.valueText || "暂无回答"}`,
      ),
    ]),
  );

  return joinTextBlocks([...templates, ...submissions]);
}

function formatQuestionsFullTextInput(input: ReportFullTextInput) {
  const templates = input.questionTemplates.map((template) =>
    joinTextLines([
      `题库模板：${template.title} v${template.version}`,
      template.description ? `描述：${template.description}` : null,
      ...template.questions.map(
        (question, index) => `${index + 1}. [${question.difficulty}] ${question.content}`,
      ),
    ]),
  );
  const personalized = input.personalizedQuestions.length
    ? joinTextLines([
        "候选人专属题：",
        ...input.personalizedQuestions.map(
          (question) => `${question.order}. [${question.difficulty}] ${question.question}`,
        ),
      ])
    : "";

  return joinTextBlocks([...templates, personalized]);
}

function formatTranscriptFullTextInput(input: ReportFullTextInput) {
  return input.transcript
    .map((turn, index) => {
      const timeLabel = typeof turn.timeInCallSecs === "number" ? ` @ ${turn.timeInCallSecs}s` : "";
      return `${index + 1}. ${turn.role}${timeLabel}\n${turn.message}`;
    })
    .join("\n\n");
}

function MetadataTextBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-2">
      <span className="font-medium text-muted-foreground text-xs">{label}</span>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 text-foreground text-xs leading-5">
        {value.trim() || "暂无"}
      </pre>
    </div>
  );
}

function InterviewReportMetadataFullTextInputSection({
  metadata,
}: {
  metadata: ReportSnapshotMetadata;
}) {
  const input = metadata.fullTextInput;
  if (!input) {
    return (
      <section className="rounded-xl border border-border/60 bg-background p-4 shadow-sm">
        <h4 className="font-medium text-sm">完整输入</h4>
        <p className="mt-3 text-muted-foreground text-sm">
          当前快照缺少完整输入文本，可能需要重新生成快照或执行回填。
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-border/60 bg-background p-4 shadow-sm">
      <h4 className="font-medium text-sm">完整输入</h4>
      <Accordion
        className="mt-3 rounded-xl border border-border/60"
        defaultValue={["job", "questions", "transcript"]}
        multiple
      >
        <AccordionItem value="candidate">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            候选人与简历画像
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <MetadataTextBlock label="候选人输入" value={formatCandidateFullTextInput(input)} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="job">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            JD 原文与全局指令
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <MetadataTextBlock label="JD 原文" value={formatJobFullTextInput(input)} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="interviewers">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">面试官</AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <MetadataTextBlock
              label="面试官 Prompt"
              value={formatInterviewersFullTextInput(input)}
            />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="forms">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">
            表单与候选人回答
          </AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <MetadataTextBlock label="表单输入" value={formatFormsFullTextInput(input)} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="questions">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">面试题</AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <MetadataTextBlock label="题目输入" value={formatQuestionsFullTextInput(input)} />
          </AccordionContent>
        </AccordionItem>
        <AccordionItem className="border-b-0" value="transcript">
          <AccordionTrigger className="px-4 py-3 hover:no-underline">Transcript</AccordionTrigger>
          <AccordionContent className="px-4 pb-4">
            <MetadataTextBlock label="完整对话文本" value={formatTranscriptFullTextInput(input)} />
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </section>
  );
}

function InterviewReportMetadataJsonSection({ metadata }: { metadata: ReportSnapshotMetadata }) {
  return (
    <Accordion className="rounded-xl border border-border/60 bg-background">
      <AccordionItem className="border-0" value="raw">
        <AccordionTrigger className="px-4 py-3 hover:no-underline">结构化 JSON</AccordionTrigger>
        <AccordionContent className="px-4 pb-4">
          <pre className="max-h-80 overflow-auto rounded-lg bg-muted/50 p-3 text-xs leading-5">
            {JSON.stringify(metadata, null, 2)}
          </pre>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}

function InterviewReportMetadataDialog({
  onOpenChange,
  report,
}: {
  onOpenChange: (open: boolean) => void;
  report: StudioInterviewConversationReport | null;
}) {
  const metadata = report?.snapshotMetadata ?? null;

  return (
    <Modal
      bodyClassName="space-y-5"
      description={
        report ? <span className="break-all text-xs">会话 {report.conversationId}</span> : undefined
      }
      onOpenChange={onOpenChange}
      open={report !== null}
      size="xl"
      title="面试元信息"
    >
      {metadata ? (
        <>
          <InterviewReportMetadataSnapshotSection metadata={metadata} />
          <InterviewReportMetadataFrozenInputSection metadata={metadata} />
          <InterviewReportMetadataSessionSection metadata={metadata} />
          <InterviewReportMetadataFullTextInputSection metadata={metadata} />
          <InterviewReportMetadataJsonSection metadata={metadata} />
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-border/70 bg-muted/30 px-4 py-8 text-center text-muted-foreground text-sm">
          暂无快照元信息，可能需要先执行数据库迁移和快照回填。
        </div>
      )}
    </Modal>
  );
}

// oxlint-disable-next-line complexity -- Panel orchestrates many conditional sections driven by record state and mode; flattening adds noise.
function useStudioPersonDetailPanel({
  recordId,
  roundId,
  mode,
  enabled = true,
  defaultTab,
  accessMode = "authed",
  layoutMode = "modal",
  onUpdated,
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
  /**
   * "modal" keeps the resume overview rail on an internal scroll area; "page"
   * lets the document own scrolling so fixed page-level footers can reserve space.
   */
  layoutMode?: StudioPersonDetailLayoutMode;
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
  const isReview = accessMode === "review";
  const canUseManagementActions = accessMode === "authed";
  const canViewReportMetadata = accessMode === "authed";
  const hasReadHumanInterviewPermission = useHasPermission("humanInterview", "read");
  const hasCreateHumanInterviewPermission = useHasPermission("humanInterview", "create");
  const hasUpdateHumanInterviewPermission = useHasPermission("humanInterview", "update");
  const hasDeleteHumanInterviewPermission = useHasPermission("humanInterview", "delete");
  const hasReadOfferPermission = useHasPermission("offer", "read");
  const hasCreateOfferPermission = useHasPermission("offer", "create");
  const hasUpdateOfferPermission = useHasPermission("offer", "update");
  const hasDeleteOfferPermission = useHasPermission("offer", "delete");
  const canReadHumanInterview = canUseManagementActions && hasReadHumanInterviewPermission;
  const canCreateHumanInterview = canUseManagementActions && hasCreateHumanInterviewPermission;
  const canUpdateHumanInterview = canUseManagementActions && hasUpdateHumanInterviewPermission;
  const canDeleteHumanInterview = canUseManagementActions && hasDeleteHumanInterviewPermission;
  const canReadOffer = canUseManagementActions && hasReadOfferPermission;
  const canCreateOffer = canUseManagementActions && hasCreateOfferPermission;
  const canUpdateOffer = canUseManagementActions && hasUpdateOfferPermission;
  const canDeleteOffer = canUseManagementActions && hasDeleteOfferPermission;
  // 公开模式下故意不依赖 slug；authed 模式下我们仍要求 workspace 上下文。
  // Public mode is slug-agnostic by design; authed mode still needs the workspace ctx.
  if (!isPublic && !optionalSlug) {
    throw new Error(
      'StudioPersonDetailPanel(accessMode="authed"|"review") must run under a /w/[slug] route',
    );
  }
  // 仅 authed 路径下使用 slug；以变量形式保留，方便下文 string-only 接口拼接。
  // Slug is only consumed on the authed path; declare as string for downstream callers.
  const slug = optionalSlug ?? "";
  const [uiState, dispatchUi] = useReducer(detailPanelUiReducer, initialDetailPanelUiState);
  const [activeTab, setActiveTab] = useState<StudioPersonDetailTab>(defaultTab ?? "overview");
  const [metadataReport, setMetadataReport] = useState<StudioInterviewConversationReport | null>(
    null,
  );
  const [optimisticPipelineStage, setOptimisticPipelineStage] = useState<PipelineStage | null>(
    null,
  );
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
    resumeParseStatus?: ResumeLibraryDetail["resumeParseStatus"];
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
      resumeParseStatus: resumeRecord.resumeParseStatus,
      resumeProfile: resumeRecord.resumeProfile,
      targetRole: resumeRecord.targetRole,
    };
  }

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
  const { formItems, interviewItems } = getCollectedCandidateInfoItems({
    evaluation: latestReport?.evaluationCriteriaResults as Record<string, unknown> | undefined,
    formSubmissions,
  });
  const isRoundCompleted = record?.roundStatus === "completed";
  const canResetAiRound =
    Boolean(record?.roundId) && !isPublic && record?.pipelineStage === "ai_interview";
  const isRoundLive =
    record?.roundStatus === "in_progress" || record?.roundStatus === "interrupted";
  const roundActionLockedReason = isRoundLive ? "面试正在进行中，结束后才能发送或复制链接。" : null;
  const roundActionDisabledReason = roundActionLockedReason ?? aiStageLockedReason;

  // 简历模式的「发起 AI 面试」合并到顶部招聘流程按钮组。
  // 已存在 AI 面试轮次的简历隐藏该按钮，避免重复创建；轮次列表加载中也先隐藏，避免闪烁。
  //
  // Resume-mode launch action is grouped into the top pipeline action bar.
  // Hide it once the resume has any rounds (to prevent dup-creates), and
  // suppress it while rounds are loading to avoid a flash-then-hide.
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
    if (isReview) {
      return `/api/w/${slug}/studio/resumes/${record.id}/review/resume`;
    }
    const previewRecordId = mode === "interview" ? (record.roundId ?? record.id) : record.id;
    return `/api/w/${slug}/studio/${mode === "resume" ? "resumes" : "interviews"}/${previewRecordId}/resume`;
  })();

  // resume 模式下且非公开访问时，渲染全局流程条；它描述候选人整体状态，
  // 所以放在所有 tab 内容之上，而不是某个 tab 内容里。
  // Action bar shows only on the authed resume-mode view. It is candidate-wide
  // state, so it lives above all tab content rather than inside a tab panel.
  const actionBar =
    mode === "resume" &&
    record &&
    canUseManagementActions &&
    record.pipelineStage &&
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
        canCreateHumanInterview={canCreateHumanInterview}
        canCreateOffer={canCreateOffer}
        hasJobDescription={Boolean(resumeRecord?.jobDescriptionId)}
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
              setOptimisticPipelineStage(target);
              setActiveTab(tabForPipelineStage(target));
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
        pipelineStage={record.pipelineStage}
        primaryAction={launchResumeModeButton}
        showAiInterviewStep={shouldShowAiInterviewTab(tabVisibilityRecord)}
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
            <TabsTrigger className="flex-1 sm:min-w-[6em] sm:flex-none" value="ai-analysis">
              AI 解析
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
        <ResumeDocumentPreviewButton
          className="w-full sm:w-auto"
          disabled={!record.hasResumeFile}
          filename={record.resumeFileName ?? undefined}
          label="预览简历"
          url={resumePreviewUrl}
        />
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

  // oxlint-disable-next-line no-nested-ternary -- Splitting this tri-state body into a helper balloons JSX context; keeping inline.
  const body = isLoading ? (
    <DetailBodySkeleton mode={mode} />
  ) : // oxlint-disable-next-line no-nested-ternary -- Secondary branch renders based on record presence.
  record ? (
    <div className={bodyLayoutClassName}>
      <div className={detailScrollClassName} ref={tabContentRootRef}>
        {actionBar}
        <AnimatedHeight clip={!showTimelineRail}>
          <TabsContent value="overview">
            <div className="space-y-8">
              {/* 简历模式：复用 ResumeOverviewPanel —— 与「发起 AI 面试」
              弹窗的概览 tab 同一布局，后续要扩字段也只改一处。
              Resume mode: defer to ResumeOverviewPanel so the
              launch-interview dialog and this view stay in sync. */}
              {mode === "resume" && resumeRecord ? (
                <ResumeOverviewPanel detail={resumeRecord} />
              ) : (
                <div className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
                  {isReportsLoading ? (
                    <InterviewResultOverviewSkeleton />
                  ) : (
                    <section className="h-full rounded-2xl bg-muted/20 border-muted/60 border p-5">
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
                      <div className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-3">
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
                      <div className="mt-5 border-border/50 border-t pt-5 text-muted-foreground text-sm leading-6">
                        <Markdown>
                          {compactText(
                            latestEvaluationSummary.overallAssessment ??
                              latestReport?.transcriptSummary ??
                              null,
                            "候选人完成面试后，这里会优先显示结论、评分和关键摘要。",
                          )}
                        </Markdown>
                      </div>
                    </section>
                  )}

                  <section className="h-full space-y-4  rounded-2xl bg-muted/20 border-muted/60 border p-5">
                    <h3 className="font-medium text-sm">候选人信息</h3>
                    <div>
                      <CandidateBasicInfoView
                        candidateEmail={record.candidateEmail}
                        candidateName={record.candidateName}
                        candidatePhone={record.candidatePhone}
                        creatorName={record.creatorName}
                        hasResumeFile={record.hasResumeFile}
                        jobDescriptionName={record.jobDescriptionName}
                        pdfPreviewUrl={resumePreviewUrl}
                        resumeFileName={record.resumeFileName}
                        targetRole={record.targetRole}
                      />
                    </div>
                  </section>
                </div>
              )}

              {/* 轮次概览（面试模式专属）/ Round overview (interview mode only) */}
              {mode === "interview" && record.roundId ? (
                <section className="space-y-4 border-t border-border/50 pt-6">
                  <h3 className="font-medium text-sm">轮次概览</h3>
                  {isAiStageLocked ? (
                    <p className="rounded-xl bg-muted/30 px-3 py-2 text-muted-foreground text-xs leading-5">
                      {aiStageLockedReason}
                    </p>
                  ) : null}
                  <div className="space-y-4">
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
                      <div className="flex items-center justify-between gap-3 rounded-xl bg-muted/30 px-4 py-3 border border-muted/60">
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
                              record.roundStatus === "completed" ||
                              updatingRoundId === record.roundId
                            }
                            onCheckedChange={(next) =>
                              void handleToggleAllowTextInput(record.roundId as string, next)
                            }
                          />
                          {canResetAiRound ? (
                            <Button
                              disabled={resettingRoundId === record.roundId}
                              onClick={() => void handleResetRound(record.roundId as string)}
                              size="sm"
                              type="button"
                              variant="outline"
                            >
                              <IconArrowBackUp className="size-3.5" />
                              {resettingRoundId === record.roundId ? "重置中..." : "重置轮次"}
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              ) : null}

              <section className="xl:col-span-2 border-border/50 border-t pt-6">
                <div className="mb-4">
                  <h3 className="font-medium text-sm">候选人收集信息</h3>
                </div>
                {isFormSubmissionsLoading || isReportsLoading ? (
                  <FormsSkeleton />
                ) : (
                  <div className="grid gap-x-6 gap-y-8 md:grid-cols-2">
                    <div>
                      <div className="mb-3 flex items-center gap-2">
                        <h4 className="font-medium text-sm">表单题</h4>
                        <Badge variant="outline">共{formItems.length}题</Badge>
                      </div>
                      <CollectedCandidateInfoList emptyLabel="暂无表单答复" items={formItems} />
                    </div>
                    <div>
                      <div className="mb-3 flex items-center gap-2">
                        <h4 className="font-medium text-sm">面试题</h4>
                        <Badge variant="outline">共{interviewItems.length}题</Badge>
                      </div>
                      <CollectedCandidateInfoList emptyLabel="暂无面试题" items={interviewItems} />
                    </div>
                  </div>
                )}
              </section>

              {mode === "interview" ? (
                <section className="space-y-3 border-t border-border/50 pt-6">
                  <h3 className="font-medium text-sm">简历评价</h3>
                  <div className="text-muted-foreground text-sm leading-6">
                    <Markdown>{truncateText(record.notes) || "暂无简历评价"}</Markdown>
                  </div>
                </section>
              ) : null}
            </div>
          </TabsContent>

          {mode === "resume" ? (
            <TabsContent value="ai-analysis">
              {resumeRecord?.resumeReview ? (
                <ResumeReviewStructuredView review={resumeRecord.resumeReview} />
              ) : (
                <ResumeAiAnalysisPlaceholder resumeRecord={resumeRecord} />
              )}
            </TabsContent>
          ) : null}

          {mode === "interview" ? (
            <TabsContent value="reports">
              {isReportsLoading ? (
                <ReportsSkeleton />
              ) : (
                <div className="space-y-8">
                  <div className="grid gap-x-8 gap-y-4 md:grid-cols-4">
                    <SummaryMetric label="本轮通话次数" value={reports.length} />
                    <SummaryMetric
                      label="已完成"
                      value={reports.filter((report) => report.status === "done").length}
                    />
                    <SummaryMetric
                      label="失败"
                      value={reports.filter((report) => report.status === "failed").length}
                    />
                    <SummaryMetric label="累计对话轮次" value={totalDisplayTurnCount} />
                  </div>

                  {reports.length === 0 ? (
                    <div className="flex min-h-60 flex-col items-center justify-center rounded-2xl border border-dashed border-border/70 bg-muted/40 px-6 py-10 text-center">
                      <IconMessage2 className="size-8 text-muted-foreground" />
                      <p className="mt-4 font-medium text-sm">暂无面试报告</p>
                      <p className="mt-2 max-w-xl text-muted-foreground text-sm leading-normal">
                        候选人开始并结束语音面试后，这里会展示逐场面试的总结、状态和完整对话记录。
                      </p>
                    </div>
                  ) : (
                    <Accordion
                      className="space-y-4"
                      defaultValue={[reports[0].conversationId]}
                      multiple
                    >
                      {reports.map((report) => {
                        const startedAt = report.startedAt ?? report.createdAt;
                        const endedAt = report.endedAt ?? report.updatedAt;
                        const { displayAgentTurnCount, displayTurnCount, displayUserTurnCount } =
                          resolveDisplayTurnStats(
                            report,
                            reportTranscriptStats.get(report.conversationId),
                          );
                        const activeEvidence = resolveActiveEvidence(
                          selectedEvidence,
                          report.conversationId,
                        );
                        const snapshotMetadata = report.snapshotMetadata ?? null;
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
                            className="overflow-hidden rounded-2xl border border-border/70 bg-muted/25 px-0 shadow-sm"
                            key={report.conversationId}
                            value={report.conversationId}
                          >
                            <AccordionTrigger className="rounded-none px-5 py-4 hover:no-underline data-panel-open:border-border/60 data-panel-open:border-b data-panel-open:bg-background/70">
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
                                <div className="mt-2 h-20 line-clamp-4 text-muted-foreground text-sm leading-5 [&_p]:m-0">
                                  <Markdown>
                                    {report.transcriptSummary ??
                                      report.latestError ??
                                      "暂无总结，等待后续同步。"}
                                  </Markdown>
                                </div>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent className="bg-muted/25 px-5 pt-4 pb-5">
                              <div className="grid gap-4  lg:grid-cols-[minmax(0,1fr)_minmax(400px,1fr)]">
                                <div className="space-y-4">
                                  {env.NEXT_PUBLIC_ENABLE_INTERVIEW_RECORDING ? (
                                    <RecordingPlayer
                                      accessMode={isPublic ? "public" : "authed"}
                                      conversationId={report.conversationId}
                                      durationSecs={report.recordingDurationSecs}
                                      recordId={effectiveRoundId ?? ""}
                                      seekToSecs={activeEvidence?.timeInCallSecs ?? null}
                                      status={report.recordingStatus}
                                      surface="section"
                                    />
                                  ) : null}
                                  <section className="rounded-xl border border-border/60 bg-background p-4 shadow-sm">
                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <h4 className="font-medium text-sm">会话概览</h4>
                                      <ReportMetadataButton
                                        disabled={!snapshotMetadata}
                                        label=""
                                        onClick={() => setMetadataReport(report)}
                                        visible={canViewReportMetadata}
                                      />
                                    </div>
                                    <div className="mt-3 grid gap-x-8 gap-y-4 text-sm md:grid-cols-2">
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
                                  </section>

                                  <section className="rounded-xl border border-border/60 bg-background p-4 shadow-sm">
                                    <h4 className="font-medium text-sm">最终总结</h4>
                                    <div className="mt-3 text-muted-foreground text-sm leading-6">
                                      <Markdown>
                                        {report.transcriptSummary ?? "暂无总结。"}
                                      </Markdown>
                                    </div>
                                    {report.latestError ? (
                                      <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive text-sm">
                                        {report.latestError}
                                      </div>
                                    ) : null}
                                  </section>
                                </div>

                                <div className="lg:relative">
                                  <section className="flex h-[480px] flex-col overflow-hidden rounded-xl border border-border/60 bg-background p-4 shadow-sm lg:absolute lg:inset-0 lg:h-auto">
                                    <h4 className="shrink-0 pb-2 font-medium text-sm">对话记录</h4>
                                    <ConversationTranscript
                                      activeTurnIndex={activeEvidence?.turnIndex ?? null}
                                      turns={report.turns}
                                    />
                                  </section>
                                </div>

                                <section className="rounded-xl border border-border/60 bg-background p-4 shadow-sm">
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
                                </section>

                                <InterviewMetricsPanel
                                  metrics={report.metrics ?? {}}
                                  surface="section"
                                />
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
              <section className="space-y-4">
                <h3 className="font-medium text-sm">AI 面试题</h3>
                <div className="flex flex-col gap-3">
                  {visibleInterviewQuestions.length > 0 ? (
                    visibleInterviewQuestions.map((question) => (
                      <article
                        className="rounded-xl bg-muted/30 px-4 py-3 border-muted/60 border"
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
                      </article>
                    ))
                  ) : (
                    <p className="text-muted-foreground text-sm">
                      暂无面试题，可通过上传简历自动生成。
                    </p>
                  )}
                </div>
              </section>
            </TabsContent>
          ) : null}

          {mode === "interview" ? (
            <TabsContent value="experience">
              <ResumeProfileView profile={record.resumeProfile ?? null} />
            </TabsContent>
          ) : null}

          {mode === "resume" && shouldShowAiInterviewTab(tabVisibilityRecord) ? (
            <TabsContent value="rounds">
              <section className="space-y-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-medium text-sm">AI 面试轮次</h3>
                  <span className="text-muted-foreground text-xs">
                    共 {candidateRounds.length} 轮
                  </span>
                </div>
                {isAiStageLocked ? (
                  <p className="rounded-xl bg-muted/30 px-3 py-2 text-muted-foreground text-xs leading-5">
                    {aiStageLockedReason}
                  </p>
                ) : null}
                {/* oxlint-disable-next-line no-nested-ternary -- 三态：loading / empty / list */}
                {isRoundsLoading ? (
                  <RoundsSkeleton />
                ) : /* oxlint-disable-next-line no-nested-ternary -- Secondary branch renders empty-state or list. */
                candidateRounds.length === 0 ? (
                  <p className="text-muted-foreground text-sm leading-normal">
                    该候选人还没有发起面试。在简历库点「保存并发起面试」即可创建。
                  </p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {candidateRounds.map((entry) => {
                      const statusMeta = scheduleEntryStatusMeta[entry.status];
                      const fullLink = toAbsoluteUrl(entry.interviewLink);
                      const isEntryLive =
                        entry.status === "in_progress" || entry.status === "interrupted";
                      const entryActionDisabledReason = isEntryLive
                        ? roundActionLockedReason
                        : aiStageLockedReason;
                      return (
                        <article
                          className="rounded-xl bg-muted/30 px-4 py-3 border-muted/60 border"
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
                          </div>
                          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="text-muted-foreground text-xs">
                              {entry.scheduledAt ? (
                                <TimeDisplay
                                  options={DATE_TIME_DISPLAY_OPTIONS}
                                  value={entry.scheduledAt}
                                />
                              ) : (
                                "未排期"
                              )}
                            </div>
                            <div className="flex flex-wrap items-center justify-end gap-2">
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
                                  <IconEye className="size-3.5" />
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
                        </article>
                      );
                    })}
                  </div>
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
      {showTimelineRail ? (
        <aside
          className={cn(
            "min-h-0 min-w-0 max-w-full overflow-hidden",
            canUseTimelineRailScroll ? "xl:h-full" : "xl:sticky xl:top-5",
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

  const footer = null;
  const bodyClassName = canUseTimelineRailScroll ? "xl:overflow-hidden" : undefined;
  const modalClassName = canUseTimelineRailScroll ? "xl:h-[90vh]" : undefined;
  let modalSize: StudioPersonDetailSlots["modalSize"] = "full";
  if (mode === "resume") {
    modalSize = "3xl";
  }

  return (
    <>
      <Tabs
        key={`${roundId ?? recordId ?? "empty"}`}
        onValueChange={(value) => setActiveTab(value as StudioPersonDetailTab)}
        value={activeTab}
      >
        {shell({
          body,
          bodyClassName,
          description,
          footer,
          headerExtra,
          modalClassName,
          modalSize,
          title,
        })}
      </Tabs>
      {mode === "interview" && canViewReportMetadata ? (
        <InterviewReportMetadataDialog
          onOpenChange={(open) => {
            if (!open) {
              setMetadataReport(null);
            }
          }}
          report={metadataReport}
        />
      ) : null}
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
