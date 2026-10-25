"use client";

import { buildRecruitingAdvanceCommand } from "./recruiting-advance-command";
// 候选人详情视图的共享主体 —— 把数据获取、tab 切换、各 section 渲染抽离出来,
// 让弹窗版本 (StudioPersonDetailDialog) 和独立页面版本同时复用。调用方通过
// shell 自己决定 chrome:Modal、全屏页面布局,甚至嵌入式抽屉都行。
//
// Shared body for the candidate detail view. Owns data fetching, tab state,
// and section rendering so both the modal version (StudioPersonDetailDialog)
// and the full-page route version share one implementation. Callers control
// chrome via shell — Modal, full-page layout, or any custom frame.

import type { CandidateFormSubmissionWithSnapshot } from "@app/db-schema/candidate-forms";
import type { StudioInterviewConversationReport } from "@app/db-schema/interview-session";
import type { InterviewQuestion } from "@app/db-schema/interview/types";
import type { InterviewQuestionOutcome } from "@app/shared/interview/question-outcomes";
import type { ResumeLibraryDetail } from "@app/shared/studio-resumes";
import type { QueryClient } from "@tanstack/react-query";
import {
  fetchStudioResume,
  deleteStudioInterviewFormSubmission,
  resetStudioInterviewRound,
  transitionInterviewRecord,
  updateStudioInterviewRound,
} from "@/lib/client/api";

import { Badge } from "@/components/ui/badge";
import { CandidateAvatar } from "./candidate-avatar-image";
import { HighlightedText } from "./interviews/interview-detail/keyword-highlight/highlighted-text";
import {
  QUESTION_END_REASON_LABELS,
  QUESTION_STATUS_LABELS,
  QUESTION_STATUS_VARIANTS,
} from "./interviews/interview-detail/question-status";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/ui/frame";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { PipelineStage } from "@app/db-schema/studio-interviews";
import { z } from "zod";

import type {
  CollectedCandidateInfoItem,
  EvaluationSummary,
  FormQuestion,
} from "./studio-person-detail-model";
import { invalidateRecruitingTransitionQueries } from "./recruiting-transition-query-refresh";

const evaluationSummarySchema = z.object({
  overallAssessment: z.string().nullable().optional(),
  overallScore: z.number().nullable().optional(),
  recommendation: z.string().nullable().optional(),
});

const evaluationQuestionsSchema = z.object({
  questions: z
    .array(
      z.object({
        assessment: z.string().optional(),
        evidence: z.array(z.object({ quote: z.string().optional() })).optional(),
        maxScore: z.number().optional(),
        order: z.number().optional(),
        question: z.string().optional(),
        questionId: z.string().optional(),
        score: z.number().nullable().optional(),
      }),
    )
    .optional(),
});

export function getEvaluationSummary<const T>(data: T): EvaluationSummary {
  const parsed = evaluationSummarySchema.safeParse(data);
  if (!parsed.success) {
    return {
      overallAssessment: null,
      overallScore: null,
      recommendation: null,
    };
  }

  return {
    overallAssessment: parsed.data.overallAssessment ?? null,
    overallScore: parsed.data.overallScore ?? null,
    recommendation: parsed.data.recommendation ?? null,
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

function collectEvidenceQuotes(evidence: { quote?: string }[] | undefined) {
  return (evidence ?? []).flatMap((item) => {
    const quote = item.quote?.trim();
    return quote ? [quote] : [];
  });
}

type EvaluatedQuestion = NonNullable<
  z.infer<typeof evaluationQuestionsSchema>["questions"]
>[number];

function buildFormItems(formSubmissions: CandidateFormSubmissionWithSnapshot[]) {
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
  return formItems;
}

/** 按新版逐题结果列出全部沟通题，并合入评估里的得分、原话与分析。 */
/** Lists every question from V2 outcomes, merging in the evaluation's score, quotes and analysis. */
function buildOutcomeInterviewItems(
  outcomes: InterviewQuestionOutcome[],
  questions: EvaluatedQuestion[],
): CollectedCandidateInfoItem[] {
  const evaluationById = new Map(
    questions.flatMap((question) => (question.questionId ? [[question.questionId, question]] : [])),
  );
  return outcomes.map((outcome, index) => {
    const evaluated = evaluationById.get(outcome.questionId);
    return {
      analysis: evaluated?.assessment?.trim() || null,
      answers: collectEvidenceQuotes(evaluated?.evidence),
      id: `interview-${outcome.questionId}`,
      kind: "interview",
      outcome: {
        durationSecs: Math.max(0, Math.round(outcome.endedAtSecs - outcome.startedAtSecs)),
        followUpCount: outcome.followUpCount,
        maxScore: evaluated?.maxScore ?? 10,
        reason: outcome.reason,
        score: evaluated?.score ?? null,
        status: outcome.status,
      },
      question: outcome.question,
      sequence: index + 1,
    };
  });
}

function buildLegacyInterviewItems(questions: EvaluatedQuestion[]): CollectedCandidateInfoItem[] {
  return questions.map((rawQuestion, index) => {
    const question = rawQuestion.question?.trim() ? rawQuestion.question.trim() : "未知题目";
    const order = rawQuestion.order ?? index + 1;
    return {
      analysis: rawQuestion.assessment?.trim() ? rawQuestion.assessment.trim() : null,
      answers: collectEvidenceQuotes(rawQuestion.evidence),
      id: `interview-${index}-${order}-${question}`,
      kind: "interview",
      question,
      sequence: index + 1,
    };
  });
}

export function getCollectedCandidateInfoItems<const T>({
  evaluation,
  formSubmissions,
  outcomes = null,
}: {
  evaluation: T;
  formSubmissions: CandidateFormSubmissionWithSnapshot[];
  /** 新版逐题结果；提供时按它列出全部沟通题并附上状态与得分。 */
  /** V2 per-question outcomes; when present every question is listed with status and score. */
  outcomes?: InterviewQuestionOutcome[] | null;
}) {
  const parsedEvaluation = evaluationQuestionsSchema.safeParse(evaluation);
  const questions = parsedEvaluation.success ? (parsedEvaluation.data.questions ?? []) : [];
  const interviewItems =
    outcomes && outcomes.length > 0
      ? buildOutcomeInterviewItems(outcomes, questions)
      : buildLegacyInterviewItems(questions);
  return { formItems: buildFormItems(formSubmissions), interviewItems };
}

export function getReportFormItems(
  report: StudioInterviewConversationReport | null | undefined,
): CollectedCandidateInfoItem[] | null {
  const submissions = report?.snapshotMetadata?.fullTextInput?.formSubmissions;
  if (!submissions) {
    return null;
  }

  const items: CollectedCandidateInfoItem[] = [];
  for (const [submissionIndex, submission] of submissions.entries()) {
    for (const answer of submission.answers) {
      items.push({
        analysis: null,
        answers: answer.valueText ? [answer.valueText] : [],
        id: `form-${submissionIndex}-${submission.templateId}-${answer.questionId}`,
        kind: "form",
        question: answer.label,
        sequence: items.length + 1,
      });
    }
  }
  return items;
}

/** 沟通题回答的说话人：候选人姓名与简历头像来源。Speaker shown beside interview answers. */
export interface CollectedAnswerSpeaker {
  avatar: { recordId: string; version: string | null } | null;
  name: string;
}

function InterviewAnswerBubbles({
  answers,
  speaker,
}: {
  answers: string[];
  speaker: CollectedAnswerSpeaker;
}) {
  const name = speaker.name.trim() || "候选人";
  return (
    <div className="flex items-start gap-2.5">
      <CandidateAvatar
        className="mt-0.5 size-6"
        label={name}
        recordId={speaker.avatar?.recordId ?? ""}
        seed={speaker.name.trim() || "未命名候选人"}
        source="resumes"
        version={speaker.avatar?.version ?? null}
      />
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5">
        <span className="text-muted-foreground text-xs">
          <span className="font-medium text-foreground">{name}</span> · 候选人
        </span>
        {answers.map((answer) => (
          <p
            className="max-w-full whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-muted/70 px-3 py-2 text-foreground text-sm leading-6 wrap-break-word"
            key={answer}
          >
            <HighlightedText text={answer} />
          </p>
        ))}
      </div>
    </div>
  );
}

export function CollectedCandidateInfoList({
  items,
  emptyLabel,
  speaker = { avatar: null, name: "" },
}: {
  items: CollectedCandidateInfoItem[];
  emptyLabel: string;
  /** 沟通题回答以候选人气泡展示时使用的说话人。Speaker for interview answer bubbles. */
  speaker?: CollectedAnswerSpeaker;
}) {
  if (items.length === 0) {
    return <div className="py-8 text-center text-muted-foreground text-sm">{emptyLabel}</div>;
  }

  // 编号方块 + 题目作标题；沟通题回答用候选人气泡，表单回答用左侧竖线引出；AI 分析放在最后。
  // A numbered tile and the question as the title; interview answers render as candidate
  // bubbles, form answers sit behind a left rule, and the AI analysis comes last.
  return (
    <div className="flex flex-col">
      {items.map((item) => (
        <article
          className="min-w-0 border-border/60 border-t py-4 first:border-t-0 first:pt-0 last:pb-0"
          key={item.id}
        >
          <div className="flex items-start gap-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground text-xs tabular-nums">
              {item.sequence}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-2.5">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-start gap-3">
                  <p className="min-w-0 flex-1 font-medium text-foreground text-sm leading-6">
                    {item.question}
                  </p>
                  {item.outcome ? (
                    <div className="flex h-6 shrink-0 items-center gap-2">
                      <Badge variant={QUESTION_STATUS_VARIANTS[item.outcome.status]}>
                        {QUESTION_STATUS_LABELS[item.outcome.status]}
                      </Badge>
                      <span className="w-12 text-right font-medium text-foreground text-sm tabular-nums">
                        {item.outcome.score === null
                          ? "不评分"
                          : `${item.outcome.score}/${item.outcome.maxScore}`}
                      </span>
                    </div>
                  ) : null}
                </div>
                {item.outcome ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground text-xs">
                    <span>追问 {item.outcome.followUpCount} 次</span>
                    <span>用时 {item.outcome.durationSecs} 秒</span>
                    {item.outcome.reason ? (
                      <span>{QUESTION_END_REASON_LABELS[item.outcome.reason]}</span>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div>
                <span className="sr-only">{item.kind === "interview" ? "候选人回答" : "回答"}</span>
                {item.answers.length > 0 && item.kind === "interview" ? (
                  <InterviewAnswerBubbles answers={item.answers} speaker={speaker} />
                ) : null}
                {item.answers.length > 0 && item.kind === "form" ? (
                  <div className="flex flex-col gap-1.5 border-border border-l-2 pl-3">
                    {item.answers.map((answer) => (
                      <Tooltip key={answer}>
                        <TooltipTrigger
                          render={
                            <p className="line-clamp-2 cursor-help text-foreground/90 text-sm leading-6 wrap-break-word">
                              {answer}
                            </p>
                          }
                        />
                        <TooltipContent className="max-w-[min(32rem,calc(100vw-2rem))] whitespace-pre-wrap wrap-break-word leading-6">
                          {answer}
                        </TooltipContent>
                      </Tooltip>
                    ))}
                  </div>
                ) : null}
                {item.answers.length === 0 ? (
                  <p className="text-muted-foreground text-sm">暂无提取答案</p>
                ) : null}
              </div>
              {item.analysis ? (
                <div className="flex flex-col gap-1">
                  <p className="font-medium text-muted-foreground text-xs">AI 分析</p>
                  <p className="text-foreground text-sm leading-6">
                    <HighlightedText text={item.analysis} />
                  </p>
                </div>
              ) : null}
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

export type ResumeScreeningRuleResult = NonNullable<
  ResumeLibraryDetail["resumeScreeningResult"]
>["ruleResults"][number];

function getResumeScreeningRuleStatusMeta(status: ResumeScreeningRuleResult["status"]) {
  if (status === "pass") {
    return { label: "满足", variant: "success" as const };
  }
  if (status === "fail") {
    return { label: "未满足", variant: "destructive" as const };
  }
  return { label: "待核实", variant: "warning" as const };
}

function getResumeScreeningRuleStatusOrder(status: ResumeScreeningRuleResult["status"]) {
  if (status === "pass") {
    return 0;
  }
  if (status === "fail") {
    return 1;
  }
  return 2;
}

function getResumeScreeningRuleSeverityLabel(severity: ResumeScreeningRuleResult["severity"]) {
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
                  <p className="mt-2 text-foreground">{rule.reason}</p>
                  {rule.evidence.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-foreground text-sm">
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

const advancePipelineStageDependencies = {
  fetchStudioResume,
  transitionInterviewRecord,
};

export async function advancePipelineStage(
  {
    interviewQuestions,
    queryClient,
    recordId,
    slug,
    target,
  }: {
    interviewQuestions?: InterviewQuestion[];
    queryClient: QueryClient;
    recordId: string;
    slug: string;
    target: PipelineStage;
  },
  dependencies = advancePipelineStageDependencies,
): Promise<string | null> {
  try {
    if (target === "closed") {
      throw new Error("请使用结束流程操作");
    }
    const current =
      queryClient.getQueryData<ResumeLibraryDetail>(["studio-resumes", slug, "detail", recordId]) ??
      (await dependencies.fetchStudioResume(slug, recordId));
    if (!current) {
      throw new Error("招聘记录不存在");
    }
    const command = buildRecruitingAdvanceCommand(current, target, interviewQuestions);
    await dependencies.transitionInterviewRecord(slug, recordId, command);
    await invalidateRecruitingTransitionQueries(queryClient, slug, recordId);
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
