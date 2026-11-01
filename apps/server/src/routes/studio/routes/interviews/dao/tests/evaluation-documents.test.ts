import { describe, expect, it } from "vitest";
import { resolveEvaluationDocument } from "../evaluation-document-status";

const ANSWERED_RESULTS = {
  questions: [
    {
      answerSummary: "候选人回答了问题，但部分信息仍需确认。",
      difficulty: "medium" as const,
      endedAtSecs: 20,
      evaluationFocus: null,
      followUpCount: 1,
      followUpDirections: null,
      question: "请介绍最近一份工作。",
      questionId: "question-1",
      reason: null,
      revision: 1,
      startedAtSecs: 5,
      status: "insufficient" as const,
    },
  ],
  schemaVersion: 2 as const,
};

describe("resolveEvaluationDocument", () => {
  it("offers generation whenever an ended attempt has a usable answer", () => {
    expect(
      resolveEvaluationDocument(
        {
          conversationId: "conversation-1",
          dataCollectionResults: ANSWERED_RESULTS,
          summaryStatus: "failed",
        },
        new Map(),
      ),
    ).toEqual({ status: "answers_available", url: null });
  });

  it("keeps generated documents primary", () => {
    expect(
      resolveEvaluationDocument(
        {
          conversationId: "conversation-1",
          dataCollectionResults: ANSWERED_RESULTS,
          summaryStatus: "failed",
        },
        new Map([["conversation-1", "https://example.feishu.cn/docx/document-1"]]),
      ),
    ).toEqual({
      status: "generated",
      url: "https://example.feishu.cn/docx/document-1",
    });
  });

  it("offers generation when answer summarization failed after an answered outcome", () => {
    expect(
      resolveEvaluationDocument(
        {
          conversationId: "conversation-1",
          dataCollectionResults: {
            ...ANSWERED_RESULTS,
            questions: [{ ...ANSWERED_RESULTS.questions[0], answerSummary: null }],
          },
          summaryStatus: "failed",
        },
        new Map(),
      ),
    ).toEqual({ status: "answers_available", url: null });
  });
});
