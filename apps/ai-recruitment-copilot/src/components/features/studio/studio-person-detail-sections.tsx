"use client";

// 候选人详情视图的共享主体 —— 把数据获取、tab 切换、各 section 渲染抽离出来,
// 让弹窗版本 (StudioPersonDetailDialog) 和独立页面版本同时复用。调用方通过
// shell 自己决定 chrome:Modal、全屏页面布局,甚至嵌入式抽屉都行。
//
// Shared body for the candidate detail view. Owns data fetching, tab state,
// and section rendering so both the modal version (StudioPersonDetailDialog)
// and the full-page route version share one implementation. Callers control
// chrome via shell — Modal, full-page layout, or any custom frame.

import type { CandidateFormSubmissionWithSnapshot } from "@arc/db-schema/candidate-forms";
import { describeResumeReviewStatus } from "@arc/shared/studio-resumes";
import type { ResumeLibraryDetail } from "@arc/shared/studio-resumes";
import type { QueryClient } from "@tanstack/react-query";
import {
  deleteStudioInterviewFormSubmission,
  resetStudioInterviewRound,
  transitionInterviewRecord,
  updateStudioInterviewRound,
} from "@/lib/client/api";

import { Badge } from "@/components/ui/badge";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { countDisplayInterviewTurns } from "@arc/shared/interview-transcript-turns";
import type { PipelineStage } from "@arc/db-schema/studio-interviews";
import { truncateText } from "./interviews/interview-detail/helpers";

import type {
  CollectedCandidateInfoItem,
  EvaluationSummary,
  FormQuestion,
} from "./studio-person-detail-model";
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getEvaluationSummary(
  data: Record<string, unknown> | null | undefined,
): EvaluationSummary {
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

export function formatFormAnswer(question: FormQuestion, rawValue: string | string[] | undefined) {
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

export function getCollectedCandidateInfoItems({
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
      id: `interview-${index}-${order}-${question}`,
      kind: "interview",
      question,
      sequence: interviewItems.length + 1,
    });
  }

  return { formItems, interviewItems };
}

export function CollectedCandidateInfoList({
  items,
  emptyLabel,
}: {
  items: CollectedCandidateInfoItem[];
  emptyLabel: string;
}) {
  if (items.length === 0) {
    return <div className="py-8 text-center text-muted-foreground text-sm">{emptyLabel}</div>;
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
                                  ? "line-clamp-2 cursor-help text-muted-foreground leading-6 wrap-break-word"
                                  : "line-clamp-2 cursor-help text-foreground leading-6 wrap-break-word"
                              }
                            >
                              “{answer}”
                            </p>
                          }
                        />
                        <TooltipContent className="max-w-[min(32rem,calc(100vw-2rem))] whitespace-pre-wrap wrap-break-word leading-6">
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

export function compactText(value: string | null | undefined, fallback: string, limit = 420) {
  if (!value?.trim()) {
    return fallback;
  }
  return value.length > limit ? `${value.slice(0, limit)}...` : value;
}

export function ResumeAiAnalysisPlaceholder({
  resumeRecord,
}: {
  resumeRecord: ResumeLibraryDetail | null | undefined;
}) {
  const status = resumeRecord?.resumeReviewStatus ?? "idle";
  const statusMeta = describeResumeReviewStatus(status);

  if (status === "queued" || status === "processing") {
    return (
      <Frame>
        <FrameHeader className="flex-row items-center justify-between gap-3">
          <FrameTitle>简历筛选 · 分析中</FrameTitle>
          <div>
            <Badge variant={statusMeta.tone}>{statusMeta.label}</Badge>
          </div>
        </FrameHeader>
        <FramePanel>
          <p className="text-muted-foreground text-sm leading-6">
            系统正在基于绑定岗位生成 AI评分，完成后会自动展示在这里。
          </p>
        </FramePanel>
      </Frame>
    );
  }

  if (status === "failed") {
    return (
      <Frame>
        <FrameHeader className="flex-row items-center justify-between gap-3">
          <FrameTitle>AI评分失败</FrameTitle>
          <div>
            <Badge variant={statusMeta.tone}>{statusMeta.label}</Badge>
          </div>
        </FrameHeader>
        <FramePanel>
          <p className="text-muted-foreground text-sm leading-6">
            {resumeRecord?.resumeReviewError ?? "AI评分生成失败，请稍后重试。"}
          </p>
        </FramePanel>
      </Frame>
    );
  }

  return (
    <Frame>
      <FrameHeader>
        <FrameTitle>AI评分</FrameTitle>
      </FrameHeader>
      <FramePanel>
        <MarkdownView
          className="text-muted-foreground text-sm leading-6"
          content={truncateText(resumeRecord?.notes) || "暂无 AI评分结果"}
        />
      </FramePanel>
    </Frame>
  );
}

export type ResumeScreeningRuleResult = NonNullable<
  ResumeLibraryDetail["resumeScreeningResult"]
>["ruleResults"][number];

export function getResumeScreeningRuleStatusMeta(status: ResumeScreeningRuleResult["status"]) {
  if (status === "pass") {
    return { label: "满足", variant: "success" as const };
  }
  if (status === "fail") {
    return { label: "未满足", variant: "destructive" as const };
  }
  return { label: "待核实", variant: "warning" as const };
}

export function getResumeScreeningRuleStatusOrder(status: ResumeScreeningRuleResult["status"]) {
  if (status === "pass") {
    return 0;
  }
  if (status === "fail") {
    return 1;
  }
  return 2;
}

export function getResumeScreeningRuleSeverityLabel(
  severity: ResumeScreeningRuleResult["severity"],
) {
  if (severity === "blocking") {
    return "阻断";
  }
  if (severity === "warning") {
    return "提醒";
  }
  return "信息";
}

export function ResumeScreeningResultPanel({
  resumeRecord,
}: {
  resumeRecord: ResumeLibraryDetail | null | undefined;
}) {
  const result = resumeRecord?.resumeScreeningResult;
  const recommendationMeta = {
    flag: { label: "需人工核实", variant: "warning" as const },
    hold: { label: "暂缓推进", variant: "destructive" as const },
    pass: { label: "通过", variant: "success" as const },
  };
  const sortedRuleResults =
    result?.ruleResults
      .map((rule, index) => ({ index, rule }))
      .toSorted(
        (a, b) =>
          getResumeScreeningRuleStatusOrder(a.rule.status) -
            getResumeScreeningRuleStatusOrder(b.rule.status) || a.index - b.index,
      )
      .map(({ rule }) => rule) ?? [];

  return (
    <Frame className="h-full">
      <FrameHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <FrameTitle>岗位规则检查</FrameTitle>
        <div className="flex flex-wrap gap-2">
          {result ? (
            <Badge variant={recommendationMeta[result.recommendation].variant}>
              {recommendationMeta[result.recommendation].label}
            </Badge>
          ) : null}
          {resumeRecord?.resumeScreeningStale ? <Badge variant="warning">规则已更新</Badge> : null}
        </div>
      </FrameHeader>
      <FramePanel className="flex-1">
        {resumeRecord?.resumeScreeningError ? (
          <p className="mb-4 text-destructive text-sm">{resumeRecord.resumeScreeningError}</p>
        ) : null}
        {resumeRecord?.resumeScreeningStale ? (
          <p className="mb-4 text-muted-foreground text-sm leading-6">
            当前检查结果基于旧版岗位规则生成，重新评估会同时更新规则检查和系统简历评价。
          </p>
        ) : null}
        {sortedRuleResults.length ? (
          <ScrollArea className="h-[24rem]" scrollFade>
            <ul className="divide-y divide-border/50">
              {sortedRuleResults.map((rule) => (
                <li className="py-4 text-sm leading-6" key={rule.ruleId}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={getResumeScreeningRuleStatusMeta(rule.status).variant}>
                      {getResumeScreeningRuleStatusMeta(rule.status).label}
                    </Badge>
                    <Badge variant="outline">
                      {getResumeScreeningRuleSeverityLabel(rule.severity)}
                    </Badge>
                    <span className="font-medium text-sm">{rule.label}</span>
                  </div>
                  <p className="mt-2 text-muted-foreground">{rule.reason}</p>
                  {rule.evidence.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-muted-foreground text-xs">
                      {rule.evidence.slice(0, 2).map((evidence, index) => (
                        <li key={`${rule.ruleId}-${index}`}>
                          {evidence.quote ? `“${evidence.quote}”` : evidence.explanation}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              ))}
            </ul>
          </ScrollArea>
        ) : (
          <p className="flex h-[24rem] w-full min-w-0 items-center justify-center text-muted-foreground text-sm leading-6">
            {result?.policyEmpty ? "该岗位未启用具体筛选规则。" : "未评估"}
          </p>
        )}
      </FramePanel>
    </Frame>
  );
}

export function resolveDisplayTurnStats(
  report: { agentTurnCount: number; turnCount: number; userTurnCount: number },
  stats: ReturnType<typeof countDisplayInterviewTurns> | undefined,
) {
  return {
    displayAgentTurnCount: stats?.agentTurnCount ?? report.agentTurnCount,
    displayTurnCount: stats?.turnCount ?? report.turnCount,
    displayUserTurnCount: stats?.userTurnCount ?? report.userTurnCount,
  };
}

export async function resetInterviewFormSubmission({
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

export async function updateAllowTextInput({
  next,
  queryClient,
  slug,
  targetRoundId,
}: {
  next: boolean;
  queryClient: QueryClient;
  slug: string;
  targetRoundId: string;
}): Promise<string | null> {
  try {
    await updateStudioInterviewRound(slug, targetRoundId, { allowTextInput: next });
    await queryClient.invalidateQueries({
      queryKey: ["studio-interview-round", slug, targetRoundId],
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "更新失败";
  }
}

export async function resetInterviewRound({
  queryClient,
  slug,
  targetRoundId,
}: {
  queryClient: QueryClient;
  slug: string;
  targetRoundId: string;
}): Promise<string | null> {
  try {
    await resetStudioInterviewRound(slug, targetRoundId);
    await queryClient.invalidateQueries({
      queryKey: ["studio-interview-round", slug, targetRoundId],
    });
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "重置失败";
  }
}

export async function advancePipelineStage({
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

export interface SelectedEvidenceState {
  conversationId: string;
  timeInCallSecs: number | null;
  turnIndex: number | null;
}

export interface DetailPanelUiState {
  pendingResetSubmissionId: string | null;
  resettingRoundId: string | null;
  resettingSubmissionId: string | null;
  selectedEvidence: SelectedEvidenceState | null;
  updatingRoundId: string | null;
}

export function resolveActiveEvidence(
  selectedEvidence: SelectedEvidenceState | null,
  conversationId: string,
) {
  return selectedEvidence?.conversationId === conversationId ? selectedEvidence : null;
}

export type DetailPanelUiAction =
  | { id: string | null; type: "pendingResetSubmissionChanged" }
  | { id: string | null; type: "resettingRoundChanged" }
  | { id: string | null; type: "resettingSubmissionChanged" }
  | { evidence: SelectedEvidenceState | null; type: "selectedEvidenceChanged" }
  | { id: string | null; type: "updatingRoundChanged" };

export const initialDetailPanelUiState: DetailPanelUiState = {
  pendingResetSubmissionId: null,
  resettingRoundId: null,
  resettingSubmissionId: null,
  selectedEvidence: null,
  updatingRoundId: null,
};

export function detailPanelUiReducer(
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
