import { describe, expect, it } from "vitest";
import type { StudioInterviewConversationReport } from "@app/db-schema/interview-session";
import {
  getCollectedCandidateInfoItems,
  getReportFormItems,
} from "./studio-person-detail-sections";

describe("getReportFormItems", () => {
  it("uses the form answers frozen with the selected interview report", () => {
    // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
    const report = {
      snapshotMetadata: {
        fullTextInput: {
          formSubmissions: [
            {
              answers: [
                {
                  label: "期望到岗时间",
                  questionId: "question-1",
                  valueText: "两周内",
                },
              ],
              templateId: "template-1",
            },
          ],
        },
      },
    } as StudioInterviewConversationReport;

    expect(getReportFormItems(report)).toEqual([
      {
        analysis: null,
        answers: ["两周内"],
        id: "form-0-template-1-question-1",
        kind: "form",
        question: "期望到岗时间",
        sequence: 1,
      },
    ]);
  });

  it("returns null when an older report has no evidence snapshot", () => {
    // SAFETY: The test fixture is constructed with the asserted shape before this boundary.
    expect(getReportFormItems({} as StudioInterviewConversationReport)).toBeNull();
  });
});

const OUTCOME_BASE = {
  answerSummary: null,
  difficulty: "medium",
  evaluationFocus: "确认候选人能够定位并复盘线上故障",
  followUpDirections: null,
  revision: 1,
} as const;

describe("getCollectedCandidateInfoItems", () => {
  it("fuses V2 question outcomes with the evaluation's score, quotes and analysis", () => {
    const { interviewItems } = getCollectedCandidateInfoItems({
      evaluation: {
        questions: [
          {
            assessment: "回答覆盖了完整排障链路",
            evidence: [{ quote: "我先看告警，再定位根因" }],
            question: "请介绍故障排查经历",
            questionId: "question-1",
            score: 8,
          },
        ],
      },
      formSubmissions: [],
      outcomes: [
        {
          ...OUTCOME_BASE,
          endedAtSecs: 48,
          followUpCount: 1,
          question: "请介绍故障排查经历",
          questionId: "question-1",
          reason: null,
          startedAtSecs: 12,
          status: "answered",
        },
      ],
    });

    expect(interviewItems).toEqual([
      expect.objectContaining({
        analysis: "回答覆盖了完整排障链路",
        answers: ["我先看告警，再定位根因"],
        outcome: {
          durationSecs: 36,
          followUpCount: 1,
          maxScore: 10,
          reason: null,
          score: 8,
          status: "answered",
        },
        question: "请介绍故障排查经历",
      }),
    ]);
  });

  it("still lists every question when evaluation generation failed", () => {
    const { interviewItems } = getCollectedCandidateInfoItems({
      evaluation: {},
      formSubmissions: [],
      outcomes: [
        {
          ...OUTCOME_BASE,
          endedAtSecs: 20,
          followUpCount: 0,
          question: "尚未生成评估的题目",
          questionId: "question-1",
          reason: "time_limit",
          startedAtSecs: 10,
          status: "interrupted",
        },
      ],
    });

    expect(interviewItems).toEqual([
      expect.objectContaining({
        analysis: null,
        answers: [],
        outcome: expect.objectContaining({ score: null, status: "interrupted" }),
        question: "尚未生成评估的题目",
      }),
    ]);
  });
});
