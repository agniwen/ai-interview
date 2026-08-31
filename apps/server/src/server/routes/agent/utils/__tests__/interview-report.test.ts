import { beforeEach, describe, expect, it, vi } from "vitest";
import type { InterviewTranscriptTurn } from "@arc/db-schema/interview-session";
import type { InterviewDataCollectionResults } from "@arc/shared/interview/question-outcomes";
import {
  applyInterviewReportAnswerFallback,
  applyQuestionOutcomesToEvaluation,
  buildFallbackInterviewEvaluation,
  buildFallbackInterviewSummary,
  buildInterviewEvaluationPrompt,
  formatCandidateFormSubmissions,
  generateInterviewEvaluation,
  generateInterviewReport,
  normalizeInterviewEvaluationOutput,
} from "../interview-report";
import type { InterviewEvaluationQuestion } from "../interview-report";

const generateEvaluation = vi.fn();
const generateSummary = vi.fn();
const dependencies = { generateEvaluation, generateSummary };

const TRANSCRIPT: InterviewTranscriptTurn[] = [
  { message: "请介绍你的项目。", role: "agent", timeInCallSecs: 1 },
  { message: "我负责招聘系统前端。", role: "user", timeInCallSecs: 6 },
];

const QUESTIONS: InterviewEvaluationQuestion[] = [
  { difficulty: "easy", order: 1, question: "请介绍你的项目。", questionId: "question-1" },
];

const EVALUATION = {
  hrEvaluation: {
    availability: "目前在职，预计一个月内到岗。",
    careerProgression: "上一家公司晋升一次，最近绩效为 A。",
    compensationExpectations: "目前年包 50 万，期望年包 60 万。",
    jobMotivation: "希望承担更完整的系统架构职责。",
    overseasTravel: "已婚，可接受每次两周以内的海外出差。",
    projectHighlights: "主导招聘系统从零到一建设。",
    recentWork: "最近两家公司均为约 200 人规模，主要担任项目主导者。",
  },
  overallAssessment: "候选人表达清晰。",
  overallScore: 82,
  questions: [
    {
      assessment: "回答覆盖项目背景。",
      evidence: [{ quote: "我负责招聘系统前端。", timeInCallSecs: 6, turnIndex: 2 }],
      maxScore: 10,
      order: 1,
      question: "请介绍你的项目。",
      questionId: "question-1",
      score: 8,
    },
  ],
  recommendation: "建议进入下一轮" as const,
};

describe("generateInterviewReport", () => {
  beforeEach(() => {
    generateEvaluation.mockReset();
    generateSummary.mockReset();
  });

  it("returns empty report when transcript is empty", async () => {
    await expect(
      generateInterviewReport(
        { candidateFormResponses: "", questions: QUESTIONS, transcript: [] },
        dependencies,
      ),
    ).resolves.toEqual({
      evaluation: null,
      summary: null,
    });
    expect(generateSummary).not.toHaveBeenCalled();
    expect(generateEvaluation).not.toHaveBeenCalled();
  });

  it("generates summary and structured evaluation with Mastra agents", async () => {
    generateSummary.mockResolvedValue(" 面试摘要 ");
    generateEvaluation.mockResolvedValue(EVALUATION);

    await expect(
      generateInterviewReport(
        {
          candidateFormResponses: "当前求职状态：在职，一个月内到岗",
          questions: QUESTIONS,
          transcript: TRANSCRIPT,
        },
        dependencies,
      ),
    ).resolves.toEqual({
      evaluation: EVALUATION,
      summary: "面试摘要",
    });

    expect(generateSummary).toHaveBeenCalledWith({ transcript: TRANSCRIPT });
    expect(generateEvaluation).toHaveBeenCalledWith({
      candidateFormResponses: "当前求职状态：在职，一个月内到岗",
      dataCollectionResults: undefined,
      questions: QUESTIONS,
      transcript: TRANSCRIPT,
    });
    expect(
      buildInterviewEvaluationPrompt({
        candidateFormResponses: "当前求职状态：在职，一个月内到岗",
        questions: QUESTIONS,
        transcript: TRANSCRIPT,
      }),
    ).toMatch(
      /当前求职状态：在职，一个月内到岗[\s\S]*年龄、成家情况、是否可以接受短期海外出差及周期[\s\S]*hrEvaluation\.projectHighlights：候选人分享的亮点项目/,
    );
  });

  it("preserves partial success when evaluation fails", async () => {
    generateSummary.mockResolvedValue("摘要");
    generateEvaluation.mockRejectedValue(new Error("evaluation failed"));

    await expect(
      generateInterviewReport(
        {
          candidateFormResponses: "",
          questions: QUESTIONS,
          transcript: TRANSCRIPT,
        },
        dependencies,
      ),
    ).resolves.toEqual({
      evaluation: null,
      evaluationError: "evaluation failed",
      summary: "摘要",
    });
  });

  it("enables one invalid-output retry for the structured evaluation", async () => {
    const generate = vi.fn().mockResolvedValue(EVALUATION);

    await expect(
      generateInterviewEvaluation(
        {
          candidateFormResponses: "",
          questions: QUESTIONS,
          transcript: TRANSCRIPT,
        },
        generate,
      ),
    ).resolves.toEqual(EVALUATION);

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({
        fallbackToTextGeneration: true,
        maxOutputTokens: 8192,
        normalizeInvalid: expect.any(Function),
        observabilityLabel: "interview-report-evaluation-v1",
        retryOnInvalid: true,
        retryOnTransient: true,
        retryTextJsonOnInvalid: true,
        temperature: 0,
        timeoutMs: 120_000,
      }),
    );
  });

  it("normalizes the observed questionEvaluations model alias", () => {
    const aliased = {
      ...EVALUATION,
      questionEvaluations: [
        {
          assessment: "回答覆盖项目背景。",
          evidence: EVALUATION.questions[0]?.evidence,
          questionId: "question-1",
        },
      ],
      questions: undefined,
    };

    expect(normalizeInterviewEvaluationOutput(aliased, QUESTIONS)).toEqual({
      ...aliased,
      questions: [
        {
          assessment: "回答覆盖项目背景。",
          evidence: EVALUATION.questions[0]?.evidence,
          order: 1,
          question: "请介绍你的项目。",
          questionId: "question-1",
          score: null,
        },
      ],
    });
  });

  it("fills omitted nullable HR fields and derives a safe assessment from question outcomes", () => {
    const outcomes: InterviewDataCollectionResults = {
      questions: [
        {
          answerSummary: null,
          difficulty: "easy",
          endedAtSecs: 30,
          evaluationFocus: null,
          followUpCount: 2,
          followUpDirections: null,
          question: QUESTIONS[0]?.question ?? "",
          questionId: "question-1",
          reason: null,
          revision: 3,
          startedAtSecs: 1,
          status: "insufficient",
        },
      ],
      schemaVersion: 2,
    };
    const normalized = normalizeInterviewEvaluationOutput(
      {
        ...EVALUATION,
        hrEvaluation: { jobMotivation: "希望承担完整项目。" },
        questions: [{ evidence: [], questionId: "question-1" }],
      },
      QUESTIONS,
      outcomes,
    );

    expect(normalized).toMatchObject({
      hrEvaluation: {
        availability: null,
        careerProgression: null,
        compensationExpectations: null,
        jobMotivation: "希望承担完整项目。",
        overseasTravel: null,
        projectHighlights: null,
        recentWork: null,
      },
      questions: [
        {
          assessment: "经 2 次追问后，现有信息仍不足。",
          order: 1,
          question: "请介绍你的项目。",
          questionId: "question-1",
          score: null,
        },
      ],
    });
  });

  it("formats candidate form answers with option labels for HR extraction", () => {
    expect(
      formatCandidateFormSubmissions([
        {
          answers: {
            availability: "one_month",
            travel: ["short_term", "overseas"],
          },
          snapshot: {
            description: null,
            jobDescriptionIds: [],
            questions: [
              {
                displayMode: "select",
                helperText: null,
                id: "availability",
                label: "最快到岗时间",
                options: [{ label: "一个月内", value: "one_month" }],
                required: true,
                sortOrder: 1,
                type: "single",
              },
              {
                displayMode: "checkbox",
                helperText: null,
                id: "travel",
                label: "可接受出差情况",
                options: [
                  { label: "短期", value: "short_term" },
                  { label: "海外", value: "overseas" },
                ],
                required: true,
                sortOrder: 2,
                type: "multi",
              },
            ],
            scope: "global",
            templateId: "form-1",
            title: "候选人信息",
          },
          submittedAt: "2026-07-20T10:00:00.000Z",
          templateId: "form-1",
          version: 1,
          versionId: "version-1",
        },
      ]),
    ).toBe("【候选人信息】\n最快到岗时间：一个月内\n可接受出差情况：短期、海外");
  });

  it("derives scores only from scorable V2 question outcomes", () => {
    const outcomes: InterviewDataCollectionResults = {
      questions: [
        {
          answerSummary: "回答完整",
          difficulty: "easy",
          endedAtSecs: 20,
          evaluationFocus: null,
          followUpCount: 0,
          followUpDirections: null,
          question: "题目一",
          questionId: "q1",
          reason: null,
          revision: 1,
          startedAtSecs: 1,
          status: "answered",
        },
        {
          answerSummary: "信息有限",
          difficulty: "medium",
          endedAtSecs: 40,
          evaluationFocus: "验证技术深度",
          followUpCount: 2,
          followUpDirections: null,
          question: "题目二",
          questionId: "q2",
          reason: null,
          revision: 1,
          startedAtSecs: 21,
          status: "insufficient",
        },
        {
          answerSummary: null,
          difficulty: "easy",
          endedAtSecs: 50,
          evaluationFocus: null,
          followUpCount: 0,
          followUpDirections: null,
          question: "题目三",
          questionId: "q3",
          reason: null,
          revision: 1,
          startedAtSecs: 41,
          status: "skipped",
        },
        {
          answerSummary: null,
          difficulty: "hard",
          endedAtSecs: 60,
          evaluationFocus: null,
          followUpCount: 0,
          followUpDirections: null,
          question: "题目四",
          questionId: "q4",
          reason: "time_limit",
          revision: 1,
          startedAtSecs: 51,
          status: "interrupted",
        },
        {
          answerSummary: null,
          difficulty: "hard",
          endedAtSecs: 60,
          evaluationFocus: null,
          followUpCount: 0,
          followUpDirections: null,
          question: "题目五",
          questionId: "q5",
          reason: "time_limit",
          revision: 1,
          startedAtSecs: 60,
          status: "unasked",
        },
      ],
      schemaVersion: 2,
    };
    const evaluation = {
      ...EVALUATION,
      questions: [
        { ...EVALUATION.questions[0], order: 1, question: "题目一", questionId: "q1", score: 8 },
        { ...EVALUATION.questions[0], order: 2, question: "题目二", questionId: "q2", score: 4 },
        { ...EVALUATION.questions[0], order: 3, question: "题目三", questionId: "q3", score: 7 },
        { ...EVALUATION.questions[0], order: 4, question: "题目四", questionId: "q4", score: 9 },
        { ...EVALUATION.questions[0], order: 5, question: "题目五", questionId: "q5", score: 9 },
      ],
    };

    const result = applyQuestionOutcomesToEvaluation(evaluation, outcomes);

    expect(result.overallScore).toBe(40);
    expect(result.questions.map((question) => question.score)).toEqual([8, 4, 0, null, null]);
    expect(result.questions[2]?.evidence).toEqual(evaluation.questions[2]?.evidence);
    expect(result.questions[3]?.evidence).toEqual(evaluation.questions[3]?.evidence);
    expect(result.questions[4]?.evidence).toEqual([]);
    expect(result.recommendation).toBe("建议进入下一轮");
  });

  it("forces a pending recommendation when fewer than half the required questions are scorable", () => {
    const outcomes: InterviewDataCollectionResults = {
      questions: [
        {
          answerSummary: "回答完整",
          difficulty: "easy",
          endedAtSecs: 20,
          evaluationFocus: null,
          followUpCount: 0,
          followUpDirections: null,
          question: "题目一",
          questionId: "q1",
          reason: null,
          revision: 1,
          startedAtSecs: 1,
          status: "answered",
        },
        ...["q2", "q3"].map((questionId, index) => ({
          answerSummary: null,
          difficulty: "easy" as const,
          endedAtSecs: 30 + index,
          evaluationFocus: null,
          followUpCount: 0,
          followUpDirections: null,
          question: `题目${index + 2}`,
          questionId,
          reason: "time_limit" as const,
          revision: 1,
          startedAtSecs: 20 + index,
          status: "unasked" as const,
        })),
      ],
      schemaVersion: 2,
    };

    const result = applyQuestionOutcomesToEvaluation(
      {
        ...EVALUATION,
        questions: [
          { ...EVALUATION.questions[0], questionId: "q1" },
          { ...EVALUATION.questions[0], order: 2, questionId: "q2" },
          { ...EVALUATION.questions[0], order: 3, questionId: "q3" },
        ],
      },
      outcomes,
    );

    expect(result.overallScore).toBe(80);
    expect(result.recommendation).toBe("待定");
  });

  it("keeps canonical question outcomes when answers stay missing or the interview ends early", () => {
    const outcomes: InterviewDataCollectionResults = {
      questions: [
        {
          answerSummary: null,
          difficulty: "medium",
          endedAtSecs: 30,
          evaluationFocus: "核实关键信息",
          followUpCount: 2,
          followUpDirections: "信息缺失时继续追问",
          question: "追问后仍未获得信息的问题",
          questionId: "insufficient-after-follow-up",
          reason: null,
          revision: 3,
          startedAtSecs: 1,
          status: "insufficient",
        },
        {
          answerSummary: "候选人仅回答了前半部分",
          difficulty: "hard",
          endedAtSecs: 60,
          evaluationFocus: null,
          followUpCount: 1,
          followUpDirections: null,
          question: "超时前未完整回答的问题",
          questionId: "interrupted-by-timeout",
          reason: "time_limit",
          revision: 2,
          startedAtSecs: 31,
          status: "interrupted",
        },
        {
          answerSummary: null,
          difficulty: "easy",
          endedAtSecs: 60,
          evaluationFocus: null,
          followUpCount: 0,
          followUpDirections: null,
          question: "超时后未问到的问题",
          questionId: "unasked-by-timeout",
          reason: "time_limit",
          revision: 1,
          startedAtSecs: 60,
          status: "unasked",
        },
      ],
      schemaVersion: 2,
    };
    const result = applyQuestionOutcomesToEvaluation(
      {
        ...EVALUATION,
        questions: [
          {
            ...EVALUATION.questions[0],
            evidence: [{ quote: "我只回答了前半部分。" }],
            questionId: "interrupted-by-timeout",
            score: 8,
          },
          {
            ...EVALUATION.questions[0],
            evidence: [{ quote: "这条证据不应存在。" }],
            questionId: "unasked-by-timeout",
            score: 9,
          },
        ],
      },
      outcomes,
    );

    expect(result.questions.map((question) => question.questionId)).toEqual([
      "insufficient-after-follow-up",
      "interrupted-by-timeout",
      "unasked-by-timeout",
    ]);
    expect(result.questions[0]).toMatchObject({
      assessment: "报告未能生成本题评估。",
      evidence: [],
      score: null,
    });
    expect(result.questions[1]).toMatchObject({
      assessment: "本题在完成前被中断，不参与评分。",
      evidence: [{ quote: "我只回答了前半部分。" }],
      score: null,
    });
    expect(result.questions[2]).toMatchObject({
      assessment: "本轮面试结束前未开始本题，不参与评分。",
      evidence: [],
      score: null,
    });
  });

  it("does not score a question whose prompt was interrupted", () => {
    const result = applyQuestionOutcomesToEvaluation(EVALUATION, {
      questions: [
        {
          answerSummary: null,
          difficulty: "medium",
          endedAtSecs: 88.4,
          evaluationFocus: "核实最近两份工作",
          followUpCount: 0,
          followUpDirections: null,
          question: "请提供最近两份工作的岗位、汇报线和薪酬。",
          questionId: "question-1",
          reason: "question_prompt_interrupted",
          revision: 1,
          startedAtSecs: 86.9,
          status: "interrupted",
        },
      ],
      schemaVersion: 2,
    });

    expect(result.questions[0]).toMatchObject({
      assessment: "题目播报未完成，未获得有效回答，不参与评分。",
      evidence: [],
      score: null,
    });
  });
});

describe("fallback interview report", () => {
  const insufficientResults: InterviewDataCollectionResults = {
    questions: [
      {
        answerSummary: "候选人说明岗位是项目产品负责人，但没有提供团队和薪酬信息。",
        difficulty: "medium",
        endedAtSecs: 30,
        evaluationFocus: "岗位、团队与薪酬",
        followUpCount: 2,
        followUpDirections: null,
        question: "请介绍最近两份工作。",
        questionId: "question-1",
        reason: null,
        revision: 1,
        startedAtSecs: 5,
        status: "insufficient",
      },
    ],
    schemaVersion: 2,
  };

  it("builds a transparent review from answered question outcomes", () => {
    expect(buildFallbackInterviewSummary(insufficientResults)).toContain(
      "已收集 1 道题的候选人回答",
    );
    expect(buildFallbackInterviewEvaluation(insufficientResults)).toEqual(
      expect.objectContaining({
        overallScore: null,
        questions: [
          expect.objectContaining({
            assessment: "信息不足：候选人说明岗位是项目产品负责人，但没有提供团队和薪酬信息。",
            questionId: "question-1",
            score: null,
          }),
        ],
        recommendation: "待定",
      }),
    );
  });

  it("completes a partially failed model report without overwriting successful output", () => {
    const completed = applyInterviewReportAnswerFallback(
      {
        evaluation: null,
        evaluationError: "invalid structured output",
        summary: "模型摘要已成功生成。",
      },
      insufficientResults,
    );

    expect(completed.summary).toBe("模型摘要已成功生成。");
    expect(completed.evaluation?.recommendation).toBe("待定");
    expect(completed.evaluationError).toBe("invalid structured output");
  });
});
