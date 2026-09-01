import { z } from "zod";
import type { InterviewTranscriptTurn } from "@arc/db-schema/interview-session";
import type { InterviewEvidenceSnapshotFormSubmission } from "@arc/db-schema/interview-snapshots";
import type { InterviewQuestion } from "@arc/db-schema/interview/types";
import { hasExistingInterviewAnswers } from "@arc/shared/interview/question-outcomes";
import type { InterviewDataCollectionResults } from "@arc/shared/interview/question-outcomes";
import { formatCandidateFormAnswer } from "@arc/shared/candidate-form-answer";
import {
  generateStructuredWithMastraAgent,
  generateTextWithMastraAgent,
  interviewReportEvaluationAgent,
  interviewReportSummaryAgent,
} from "@app/ai-runtime/simple-generators";

const SUMMARY_PROMPT = `你是一位面试报告撰写助手。请根据以下面试对话记录，使用面试对话的主要语言撰写一段篇幅相当于中文 200-300 字的面试摘要。
摘要需包括：面试涉及的主要话题、候选人的整体表现、值得关注的亮点或不足，面试对话记录中，如果用户跳过了某个问题，则该问题视为0分。

## 面试对话记录
{transcript}`;

const EVALUATION_PROMPT = `你是一位专业的面试评估专家。请根据以下面试对话记录和面试题目，对候选人的表现进行结构化评估。

## 候选人面试前表单答复
{formResponses}

## 面试题目
{questions}

## 面试对话记录
{transcript}

请严格按照指定 JSON Schema 输出评估结果。

注意：
- hrEvaluation 只汇总候选人在表单答复或候选人本人对话中明确表达的信息，不得从简历、面试官话术或常识推测
- 将同一主题在表单和语音面试中的信息合并为简洁、完整的事实；没有收集到的信息必须输出 null
- hrEvaluation.jobMotivation：离职原因 + 看机会核心关注点
- hrEvaluation.availability：当前 base 地、求职状态及到岗时间
- hrEvaluation.overseasTravel：年龄、成家情况、是否可以接受短期海外出差及周期
- hrEvaluation.compensationExpectations：过往两份工作的薪酬及结构（年包=固定月薪+浮动月薪+奖金+期权/股票）以及薪酬期望
- hrEvaluation.careerProgression：过往两份工作的绩效、是否有高绩效、加薪或晋升，并说明原因；没有相关信息时输出 null
- hrEvaluation.recentWork：最近两份工作的个人角色定位、团队架构及人员分工、离职原因
- hrEvaluation.projectHighlights：候选人分享的亮点项目
- 只评估面试中实际提问到的题目
- 顶层题目数组字段必须命名为 questions，不得使用 questionEvaluations 等别名；每一项都必须包含 questionId、order、question 和 score，无法评分时 score 输出 null
- 每道题必须原样返回输入中的题目ID到 questionId
- answered 和 insufficient 根据原始转写证据评分；insufficient 仅依据有限证据，不自动记零分
- skipped 的 evidence 只引用候选人明确拒答的原话，作为跳过依据；interrupted 的 evidence 只保留已产生的部分上下文；二者都不要包装成正式能力证据
- unasked 不生成 evidence；skipped、interrupted、unasked 的评分由系统按流程结果统一处理
- score 范围 0-10，overallScore 范围 0-100
- 评价要客观具体，引用候选人的实际回答
- overallAssessment、assessment 等自由文本字段请使用面试对话的主要语言；recommendation 必须保持指定的中文枚举值
- 面试记录每行包含 turnIndex 和可能存在的 time；每题 evidence 最多给 2 条候选人原话证据
- evidence.quote 必须来自候选人的实际回答，turnIndex / timeInCallSecs 能定位时必须填写，无法定位时可留空`;

const evidenceSchema = z.object({
  quote: z.string().min(1).max(500).describe("候选人原话片段"),
  timeInCallSecs: z.number().int().min(0).nullable().optional().describe("通话内秒数"),
  turnIndex: z.number().int().min(1).nullable().optional().describe("对话记录中的 1-based 行号"),
});

const hrEvaluationSchema = z.object({
  availability: z.string().nullable().describe("当前 base 地、求职状态及到岗时间"),
  careerProgression: z
    .string()
    .nullable()
    .describe("过往两份工作的绩效、是否有高绩效、加薪或晋升及原因；无相关信息则为 null"),
  compensationExpectations: z
    .string()
    .nullable()
    .describe("过往两份工作的薪酬及结构（年包=固定月薪+浮动月薪+奖金+期权/股票）和薪酬期望"),
  jobMotivation: z.string().nullable().describe("离职原因和看机会核心关注点"),
  overseasTravel: z.string().nullable().describe("年龄、成家情况、能否接受短期海外出差及周期"),
  projectHighlights: z.string().nullable().describe("候选人分享的亮点项目"),
  recentWork: z
    .string()
    .nullable()
    .describe("最近两份工作的个人角色定位、团队架构及人员分工、离职原因"),
});

export const interviewEvaluationSchema = z.object({
  hrEvaluation: hrEvaluationSchema,
  overallAssessment: z.string().describe("候选人整体表现的综合评价，2-3 句话"),
  overallScore: z.number().int().min(0).max(100).nullable(),
  questions: z.array(
    z.object({
      assessment: z.string().describe("对候选人该题回答的评价"),
      evidence: z.array(evidenceSchema).default([]).describe("支撑该题评分的候选人原话证据"),
      maxScore: z.number().int().default(10),
      order: z.number().int(),
      question: z.string(),
      questionId: z.string().min(1),
      score: z.number().int().min(0).max(10).nullable(),
    }),
  ),
  recommendation: z.enum(["建议进入下一轮", "不建议进入下一轮", "待定"]),
});

export type InterviewEvaluation = z.infer<typeof interviewEvaluationSchema>;

export interface InterviewEvaluationQuestion extends InterviewQuestion {
  questionId: string;
}

type InterviewEvaluationGenerator = typeof generateStructuredWithMastraAgent;

export const INTERVIEW_REPORT_EVALUATION_VERSION = "interview-report-evaluation-v1";

// oxlint-disable anti-slop/no-known-value-widening, anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion -- Mastra's normalizeInvalid boundary intentionally receives untrusted provider output; this function checks each representation before the strict interviewEvaluationSchema parses the normalized result.
export function normalizeInterviewEvaluationOutput(
  value: unknown,
  configuredQuestions: InterviewEvaluationQuestion[] = [],
  dataCollectionResults?: InterviewDataCollectionResults | null,
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const output = value as Record<string, unknown>;
  const rawQuestions = Array.isArray(output.questions)
    ? output.questions
    : output.questionEvaluations;
  if (!Array.isArray(rawQuestions)) {
    return value;
  }
  const configuredById = new Map(
    configuredQuestions.map((question) => [question.questionId, question]),
  );
  const outcomeById = new Map(
    (dataCollectionResults?.questions ?? []).map((outcome) => [outcome.questionId, outcome]),
  );
  const questions = rawQuestions.map((rawQuestion) => {
    if (!rawQuestion || typeof rawQuestion !== "object" || Array.isArray(rawQuestion)) {
      return rawQuestion;
    }
    const question = rawQuestion as Record<string, unknown>;
    const configured =
      typeof question.questionId === "string" ? configuredById.get(question.questionId) : undefined;
    if (!configured) {
      return rawQuestion;
    }
    const outcome = outcomeById.get(configured.questionId);
    let fallbackAssessment = "报告未能生成本题评估。";
    if (outcome?.status === "answered") {
      fallbackAssessment = "已收集候选人回答，但报告未返回本题的文字评价。";
    } else if (outcome?.status === "insufficient") {
      fallbackAssessment =
        outcome.followUpCount > 0
          ? `经 ${outcome.followUpCount} 次追问后，现有信息仍不足。`
          : "候选人已回答，但现有信息不足。";
    }
    return {
      ...question,
      assessment:
        typeof question.assessment === "string" && question.assessment.trim()
          ? question.assessment
          : fallbackAssessment,
      order: Number.isInteger(question.order) ? question.order : configured.order,
      question:
        typeof question.question === "string" && question.question.trim()
          ? question.question
          : configured.question,
      score: question.score === undefined ? null : question.score,
    };
  });
  const rawHrEvaluation =
    output.hrEvaluation && typeof output.hrEvaluation === "object"
      ? (output.hrEvaluation as Record<string, unknown>)
      : {};
  const hrEvaluation = {
    availability: rawHrEvaluation.availability ?? null,
    careerProgression: rawHrEvaluation.careerProgression ?? null,
    compensationExpectations: rawHrEvaluation.compensationExpectations ?? null,
    jobMotivation: rawHrEvaluation.jobMotivation ?? null,
    overseasTravel: rawHrEvaluation.overseasTravel ?? null,
    projectHighlights: rawHrEvaluation.projectHighlights ?? null,
    recentWork: rawHrEvaluation.recentWork ?? null,
  };
  return { ...output, hrEvaluation, questions };
}
// oxlint-enable anti-slop/no-known-value-widening, anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unknown-returns, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion

const SCORABLE_OUTCOMES = new Set(["answered", "insufficient", "skipped"]);

export function applyQuestionOutcomesToEvaluation(
  evaluation: InterviewEvaluation,
  dataCollectionResults: InterviewDataCollectionResults,
): InterviewEvaluation {
  const evaluationByQuestionId = new Map(
    evaluation.questions.map((question) => [question.questionId, question]),
  );
  const questions = dataCollectionResults.questions.map((outcome, index) => {
    const generated = evaluationByQuestionId.get(outcome.questionId);
    const base = generated ?? {
      assessment: "报告未能生成本题评估。",
      evidence: [],
      maxScore: 10,
      order: index + 1,
      question: outcome.question,
      questionId: outcome.questionId,
      score: null,
    };
    if (outcome.status === "skipped") {
      return {
        ...base,
        assessment: "候选人明确跳过本题。",
        score: 0,
      };
    }
    if (outcome.status === "interrupted") {
      if (outcome.reason === "question_prompt_interrupted") {
        return {
          ...base,
          assessment: "题目播报未完成，未获得有效回答，不参与评分。",
          evidence: [],
          score: null,
        };
      }
      return {
        ...base,
        assessment: "本题在完成前被中断，不参与评分。",
        score: null,
      };
    }
    if (outcome.status === "unasked") {
      return {
        ...base,
        assessment: "本轮面试结束前未开始本题，不参与评分。",
        evidence: [],
        score: null,
      };
    }
    return base;
  });
  const scorableQuestionIds = new Set(
    dataCollectionResults.questions
      .filter((outcome) => SCORABLE_OUTCOMES.has(outcome.status))
      .map((outcome) => outcome.questionId),
  );
  const scoreTotal = questions.reduce(
    (total, question) =>
      total +
      (scorableQuestionIds.has(question.questionId) && question.score !== null
        ? (question.score / question.maxScore) * 100
        : 0),
    0,
  );
  const overallScore =
    scorableQuestionIds.size > 0 ? Math.round(scoreTotal / scorableQuestionIds.size) : null;
  const coverage =
    dataCollectionResults.questions.length > 0
      ? scorableQuestionIds.size / dataCollectionResults.questions.length
      : 0;

  return {
    ...evaluation,
    overallScore,
    questions,
    recommendation: coverage < 0.5 ? "待定" : evaluation.recommendation,
  };
}

export function formatCandidateFormSubmissions(
  submissions: InterviewEvidenceSnapshotFormSubmission[],
): string {
  return submissions
    .flatMap((submission) => {
      const answers = submission.snapshot.questions.flatMap((question) => {
        const value = formatCandidateFormAnswer(question, submission.answers[question.id]);
        return value ? [`${question.label}：${value}`] : [];
      });
      return answers.length > 0 ? [`【${submission.snapshot.title}】\n${answers.join("\n")}`] : [];
    })
    .join("\n\n");
}

export function formatTranscript(turns: InterviewTranscriptTurn[]): string {
  return turns
    .map((turn, index) => {
      const role = turn.role === "agent" ? "面试官" : "候选人";
      const time =
        turn.timeInCallSecs === undefined ? "" : ` time=${Math.round(turn.timeInCallSecs)}s`;
      return `[turnIndex=${index + 1}${time}] ${role}: ${turn.message}`;
    })
    .join("\n");
}

export function formatQuestions(
  questions: InterviewEvaluationQuestion[],
  dataCollectionResults?: InterviewDataCollectionResults | null,
): string {
  if (questions.length === 0) {
    return "（无补充题目）";
  }
  const outcomeById = new Map(
    (dataCollectionResults?.questions ?? []).map((outcome) => [outcome.questionId, outcome]),
  );
  return questions
    .map((q) => {
      const outcome = outcomeById.get(q.questionId);
      const metadata = [
        `   题目ID：${q.questionId}`,
        q.evaluationFocus ? `   考核点：${q.evaluationFocus}` : null,
        q.followUpDirections ? `   追问方向：${q.followUpDirections}` : null,
        outcome ? `   流程结果：${outcome.status}` : null,
      ]
        .filter(Boolean)
        .join("\n");
      return `${q.order}. [${q.difficulty}] ${q.question}${metadata ? `\n${metadata}` : ""}`;
    })
    .join("\n");
}

export interface InterviewReportResult {
  summary: string | null;
  evaluation: InterviewEvaluation | null;
  summaryError?: string;
  evaluationError?: string;
}

const FALLBACK_ANSWER_STATUSES = new Set(["answered", "insufficient"]);

export function buildFallbackInterviewSummary(
  dataCollectionResults: InterviewDataCollectionResults,
): string {
  const answeredCount = dataCollectionResults.questions.filter((question) =>
    FALLBACK_ANSWER_STATUSES.has(question.status),
  ).length;
  const insufficientCount = dataCollectionResults.questions.filter(
    (question) => question.status === "insufficient",
  ).length;
  const insufficientNote = insufficientCount > 0 ? `，其中 ${insufficientCount} 道题信息不足` : "";
  return `本次面试已收集 ${answeredCount} 道题的候选人回答${insufficientNote}。结构化评价未能生成，当前报告仅展示已收集事实，请人工复核。`;
}

export function buildFallbackInterviewEvaluation(
  dataCollectionResults: InterviewDataCollectionResults,
): InterviewEvaluation {
  const questions = dataCollectionResults.questions.map((outcome, index) => {
    let assessment = "本轮面试结束前未开始本题，不参与评分。";
    if (outcome.status === "answered") {
      assessment = outcome.answerSummary
        ? `已收集回答：${outcome.answerSummary}`
        : "候选人已回答本题，但未能生成回答摘要。";
    } else if (outcome.status === "insufficient") {
      assessment = outcome.answerSummary
        ? `信息不足：${outcome.answerSummary}`
        : "候选人已回答本题，但现有信息不足。";
    } else if (outcome.status === "skipped") {
      assessment = "候选人明确跳过本题。";
    } else if (outcome.status === "interrupted") {
      assessment = "本题在完成前被中断，不参与评分。";
    }
    return {
      assessment,
      evidence: [],
      maxScore: 10,
      order: index + 1,
      question: outcome.question,
      questionId: outcome.questionId,
      score: outcome.status === "skipped" ? 0 : null,
    };
  });

  return {
    hrEvaluation: {
      availability: null,
      careerProgression: null,
      compensationExpectations: null,
      jobMotivation: null,
      overseasTravel: null,
      projectHighlights: null,
      recentWork: null,
    },
    overallAssessment: buildFallbackInterviewSummary(dataCollectionResults),
    overallScore: null,
    questions,
    recommendation: "待定",
  };
}

export function applyInterviewReportAnswerFallback(
  report: InterviewReportResult,
  dataCollectionResults: InterviewDataCollectionResults | null,
): InterviewReportResult {
  if (!dataCollectionResults || !hasExistingInterviewAnswers(dataCollectionResults)) {
    return report;
  }
  return {
    ...report,
    evaluation: report.evaluation ?? buildFallbackInterviewEvaluation(dataCollectionResults),
    summary: report.summary ?? buildFallbackInterviewSummary(dataCollectionResults),
  };
}

export function composeInterviewReport(input: {
  evaluationResult: PromiseSettledResult<InterviewEvaluation>;
  summaryResult: PromiseSettledResult<string>;
}): InterviewReportResult {
  const result: InterviewReportResult = { evaluation: null, summary: null };

  if (input.summaryResult.status === "fulfilled") {
    result.summary = input.summaryResult.value.trim() || null;
  } else {
    result.summaryError =
      input.summaryResult.reason instanceof Error
        ? input.summaryResult.reason.message
        : String(input.summaryResult.reason);
  }

  if (input.evaluationResult.status === "fulfilled") {
    result.evaluation = input.evaluationResult.value;
  } else {
    result.evaluationError =
      input.evaluationResult.reason instanceof Error
        ? input.evaluationResult.reason.message
        : String(input.evaluationResult.reason);
  }

  return result;
}

export async function generateInterviewSummary(options: {
  transcript: InterviewTranscriptTurn[];
}): Promise<string> {
  return await generateTextWithMastraAgent({
    agent: interviewReportSummaryAgent,
    prompt: SUMMARY_PROMPT.replace("{transcript}", formatTranscript(options.transcript)),
    temperature: 0.2,
  });
}

export function buildInterviewEvaluationPrompt(options: {
  candidateFormResponses: string;
  dataCollectionResults?: InterviewDataCollectionResults | null;
  questions: InterviewEvaluationQuestion[];
  transcript: InterviewTranscriptTurn[];
}): string {
  return EVALUATION_PROMPT.replace(
    "{formResponses}",
    options.candidateFormResponses || "（无表单答复）",
  )
    .replace("{questions}", formatQuestions(options.questions, options.dataCollectionResults))
    .replace("{transcript}", formatTranscript(options.transcript));
}

export async function generateInterviewEvaluation(
  options: {
    candidateFormResponses: string;
    dataCollectionResults?: InterviewDataCollectionResults | null;
    questions: InterviewEvaluationQuestion[];
    transcript: InterviewTranscriptTurn[];
  },
  generate: InterviewEvaluationGenerator = generateStructuredWithMastraAgent,
): Promise<InterviewEvaluation> {
  const evaluation = await generate({
    agent: interviewReportEvaluationAgent,
    fallbackToTextGeneration: true,
    maxOutputTokens: 8192,
    normalizeInvalid: (value) =>
      normalizeInterviewEvaluationOutput(value, options.questions, options.dataCollectionResults),
    observabilityLabel: INTERVIEW_REPORT_EVALUATION_VERSION,
    prompt: buildInterviewEvaluationPrompt(options),
    retryOnInvalid: true,
    retryOnTransient: true,
    retryTextJsonOnInvalid: true,
    schema: interviewEvaluationSchema,
    temperature: 0,
    timeoutMs: 120_000,
  });
  return options.dataCollectionResults
    ? applyQuestionOutcomesToEvaluation(evaluation, options.dataCollectionResults)
    : evaluation;
}

export interface InterviewReportDependencies {
  generateEvaluation: typeof generateInterviewEvaluation;
  generateSummary: typeof generateInterviewSummary;
}

const defaultInterviewReportDependencies: InterviewReportDependencies = {
  generateEvaluation: generateInterviewEvaluation,
  generateSummary: generateInterviewSummary,
};

export async function generateInterviewReport(
  options: {
    candidateFormResponses: string;
    dataCollectionResults?: InterviewDataCollectionResults | null;
    transcript: InterviewTranscriptTurn[];
    questions: InterviewEvaluationQuestion[];
  },
  dependencies: InterviewReportDependencies = defaultInterviewReportDependencies,
): Promise<InterviewReportResult> {
  const { transcript, questions } = options;

  if (transcript.length === 0) {
    return { evaluation: null, summary: null };
  }

  const [summaryResult, evaluationResult] = await Promise.allSettled([
    dependencies.generateSummary({ transcript }),
    dependencies.generateEvaluation({
      candidateFormResponses: options.candidateFormResponses,
      dataCollectionResults: options.dataCollectionResults,
      questions,
      transcript,
    }),
  ]);

  return composeInterviewReport({ evaluationResult, summaryResult });
}
