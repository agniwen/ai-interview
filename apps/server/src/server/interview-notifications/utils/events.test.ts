import { describe, expect, it } from "vitest";
import {
  AI_INTERVIEW_COMPLETION_NOTICES,
  buildHumanInterviewEvaluationSummary,
  buildHumanInterviewRoundProgression,
  buildInterviewReminderSchedule,
  resolveAiInterviewCompletionNotice,
  resolveHumanMeetingEventInterviewLink,
  resolveInterviewNotificationCompanyName,
} from "./events";

const ANSWERED_OUTCOME = {
  answerSummary: "候选人说明了告警、根因和预防措施",
  difficulty: "medium" as const,
  endedAtSecs: 48,
  evaluationFocus: "确认候选人能够定位并复盘线上故障",
  followUpCount: 1,
  followUpDirections: "追问定位信号、根因和预防措施",
  question: "请介绍一次线上故障排查经历。",
  questionId: "question-1",
  reason: null,
  revision: 1,
  startedAtSecs: 12,
  status: "answered" as const,
};

describe("AI interview completion notice", () => {
  it("keeps the report-pending notice for a complete question set", () => {
    expect(
      resolveAiInterviewCompletionNotice(
        {
          questions: [ANSWERED_OUTCOME],
          schemaVersion: 2,
        },
        "张三",
      ),
    ).toBe(AI_INTERVIEW_COMPLETION_NOTICES.complete("张三"));
  });

  it("offers manual generation when an incomplete interview has an effective answer", () => {
    expect(
      resolveAiInterviewCompletionNotice({
        questions: [
          ANSWERED_OUTCOME,
          {
            ...ANSWERED_OUTCOME,
            answerSummary: null,
            questionId: "question-2",
            reason: "candidate_ended_round",
            status: "unasked",
          },
        ],
        schemaVersion: 2,
      }),
    ).toBe(AI_INTERVIEW_COMPLETION_NOTICES.partial);
  });

  it("explains that generation is unavailable without an effective answer", () => {
    expect(
      resolveAiInterviewCompletionNotice({
        questions: [
          {
            ...ANSWERED_OUTCOME,
            answerSummary: null,
            reason: "system_shutdown",
            status: "unasked",
          },
        ],
        schemaVersion: 2,
      }),
    ).toBe(AI_INTERVIEW_COMPLETION_NOTICES.unavailable);
    expect(resolveAiInterviewCompletionNotice(null)).toBe(
      AI_INTERVIEW_COMPLETION_NOTICES.unavailable,
    );
  });
});

describe("human interview round progression", () => {
  it("starts after AI HR and advances from the latest passed human round", () => {
    expect(buildHumanInterviewRoundProgression([])).toEqual({
      currentRoundNumber: 2,
      previousRoundName: "HR 初面",
      previousRoundNumber: 1,
    });
    expect(
      buildHumanInterviewRoundProgression([{ label: "技术一面" }, { label: "技术二面" }]),
    ).toEqual({
      currentRoundNumber: 4,
      previousRoundName: "技术二面",
      previousRoundNumber: 3,
    });
  });
});

describe("interview notification reminder schedule", () => {
  it("creates T-24h and T-1h reminders when both are still in the future", () => {
    expect(
      buildInterviewReminderSchedule(
        new Date("2026-08-22T10:00:00.000Z"),
        new Date("2026-08-20T10:00:00.000Z"),
      ),
    ).toEqual([
      { availableAt: new Date("2026-08-21T10:00:00.000Z"), offsetMinutes: 1440 },
      { availableAt: new Date("2026-08-22T09:00:00.000Z"), offsetMinutes: 60 },
    ]);
  });

  it("does not backfill reminders whose trigger time has passed", () => {
    expect(
      buildInterviewReminderSchedule(
        new Date("2026-08-20T10:30:00.000Z"),
        new Date("2026-08-20T10:00:00.000Z"),
      ),
    ).toEqual([]);
  });
});

describe("human interview evaluation summary", () => {
  it("formats every completed human round selected by the event query", () => {
    const summary = buildHumanInterviewEvaluationSummary([
      { evaluation: null, interviewerNames: ["肥仔"], label: "业务一面", outcome: "pass" },
      { evaluation: null, interviewerNames: ["肥仔", "李四"], label: "业务二面", outcome: "fail" },
    ]);
    expect(summary).not.toContain("AI HR 初面评价");
    expect(summary).toContain("业务一面评价");
    expect(summary).toContain("业务二面评价");
    expect(summary).toContain("面试官：肥仔、李四");
    expect(summary).toContain("结论：通过");
    expect(summary).toContain("结论：不通过");
    expect(summary).toContain("综合评级：未收集到");
    expect(summary).not.toContain("面试官原始评语");
  });

  it("uses submitted human fields with fallback only for empty fields", () => {
    const summary = buildHumanInterviewEvaluationSummary([
      {
        evaluation: {
          detailedAnalysis: "不展开详细分析",
          evidenceTurnIds: [],
          overallEvaluation: "系统整体评价",
          professionalSkill: "中",
          rating: "C",
          risks: "需要验证管理能力",
          rolePosition: "执行员工",
          salaryRecommendation: "  ",
          seniorityPosition: "高级",
          strengths: "排障清晰",
        },
        interviewerNames: ["张三"],
        label: "业务一面",
        outcome: "pass",
      },
    ]);
    for (const text of [
      "业务一面评价",
      "综合评级：C",
      "建议职级定位：高级",
      "岗位角色适配定位：执行员工",
      "专业技能评估：中",
      "候选人优势特点：排障清晰",
      "潜在劣势与风险点：需要验证管理能力",
      "建议薪资区间：未收集到",
    ]) {
      expect(summary).toContain(text);
    }
    expect(summary).not.toContain("不展开详细分析");
    expect(summary).not.toContain("系统整体评价");
    expect(summary).not.toContain("面试官原始评语");
  });
});

describe("interview notification company name", () => {
  it("uses the company name from context settings", () => {
    expect(resolveInterviewNotificationCompanyName("  ACE科技  ", "test")).toBe("ACE科技");
  });

  it("falls back to the workspace name when the context company name is blank", () => {
    expect(resolveInterviewNotificationCompanyName("   ", "test")).toBe("test");
    expect(resolveInterviewNotificationCompanyName(null, "test")).toBe("test");
  });
});

describe("human meeting event links", () => {
  it("links completion summaries to the recruiting record without signing a candidate invite", () => {
    const previousAuthSecret = process.env.BETTER_AUTH_SECRET;
    const previousBaseUrl = process.env.BETTER_AUTH_URL;
    delete process.env.BETTER_AUTH_SECRET;
    process.env.BETTER_AUTH_URL = "https://recruiting.example.com";
    try {
      expect(
        resolveHumanMeetingEventInterviewLink({
          candidateInviteExpiresAt: new Date("2026-08-27T10:00:00.000Z"),
          candidateInviteTokenHash: "candidate-token-hash",
          humanRoundId: "round_1",
          interviewRecordId: "record_1",
          meetingId: "meeting_1",
          organizationSlug: "workspace_1",
          type: "human_interview_completed",
        }),
      ).toBe("https://recruiting.example.com/w/workspace_1/studio/resumes/record_1");
    } finally {
      if (previousAuthSecret === undefined) {
        delete process.env.BETTER_AUTH_SECRET;
      } else {
        process.env.BETTER_AUTH_SECRET = previousAuthSecret;
      }
      if (previousBaseUrl === undefined) {
        delete process.env.BETTER_AUTH_URL;
      } else {
        process.env.BETTER_AUTH_URL = previousBaseUrl;
      }
    }
  });
});
