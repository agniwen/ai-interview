import { z } from "zod";
import type { InterviewTranscriptTurn } from "@arc/db-schema/interview-session";
import type { InterviewEvidenceSnapshotFormSubmission } from "@arc/db-schema/interview-snapshots";
import type { InterviewQuestion } from "@arc/db-schema/interview/types";
import { formatCandidateFormAnswer } from "@arc/shared/candidate-form-answer";
import {
  generateStructuredWithMastraAgent,
  generateTextWithMastraAgent,
  interviewReportEvaluationAgent,
  interviewReportSummaryAgent,
} from "@arc/ai-recruitment-copilot-backend/server/agents/mastra/agents/simple-generators";

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
- hrEvaluation.recentWork 同时覆盖最近两份工作的公司规模、部门架构、个人角色，以及适用的工作节奏、压力、离职原因、亮点项目或管理沟通信息
- 只评估面试中实际提问到的题目
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
  availability: z.string().nullable().describe("当前 base 地、求职状态和最快到岗时间"),
  careerProgression: z.string().nullable().describe("最近两份工作的绩效、晋升、加薪晋级和获奖荣誉"),
  compensationExpectations: z
    .string()
    .nullable()
    .describe("最近两份工作的薪酬及结构、当前薪酬和薪酬期望"),
  jobMotivation: z.string().nullable().describe("候选人的求职动机"),
  overseasTravel: z.string().nullable().describe("成家情况、能否接受短期海外出差及周期"),
  recentWork: z
    .string()
    .nullable()
    .describe("最近两份工作的公司规模、部门架构、个人角色及管理或非管理岗补充信息"),
});

const evaluationSchema = z.object({
  hrEvaluation: hrEvaluationSchema,
  overallAssessment: z.string().describe("候选人整体表现的综合评价，2-3 句话"),
  overallScore: z.number().int().min(0).max(100),
  questions: z.array(
    z.object({
      assessment: z.string().describe("对候选人该题回答的评价"),
      evidence: z.array(evidenceSchema).default([]).describe("支撑该题评分的候选人原话证据"),
      maxScore: z.number().int().default(10),
      order: z.number().int(),
      question: z.string(),
      score: z.number().int().min(0).max(10),
    }),
  ),
  recommendation: z.enum(["建议进入下一轮", "不建议进入下一轮", "待定"]),
});

export type InterviewEvaluation = z.infer<typeof evaluationSchema>;

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
        typeof turn.timeInCallSecs === "number" ? ` time=${Math.round(turn.timeInCallSecs)}s` : "";
      return `[turnIndex=${index + 1}${time}] ${role}: ${turn.message}`;
    })
    .join("\n");
}

export function formatQuestions(questions: InterviewQuestion[]): string {
  if (questions.length === 0) {
    return "（无补充题目）";
  }
  return questions
    .map((q) => {
      const metadata = [
        q.evaluationFocus ? `   考核点：${q.evaluationFocus}` : null,
        q.followUpDirections ? `   追问方向：${q.followUpDirections}` : null,
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

export async function generateInterviewEvaluation(options: {
  candidateFormResponses: string;
  questions: InterviewQuestion[];
  transcript: InterviewTranscriptTurn[];
}): Promise<InterviewEvaluation> {
  return await generateStructuredWithMastraAgent({
    agent: interviewReportEvaluationAgent,
    prompt: EVALUATION_PROMPT.replace(
      "{formResponses}",
      options.candidateFormResponses || "（无表单答复）",
    )
      .replace("{questions}", formatQuestions(options.questions))
      .replace("{transcript}", formatTranscript(options.transcript)),
    schema: evaluationSchema,
    temperature: 0,
  });
}

export async function generateInterviewReport(options: {
  candidateFormResponses: string;
  transcript: InterviewTranscriptTurn[];
  questions: InterviewQuestion[];
}): Promise<InterviewReportResult> {
  const { transcript, questions } = options;

  if (transcript.length === 0) {
    return { evaluation: null, summary: null };
  }

  const [summaryResult, evaluationResult] = await Promise.allSettled([
    generateInterviewSummary({ transcript }),
    generateInterviewEvaluation({
      candidateFormResponses: options.candidateFormResponses,
      questions,
      transcript,
    }),
  ]);

  return composeInterviewReport({ evaluationResult, summaryResult });
}
