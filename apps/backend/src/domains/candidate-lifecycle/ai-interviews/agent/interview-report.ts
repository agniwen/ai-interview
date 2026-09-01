/* oxlint-disable anti-slop/no-conditional-empty-object-spread, anti-slop/no-runtime-typeof, anti-slop/no-unknown-parameters, anti-slop/no-unsafe-dictionary-type, anti-slop/require-safety-comment-for-type-assertion, no-nested-ternary, no-plusplus -- Legacy AI report payloads are recursively normalized from versioned provider JSON while preserving omission semantics and stable array traversal. */
import { rawBackendEnvironment } from "../../../../config/raw-backend-environment.js";
import { Agent } from "@mastra/core/agent";
import { z } from "zod";
import type { InterviewEvidenceSnapshotPayload } from "@arc/db-schema/interview-snapshots";
import type { InterviewTranscriptTurn } from "@arc/db-schema/interview-session";
import { interviewKeyInformationSchema } from "@arc/db-schema/interview-key-information";
import { formatCandidateFormAnswer } from "@arc/shared/candidate-form-answer";
import {
  hasExistingInterviewAnswers,
  parseInterviewDataCollectionResults,
} from "@arc/shared/interview/question-outcomes";
import type { InterviewDataCollectionResults } from "@arc/shared/interview/question-outcomes";

const evidenceSchema = z.object({
  quote: z.string().min(1).max(500),
  timeInCallSecs: z.number().int().min(0).nullable().optional(),
  turnIndex: z.number().int().min(1).nullable().optional(),
});

export const interviewEvaluationSchema = z.object({
  hrEvaluation: z.object({
    availability: z.string().nullable(),
    careerProgression: z.string().nullable(),
    compensationExpectations: z.string().nullable(),
    jobMotivation: z.string().nullable(),
    overseasTravel: z.string().nullable(),
    projectHighlights: z.string().nullable(),
    recentWork: z.string().nullable(),
  }),
  overallAssessment: z.string(),
  overallScore: z.number().int().min(0).max(100).nullable(),
  questions: z.array(
    z.object({
      assessment: z.string(),
      evidence: z.array(evidenceSchema).default([]),
      maxScore: z.number().int().default(10),
      order: z.number().int(),
      question: z.string(),
      questionId: z.string().min(1),
      score: z.number().int().min(0).max(10).nullable(),
    }),
  ),
  recommendation: z.enum(["建议进入下一轮", "不建议进入下一轮", "待定"]),
});

export const INTERVIEW_REPORT_EVALUATION_VERSION = "interview-report-evaluation-v1";

type Evaluation = z.infer<typeof interviewEvaluationSchema>;
interface Question {
  difficulty: string;
  evaluationFocus?: string | null;
  followUpDirections?: string | null;
  order: number;
  question: string;
  questionId: string;
}

function model() {
  return {
    apiKey: rawBackendEnvironment.ALIBABA_API_KEY?.trim(),
    modelId:
      rawBackendEnvironment.MASTRA_STRUCTURED_MODEL?.trim() ||
      rawBackendEnvironment.ALIBABA_STRUCTURED_MODEL?.trim() ||
      rawBackendEnvironment.ALIBABA_MODEL?.trim() ||
      "deepseek-v4-flash-0731",
    providerId: "alibaba",
    url:
      rawBackendEnvironment.ALIBABA_BASE_URL?.trim() ||
      "https://dashscope.aliyuncs.com/compatible-mode/v1",
  };
}

function reportAgent(kind: "evaluation" | "key-information" | "summary") {
  return new Agent({
    id: `top-level-interview-report-${kind}`,
    instructions:
      kind === "summary"
        ? "你是面试报告撰写助手，负责根据面试 transcript 生成摘要。"
        : kind === "key-information"
          ? "你是面试重点信息提取助手，只提取候选人对话中的关键技能证据、量化信息和风险。"
          : "你是专业面试评估专家，负责根据面试 transcript 和题目生成结构化评价。",
    maxRetries: 1,
    model: model(),
    name: `TopLevelInterviewReport${kind === "summary" ? "Summary" : "Evaluation"}`,
  });
}

function transcriptText(transcript: InterviewTranscriptTurn[]) {
  return transcript
    .map((turn, index) => {
      const time =
        turn.timeInCallSecs === undefined ? "" : ` time=${Math.round(turn.timeInCallSecs)}s`;
      return `[turnIndex=${index + 1}${time}] ${turn.role === "agent" ? "面试官" : "候选人"}: ${turn.message}`;
    })
    .join("\n");
}

export function evaluationQuestions(context: InterviewEvidenceSnapshotPayload["context"]) {
  let order = 1;
  return context.questionTemplates
    .filter((template) => !template.disabledByUser)
    .toSorted((left, right) => left.sortOrder - right.sortOrder)
    .flatMap((template) =>
      [...template.snapshot.questions]
        .toSorted((left, right) => left.sortOrder - right.sortOrder)
        .flatMap((question) => {
          const content = question.content.trim();
          if (!content) {
            return [];
          }
          return [
            {
              difficulty: question.difficulty,
              evaluationFocus: question.evaluationFocus,
              followUpDirections: question.followUpDirections,
              order: order++,
              question: content,
              questionId: question.id,
            },
          ];
        }),
    );
}

export function formResponses(payload: InterviewEvidenceSnapshotPayload) {
  return payload.formSubmissions
    .flatMap((submission) => {
      const answers = submission.snapshot.questions.flatMap((question) => {
        const value = formatCandidateFormAnswer(question, submission.answers[question.id]);
        return value ? [`${question.label}：${value}`] : [];
      });
      return answers.length ? [`【${submission.snapshot.title}】\n${answers.join("\n")}`] : [];
    })
    .join("\n\n");
}

function questionText(questions: Question[], outcomes: InterviewDataCollectionResults | null) {
  const byId = new Map(outcomes?.questions.map((outcome) => [outcome.questionId, outcome]));
  return questions
    .map((question) => {
      const outcome = byId.get(question.questionId);
      return `${question.order}. [${question.difficulty}] ${question.question}\n   题目ID：${question.questionId}${question.evaluationFocus ? `\n   考核点：${question.evaluationFocus}` : ""}${question.followUpDirections ? `\n   追问方向：${question.followUpDirections}` : ""}${outcome ? `\n   流程结果：${outcome.status}` : ""}`;
    })
    .join("\n");
}

export function normalizeInterviewEvaluationOutput(value: unknown, questions: Question[]) {
  if (!(value && typeof value === "object" && !Array.isArray(value))) {
    return value;
  }
  const raw = value as Record<string, unknown>;
  const rawQuestions = Array.isArray(raw.questions)
    ? raw.questions
    : Array.isArray(raw.questionEvaluations)
      ? raw.questionEvaluations
      : [];
  const byId = new Map(questions.map((question) => [question.questionId, question]));
  return {
    ...raw,
    hrEvaluation: {
      availability: null,
      careerProgression: null,
      compensationExpectations: null,
      jobMotivation: null,
      overseasTravel: null,
      projectHighlights: null,
      recentWork: null,
      ...(raw.hrEvaluation && typeof raw.hrEvaluation === "object" ? raw.hrEvaluation : {}),
    },
    questions: rawQuestions.map((item) => {
      if (!(item && typeof item === "object" && !Array.isArray(item))) {
        return item;
      }
      const record = item as Record<string, unknown>;
      const configured = typeof record.questionId === "string" ? byId.get(record.questionId) : null;
      return configured
        ? {
            ...record,
            assessment:
              typeof record.assessment === "string" && record.assessment.trim()
                ? record.assessment
                : "报告未能生成本题评估。",
            order: Number.isInteger(record.order) ? record.order : configured.order,
            question:
              typeof record.question === "string" && record.question.trim()
                ? record.question
                : configured.question,
            score: record.score === undefined ? null : record.score,
          }
        : item;
    }),
  };
}

export function applyQuestionOutcomesToEvaluation(
  evaluation: Evaluation,
  outcomes: InterviewDataCollectionResults | null,
) {
  if (!outcomes) {
    return evaluation;
  }
  const generated = new Map(
    evaluation.questions.map((question) => [question.questionId, question]),
  );
  const questions = outcomes.questions.map((outcome, index) => {
    const base = generated.get(outcome.questionId) ?? {
      assessment: "报告未能生成本题评估。",
      evidence: [],
      maxScore: 10,
      order: index + 1,
      question: outcome.question,
      questionId: outcome.questionId,
      score: null,
    };
    if (outcome.status === "skipped") {
      return { ...base, assessment: "候选人明确跳过本题。", score: 0 };
    }
    if (outcome.status === "interrupted") {
      return outcome.reason === "question_prompt_interrupted"
        ? {
            ...base,
            assessment: "题目播报未完成，未获得有效回答，不参与评分。",
            evidence: [],
            score: null,
          }
        : { ...base, assessment: "本题在完成前被中断，不参与评分。", score: null };
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
  const scorable = new Set(
    outcomes.questions
      .filter((outcome) => ["answered", "insufficient", "skipped"].includes(outcome.status))
      .map((outcome) => outcome.questionId),
  );
  const overallScore = scorable.size
    ? Math.round(
        questions.reduce(
          (total, question) =>
            total +
            (scorable.has(question.questionId) && question.score !== null
              ? (question.score / question.maxScore) * 100
              : 0),
          0,
        ) / scorable.size,
      )
    : null;
  return {
    ...evaluation,
    overallScore,
    questions,
    recommendation:
      outcomes.questions.length > 0 && scorable.size / outcomes.questions.length < 0.5
        ? ("待定" as const)
        : evaluation.recommendation,
  };
}

function fallbackEvaluation(outcomes: InterviewDataCollectionResults): Evaluation {
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
    overallAssessment: "结构化评价未能生成，当前报告仅展示已收集事实，请人工复核。",
    overallScore: null,
    questions: outcomes.questions.map((outcome, index) => ({
      assessment:
        outcome.status === "answered"
          ? outcome.answerSummary
            ? `已收集回答：${outcome.answerSummary}`
            : "候选人已回答本题，但未能生成回答摘要。"
          : outcome.status === "skipped"
            ? "候选人明确跳过本题。"
            : "本题未获得足够信息，不参与评分。",
      evidence: [],
      maxScore: 10,
      order: index + 1,
      question: outcome.question,
      questionId: outcome.questionId,
      score: outcome.status === "skipped" ? 0 : null,
    })),
    recommendation: "待定",
  };
}

export async function generateInterviewReport(input: {
  candidateFormResponses: string;
  dataCollectionResults: unknown;
  questions: Question[];
  transcript: InterviewTranscriptTurn[];
}) {
  if (input.transcript.length === 0) {
    return { evaluation: null, summary: null };
  }
  const outcomes = parseInterviewDataCollectionResults(input.dataCollectionResults);
  const transcript = transcriptText(input.transcript);
  const summaryPrompt = `请根据以下面试对话记录，使用面试对话的主要语言撰写中文 200-300 字的面试摘要，覆盖主要话题、候选人整体表现、亮点、不足；候选人明确跳过的问题按 0 分处理。\n\n${transcript}`;
  const evaluationPrompt = `根据候选人面试前表单答复、面试题和对话生成结构化评估。hrEvaluation 只能汇总候选人在表单或本人对话中明确表达的信息，不能从简历、面试官话术或常识推测；没有信息必须为 null。同一主题在表单与语音中的信息应合并为完整事实。jobMotivation 包含离职原因和看机会关注点；availability 包含当前 base、求职状态和到岗时间；overseasTravel 包含候选人明确披露的短期海外出差接受度和周期；compensationExpectations 包含候选人明确披露的薪酬结构与期望；careerProgression 包含绩效、加薪或晋升及原因；recentWork 包含最近两份工作的角色、团队分工和离职原因；projectHighlights 包含候选人分享的亮点项目。只评估实际提问的题目，questions 每项必须原样返回 questionId、order、question、score，不能使用 questionEvaluations 别名。answered/insufficient 仅依据原始转写证据评分；skipped 为 0 分；interrupted/unasked 不参与评分。evidence 最多两条候选人原话并保留 turnIndex/timeInCallSecs；skipped 只引用明确拒答原话，interrupted 只保留已有上下文，unasked 不生成 evidence。自由文本使用对话的主要语言，recommendation 保持指定中文枚举。\n\n## 表单答复\n${input.candidateFormResponses || "（无）"}\n\n## 面试题\n${questionText(input.questions, outcomes)}\n\n## 对话\n${transcript}`;
  const [summaryResult, evaluationResult] = await Promise.allSettled([
    reportAgent("summary").generate(summaryPrompt, { modelSettings: { temperature: 0.2 } }),
    reportAgent("evaluation").generate(evaluationPrompt, {
      modelSettings: { maxOutputTokens: 8192, temperature: 0 },
      structuredOutput: { schema: interviewEvaluationSchema },
    }),
  ]);
  const summary =
    summaryResult.status === "fulfilled" ? summaryResult.value.text.trim() || null : null;
  let evaluation: Evaluation | null = null;
  if (evaluationResult.status === "fulfilled") {
    const generated =
      evaluationResult.value.object ??
      (() => {
        try {
          return JSON.parse(evaluationResult.value.text);
        } catch {
          return null;
        }
      })();
    const parsed = interviewEvaluationSchema.safeParse(
      normalizeInterviewEvaluationOutput(generated, input.questions),
    );
    if (parsed.success) {
      evaluation = applyQuestionOutcomesToEvaluation(parsed.data, outcomes);
    }
  }
  if (!evaluation && outcomes && hasExistingInterviewAnswers(outcomes)) {
    evaluation = fallbackEvaluation(outcomes);
  }
  return {
    evaluation,
    evaluationError:
      evaluationResult.status === "rejected" ? String(evaluationResult.reason) : undefined,
    summary:
      summary ??
      (outcomes && hasExistingInterviewAnswers(outcomes)
        ? "结构化摘要未能生成，当前报告仅展示已收集事实，请人工复核。"
        : null),
    summaryError: summaryResult.status === "rejected" ? String(summaryResult.reason) : undefined,
  };
}

export async function generateInterviewKeyInformation(input: {
  context: InterviewEvidenceSnapshotPayload["context"];
  transcript: InterviewTranscriptTurn[];
}) {
  if (input.transcript.length === 0) {
    return { quantitativeInformation: [], risks: [], skillEvidence: [] };
  }
  const questions = evaluationQuestions(input.context);
  const jobContext = [
    input.context.candidate.targetRole ? `目标岗位：${input.context.candidate.targetRole}` : null,
    input.context.jobDescription?.name ? `岗位名称：${input.context.jobDescription.name}` : null,
    input.context.jobDescription?.prompt ? `岗位 JD：${input.context.jobDescription.prompt}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const prompt = `使用岗位上下文判断重要性，但只能把候选人在本轮对话中明确表达的内容作为重点信息。skillEvidence、quantitativeInformation、risks 每类最多 3 条；每条必须包含 1-2 条逐字候选人原话证据。risks.type 只能为 observed 或 needs_verification。不得输出推进建议、录用建议、总体评价或分数；不得收录年龄、婚育和家庭情况；未核实陈述必须归因为候选人自述；没有可靠信息输出空数组。\n\n## 岗位上下文\n${jobContext || "（无岗位上下文）"}\n\n## 面试题与考核点\n${questionText(questions, null) || "（无面试题上下文）"}\n\n## 本轮面试对话\n${transcriptText(input.transcript)}`;
  const result = await reportAgent("key-information").generate(prompt, {
    modelSettings: { maxOutputTokens: 4096, temperature: 0 },
    structuredOutput: { schema: interviewKeyInformationSchema },
  });
  const generated =
    result.object ??
    (() => {
      try {
        return JSON.parse(result.text);
      } catch {
        return null;
      }
    })();
  return interviewKeyInformationSchema.parse(generated);
}
