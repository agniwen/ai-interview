import { describe, expect, it } from "vitest";
import { getRecruitingHrAction, requiresRecruitingHrAction } from "../recruiting-hr-action";

describe("recruiting HR action", () => {
  it.each([
    ["screening", "pending", null, "筛选简历"],
    ["screening", "completed", "pass", "推进面试"],
    ["ai_interview", "pending", null, "发起 AI 初面"],
    ["ai_interview", "awaiting_review", null, "审核 AI 结果"],
    ["second_interview", "pending", null, "安排复试"],
    ["second_interview", "awaiting_review", null, "审核复试结果"],
    ["final_interview", "completed", "pass", "推进流水"],
    ["income_proof", "in_progress", null, "跟进流水"],
    ["salary_negotiation", "negotiating", null, "处理谈薪"],
    ["offer", "awaiting_send", null, "发送 Offer"],
    ["offer", "completed", "pass", "推进背调"],
    ["background_check", "awaiting_review", null, "跟进背调"],
    ["onboarding", "pending", null, "办理入职"],
  ] as const)("%s/%s is actionable", (pipelineStage, nodeStatus, nodeResult, label) => {
    const action = getRecruitingHrAction({ nodeResult, nodeStatus, pipelineStage });
    expect(action?.label).toBe(label);
    expect(requiresRecruitingHrAction({ nodeResult, nodeStatus, pipelineStage })).toBe(true);
  });

  it.each([
    ["ai_interview", "scheduled", null],
    ["ai_interview", "in_progress", null],
    ["second_interview", "scheduled", null],
    ["offer", "awaiting_response", null],
    ["closed", "completed", "pass"],
    ["screening", "completed", "fail"],
  ] as const)(
    "%s/%s waits on someone else or is terminal",
    (pipelineStage, nodeStatus, nodeResult) => {
      expect(getRecruitingHrAction({ nodeResult, nodeStatus, pipelineStage })).toBeNull();
    },
  );

  it("uses actual AI rounds instead of treating a stale pending node as unlaunched", () => {
    expect(
      getRecruitingHrAction({
        nodeStatus: "pending",
        pipelineStage: "ai_interview",
        stageProgress: {
          aiInterview: { activeRound: { status: "pending" }, totalRounds: 1 },
          humanInterview: null,
          offer: null,
        },
      }),
    ).toBeNull();
  });

  it("distinguishes a scheduled human round from completed rounds ready for review", () => {
    const base = {
      nodeStatus: "pending" as const,
      pipelineStage: "second_interview" as const,
    };
    expect(
      getRecruitingHrAction({
        ...base,
        stageProgress: {
          aiInterview: null,
          humanInterview: {
            activeRound: { scheduledAt: "2026-09-07T08:00:00.000Z" },
            completedRoundsMissingFeedback: 0,
            totalRounds: 1,
          },
          offer: null,
        },
      }),
    ).toBeNull();
    expect(
      getRecruitingHrAction({
        ...base,
        stageProgress: {
          aiInterview: null,
          humanInterview: {
            activeRound: null,
            completedRoundsMissingFeedback: 0,
            totalRounds: 2,
          },
          offer: null,
        },
      })?.label,
    ).toBe("审核复试结果");
  });

  it("uses only the current human interview stage when historical rounds exist", () => {
    expect(
      getRecruitingHrAction({
        nodeStatus: "pending",
        pipelineStage: "final_interview",
        stageProgress: {
          aiInterview: null,
          humanInterview: {
            activeRound: null,
            byRoundKind: {
              final_interview: null,
              second_interview: {
                activeRound: null,
                completedRounds: 1,
                completedRoundsMissingFeedback: 0,
                failedRounds: 0,
                passedRounds: 1,
                totalRounds: 1,
              },
            },
            completedRounds: 1,
            completedRoundsMissingFeedback: 0,
            failedRounds: 0,
            passedRounds: 1,
            totalRounds: 1,
          },
          offer: null,
        },
      })?.label,
    ).toBe("安排终试");
  });

  it("treats an unscheduled pending human round as an arrangement task", () => {
    expect(
      getRecruitingHrAction({
        nodeStatus: "scheduled",
        pipelineStage: "second_interview",
        stageProgress: {
          aiInterview: null,
          humanInterview: {
            activeRound: { scheduledAt: null },
            completedRoundsMissingFeedback: 0,
            totalRounds: 1,
          },
          offer: null,
        },
      })?.label,
    ).toBe("安排复试");
  });
});
