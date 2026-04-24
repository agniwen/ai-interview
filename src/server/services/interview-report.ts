import { generateObject, generateText } from "ai";
import { z } from "zod";
import type { InterviewTranscriptTurn } from "@/lib/interview-session";
import type { InterviewQuestion } from "@/lib/interview/types";
import { createAlibabaProvider } from "@/server/agents/provider";

const SUMMARY_PROMPT = `你是一位面试报告撰写助手。请根据以下面试对话记录，用中文撰写一段 200-300 字的面试摘要。
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
- 评价要客观具体，引用候选人的实际回答`;

const evaluationSchema = z.object({
  overallAssessment: z.string().describe("候选人整体表现的综合评价，2-3 句话"),
  overallScore: z.number().int().min(0).max(100),
  questions: z.array(
    z.object({
      assessment: z.string().describe("对候选人该题回答的评价"),
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
    .map((turn) => {
      const role = turn.role === "agent" ? "面试官" : "候选人";
      return `${role}: ${turn.message}`;
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
  const summaryModelId = process.env.ALIBABA_FAST_MODEL ?? "qwen-turbo";
  const structuredModelId = process.env.ALIBABA_STRUCTURED_MODEL ?? "qwen3-max";

  const transcriptText = formatTranscript(transcript);
  const questionsText = formatQuestions(questions);

  const [summaryResult, evaluationResult] = await Promise.allSettled([
    generateText({
      model: provider(summaryModelId),
      prompt: SUMMARY_PROMPT.replace("{transcript}", transcriptText),
      temperature: 0.2,
    }),
    generateObject({
      model: provider(structuredModelId),
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
