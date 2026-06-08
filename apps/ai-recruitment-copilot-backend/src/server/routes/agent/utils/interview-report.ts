import { gateway, generateObject, generateText } from "ai";
import { z } from "zod";
import type { InterviewTranscriptTurn } from "@arc/db-schema/interview-session";
import type { InterviewQuestion } from "@arc/db-schema/interview/types";
import { createAlibabaProvider } from "@arc/ai-recruitment-copilot-backend/server/agents/provider";

const SUMMARY_PROMPT = `你是一位面试报告撰写助手。请根据以下面试对话记录，使用面试对话的主要语言撰写一段篇幅相当于中文 200-300 字的面试摘要。
摘要需包括：面试涉及的主要话题、候选人的整体表现、值得关注的亮点或不足，面试对话记录中，如果用户跳过了某个问题，则该问题视为0分。

## 面试对话记录
{transcript}`;

const EVALUATION_PROMPT = `你是一位专业的面试评估专家。请根据以下面试对话记录和面试题目，对候选人的表现进行结构化评估。

## 面试题目
{questions}

## 面试对话记录
{transcript}

请严格按照指定 JSON Schema 输出评估结果。

注意：
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

const evaluationSchema = z.object({
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

function formatTranscript(turns: InterviewTranscriptTurn[]): string {
  return turns
    .map((turn, index) => {
      const role = turn.role === "agent" ? "面试官" : "候选人";
      const time =
        typeof turn.timeInCallSecs === "number" ? ` time=${Math.round(turn.timeInCallSecs)}s` : "";
      return `[turnIndex=${index + 1}${time}] ${role}: ${turn.message}`;
    })
    .join("\n");
}

function formatQuestions(questions: InterviewQuestion[]): string {
  if (questions.length === 0) {
    return "（无补充题目）";
  }
  return questions.map((q) => `${q.order}. [${q.difficulty}] ${q.question}`).join("\n");
}

export interface InterviewReportResult {
  summary: string | null;
  evaluation: InterviewEvaluation | null;
  summaryError?: string;
  evaluationError?: string;
}

export async function generateInterviewReport(options: {
  transcript: InterviewTranscriptTurn[];
  questions: InterviewQuestion[];
}): Promise<InterviewReportResult> {
  const { transcript, questions } = options;

  if (transcript.length === 0) {
    return { evaluation: null, summary: null };
  }

  const provider = createAlibabaProvider({ enableThinking: false });
  const summaryModelId = process.env.ALIBABA_FAST_MODEL?.trim() || "deepseek-v4-flash";
  const evaluationModelId = process.env.INTERVIEW_EVALUATION_MODEL ?? "google/gemini-2.5-flash";

  const transcriptText = formatTranscript(transcript);
  const questionsText = formatQuestions(questions);

  const [summaryResult, evaluationResult] = await Promise.allSettled([
    generateText({
      model: provider(summaryModelId),
      prompt: SUMMARY_PROMPT.replace("{transcript}", transcriptText),
      temperature: 0.2,
    }),
    generateObject({
      model: gateway(evaluationModelId),
      prompt: EVALUATION_PROMPT.replace("{questions}", questionsText).replace(
        "{transcript}",
        transcriptText,
      ),
      schema: evaluationSchema,
      temperature: 0,
    }),
  ]);

  const result: InterviewReportResult = { evaluation: null, summary: null };

  if (summaryResult.status === "fulfilled") {
    result.summary = summaryResult.value.text.trim() || null;
  } else {
    result.summaryError =
      summaryResult.reason instanceof Error
        ? summaryResult.reason.message
        : String(summaryResult.reason);
  }

  if (evaluationResult.status === "fulfilled") {
    result.evaluation = evaluationResult.value.object;
  } else {
    result.evaluationError =
      evaluationResult.reason instanceof Error
        ? evaluationResult.reason.message
        : String(evaluationResult.reason);
  }

  return result;
}
