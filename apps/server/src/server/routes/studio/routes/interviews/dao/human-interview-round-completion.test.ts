import { createRecruitingRecords, deleteRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../../../../lib/server/db/index";
import {
  recruitingNotificationEvent,
  recruitingNodeState,
  aiInterviewConversation,
  member,
  organization,
  humanInterviewRound,
  user,
} from "@app/db-schema/schema";
import {
  cancelHumanInterviewRound,
  completeHumanInterviewRound,
  createHumanInterviewRound,
} from "./human-interview-rounds";
import {
  createHumanInterviewMeeting,
  endHumanInterviewMeetingsByRound,
} from "./human-interview-meetings";
import { submitHumanInterviewEvaluation } from "./human-interview-evaluation";

const submittedEvaluation = {
  detailedAnalysis: "详细分析无需在通知展开",
  evidenceTurnIds: [],
  overallEvaluation: "复面人工确认评语",
  professionalSkill: "中",
  rating: "C" as const,
  risks: "待验证管理能力",
  rolePosition: "执行员工",
  salaryRecommendation: "30K",
  seniorityPosition: "高级",
  strengths: "排障清晰",
};

const CANDIDATE_ID = "round_completion_candidate";
const HR_USER_ID = "round_completion_hr";
const INTERVIEWER_ID = "round_completion_interviewer";
const ORGANIZATION_ID = "round_completion_org";

async function cleanup() {
  await deleteRecruitingRecords(db, eq(recruitingRecordReadModel.organizationId, ORGANIZATION_ID));
  await db.delete(organization).where(eq(organization.id, ORGANIZATION_ID));
  await db.delete(user).where(eq(user.id, HR_USER_ID));
  await db.delete(user).where(eq(user.id, INTERVIEWER_ID));
}

beforeAll(async () => {
  await cleanup();
  const now = new Date("2026-08-26T10:00:00.000Z");
  await db.insert(user).values([
    {
      createdAt: now,
      email: "round-completion-hr@example.com",
      emailVerified: false,
      id: HR_USER_ID,
      name: "测试 HR",
      updatedAt: now,
    },
    {
      createdAt: now,
      email: "round-completion-interviewer@example.com",
      emailVerified: false,
      id: INTERVIEWER_ID,
      name: "测试面试官",
      updatedAt: now,
    },
  ]);
  await db.insert(organization).values({
    createdAt: now,
    id: ORGANIZATION_ID,
    name: "评价汇总测试工作区",
    slug: "round-completion-test",
  });
  await db.insert(member).values([
    {
      createdAt: now,
      id: "round_completion_hr_member",
      organizationId: ORGANIZATION_ID,
      role: "owner",
      userId: HR_USER_ID,
    },
    {
      createdAt: now,
      id: "round_completion_interviewer_member",
      organizationId: ORGANIZATION_ID,
      role: "member",
      userId: INTERVIEWER_ID,
    },
  ]);
  await createRecruitingRecords(db, {
    candidateName: "评价汇总候选人",
    createdAt: now,
    createdBy: HR_USER_ID,
    id: CANDIDATE_ID,
    interviewQuestions: [],
    organizationId: ORGANIZATION_ID,
    pipelineStage: "second_interview",
    updatedAt: now,
  });
  await db
    .update(recruitingNodeState)
    .set({ result: "pass", status: "completed" })
    .where(
      and(
        eq(recruitingNodeState.recruitingRecordId, CANDIDATE_ID),
        eq(recruitingNodeState.node, "screening"),
      ),
    );
});

afterAll(cleanup);

describe("human interview round completion notifications", () => {
  it.each([null, "fail"] as const)("未筛选通过 %s 不能安排真人轮次", async (screeningResult) => {
    await db
      .update(recruitingNodeState)
      .set({ result: screeningResult, status: screeningResult ? "completed" : "pending" })
      .where(
        and(
          eq(recruitingNodeState.recruitingRecordId, CANDIDATE_ID),
          eq(recruitingNodeState.node, "screening"),
        ),
      );
    await expect(
      createHumanInterviewRound({
        input: {
          format: "online",
          interviewerIds: [INTERVIEWER_ID],
          label: "复试",
          roundKind: "second_interview",
        },
        interviewRecordId: CANDIDATE_ID,
        organizationId: ORGANIZATION_ID,
      }),
    ).rejects.toThrow("筛选标记为通过");
    expect(
      await db
        .select()
        .from(humanInterviewRound)
        .where(eq(humanInterviewRound.recruitingRecordId, CANDIDATE_ID)),
    ).toEqual([]);
    await db
      .update(recruitingNodeState)
      .set({ result: "pass", status: "completed" })
      .where(
        and(
          eq(recruitingNodeState.recruitingRecordId, CANDIDATE_ID),
          eq(recruitingNodeState.node, "screening"),
        ),
      );
  });
  it("仅在本轮完成后通知，只包含本轮评价而不包含历史真人轮次和 AI 报告", async () => {
    const previousFlag = process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED;
    process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED = "true";
    try {
      const firstRound = await createHumanInterviewRound({
        input: {
          format: "online",
          interviewerIds: [INTERVIEWER_ID],
          label: "技术初面",
          roundKind: "second_interview",
        },
        interviewRecordId: CANDIDATE_ID,
        organizationId: ORGANIZATION_ID,
      });
      const firstMeeting = await createHumanInterviewMeeting({
        createdBy: HR_USER_ID,
        input: {
          interviewerIds: [INTERVIEWER_ID],
          roundIds: [firstRound.id],
          title: "技术初面",
        },
        organizationId: ORGANIZATION_ID,
      });

      await endHumanInterviewMeetingsByRound({
        organizationId: ORGANIZATION_ID,
        roundId: firstRound.id,
      });
      let completionEvents = await db
        .select()
        .from(recruitingNotificationEvent)
        .where(
          and(
            eq(recruitingNotificationEvent.humanMeetingId, firstMeeting.id),
            eq(recruitingNotificationEvent.type, "human_interview_completed"),
          ),
        );
      expect(completionEvents).toHaveLength(0);

      // A completed legacy round may still hold an unconfirmed AI draft.
      await db
        .update(humanInterviewRound)
        .set({
          evaluation: { ...submittedEvaluation, rating: "A" },
          evaluationStatus: "draft",
        })
        .where(eq(humanInterviewRound.id, firstRound.id));

      await completeHumanInterviewRound({
        actorUserId: HR_USER_ID,
        feedback: "技术能力符合要求",
        organizationId: ORGANIZATION_ID,
        outcome: "pass",
        roundId: firstRound.id,
      });
      completionEvents = await db
        .select()
        .from(recruitingNotificationEvent)
        .where(
          and(
            eq(recruitingNotificationEvent.humanMeetingId, firstMeeting.id),
            eq(recruitingNotificationEvent.type, "human_interview_completed"),
          ),
        );
      expect(completionEvents).toHaveLength(1);
      expect(completionEvents[0]?.payloadSnapshot.evaluationSummary).not.toContain(
        "AI HR 初面评价",
      );
      expect(completionEvents[0]?.payloadSnapshot.evaluationSummary).toContain("技术初面评价");
      expect(completionEvents[0]?.payloadSnapshot.evaluationSummary).not.toContain(
        "面试官原始评语",
      );
      expect(completionEvents[0]?.payloadSnapshot.evaluationSummary).not.toContain("综合评级：A");

      await db.insert(aiInterviewConversation).values([
        {
          conversationId: "round_completion_hr_report",
          evaluationCriteriaResults: {
            hrEvaluation: { availability: "两周内", jobMotivation: "希望负责完整项目" },
          },
          organizationId: ORGANIZATION_ID,
          recruitingRecordId: CANDIDATE_ID,
          summaryStatus: "ready",
          updatedAt: new Date("2026-08-27T00:00:00Z"),
        },
        {
          conversationId: "round_completion_invalid_report",
          evaluationCriteriaResults: { hrEvaluation: { jobMotivation: 123 } },
          organizationId: ORGANIZATION_ID,
          recruitingRecordId: CANDIDATE_ID,
          summaryStatus: "ready",
          updatedAt: new Date("2026-08-28T00:00:00Z"),
        },
        {
          conversationId: "round_completion_pending_report",
          evaluationCriteriaResults: { hrEvaluation: { jobMotivation: "不应读取未就绪报告" } },
          organizationId: ORGANIZATION_ID,
          recruitingRecordId: CANDIDATE_ID,
          summaryStatus: "pending",
          updatedAt: new Date("2026-08-29T00:00:00Z"),
        },
        {
          conversationId: "round_completion_other_candidate",
          evaluationCriteriaResults: { hrEvaluation: { jobMotivation: "其他候选人报告" } },
          organizationId: ORGANIZATION_ID,
          recruitingRecordId: null,
          summaryStatus: "ready",
          updatedAt: new Date("2026-08-30T00:00:00Z"),
        },
      ]);

      const cancelledRound = await createHumanInterviewRound({
        input: {
          format: "online",
          interviewerIds: [INTERVIEWER_ID],
          label: "技术二面",
          roundKind: "final_interview",
        },
        interviewRecordId: CANDIDATE_ID,
        organizationId: ORGANIZATION_ID,
      });
      await cancelHumanInterviewRound({
        organizationId: ORGANIZATION_ID,
        reason: "候选人取消",
        roundId: cancelledRound.id,
      });

      const finalRound = await createHumanInterviewRound({
        input: {
          format: "online",
          interviewerIds: [INTERVIEWER_ID],
          label: "技术复面",
          roundKind: "final_interview",
        },
        interviewRecordId: CANDIDATE_ID,
        organizationId: ORGANIZATION_ID,
      });
      const finalMeeting = await createHumanInterviewMeeting({
        createdBy: HR_USER_ID,
        input: {
          interviewerIds: [INTERVIEWER_ID],
          roundIds: [finalRound.id],
          title: "技术复面",
        },
        organizationId: ORGANIZATION_ID,
      });
      expect(
        await submitHumanInterviewEvaluation({
          actorId: INTERVIEWER_ID,
          evaluation: submittedEvaluation,
          meetingSessionId: null,
          organizationId: ORGANIZATION_ID,
          outcome: "pass",
          roundId: finalRound.id,
          transcriptRevisionId: null,
        }),
      ).toBe(true);

      const [finalEvent] = await db
        .select()
        .from(recruitingNotificationEvent)
        .where(
          and(
            eq(recruitingNotificationEvent.humanMeetingId, finalMeeting.id),
            eq(recruitingNotificationEvent.type, "human_interview_completed"),
          ),
        );
      expect(finalEvent?.payloadSnapshot.evaluationSummary).not.toContain("AI HR 初面评价");
      expect(finalEvent?.payloadSnapshot.evaluationSummary).not.toContain("技术初面评价");
      expect(finalEvent?.payloadSnapshot.evaluationSummary).toContain("技术复面评价");
      expect(finalEvent?.payloadSnapshot.evaluationSummary).not.toContain("技术二面评价");
      for (const text of ["结论：通过", "综合评级：C", "专业技能评估：中", "建议薪资区间：30K"]) {
        expect(finalEvent?.payloadSnapshot.evaluationSummary).toContain(text);
      }
      expect(finalEvent?.payloadSnapshot.evaluationSummary).not.toContain("不应读取未就绪报告");
      expect(finalEvent?.payloadSnapshot.evaluationSummary).not.toContain("希望负责完整项目");
      expect(finalEvent?.payloadSnapshot.evaluationSummary).not.toContain("其他候选人报告");
      expect(finalEvent?.payloadSnapshot.evaluationSummary).not.toContain("面试官原始评语");
      expect(finalEvent?.payloadSnapshot.evaluationSummary).not.toContain("复面人工确认评语");
      expect(finalEvent?.payloadSnapshot.evaluationSummary).not.toContain("详细分析无需在通知展开");
    } finally {
      if (previousFlag === undefined) {
        delete process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED;
      } else {
        process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED = previousFlag;
      }
    }
  });
});
