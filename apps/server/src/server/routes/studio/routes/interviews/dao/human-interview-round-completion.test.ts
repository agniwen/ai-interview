import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@server/lib/server/db/index";
import {
  interviewNotificationEvent,
  member,
  organization,
  studioInterview,
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

const CANDIDATE_ID = "round_completion_candidate";
const HR_USER_ID = "round_completion_hr";
const INTERVIEWER_ID = "round_completion_interviewer";
const ORGANIZATION_ID = "round_completion_org";

async function cleanup() {
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
  await db.insert(studioInterview).values({
    candidateName: "评价汇总候选人",
    createdAt: now,
    createdBy: HR_USER_ID,
    id: CANDIDATE_ID,
    interviewQuestions: [],
    organizationId: ORGANIZATION_ID,
    pipelineStage: "human_interview",
    updatedAt: now,
  });
});

afterAll(cleanup);

describe("human interview round completion notifications", () => {
  it("仅在 HR 标记完成后生成，并累计已完成真人轮次且跳过取消轮次", async () => {
    const previousFlag = process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED;
    process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED = "true";
    try {
      const firstRound = await createHumanInterviewRound({
        input: { format: "online", interviewerIds: [INTERVIEWER_ID], label: "技术初面" },
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
        .from(interviewNotificationEvent)
        .where(
          and(
            eq(interviewNotificationEvent.humanMeetingId, firstMeeting.id),
            eq(interviewNotificationEvent.type, "human_interview_completed"),
          ),
        );
      expect(completionEvents).toHaveLength(0);

      await completeHumanInterviewRound({
        actorUserId: HR_USER_ID,
        feedback: "技术能力符合要求",
        organizationId: ORGANIZATION_ID,
        outcome: "pass",
        roundId: firstRound.id,
      });
      completionEvents = await db
        .select()
        .from(interviewNotificationEvent)
        .where(
          and(
            eq(interviewNotificationEvent.humanMeetingId, firstMeeting.id),
            eq(interviewNotificationEvent.type, "human_interview_completed"),
          ),
        );
      expect(completionEvents).toHaveLength(1);
      expect(completionEvents[0]?.payloadSnapshot.evaluationSummary).toContain(
        "第 1 轮 AI HR 初面评价",
      );
      expect(completionEvents[0]?.payloadSnapshot.evaluationSummary).toContain(
        "第 2 轮 技术初面评价",
      );

      const cancelledRound = await createHumanInterviewRound({
        input: { format: "online", interviewerIds: [INTERVIEWER_ID], label: "技术二面" },
        interviewRecordId: CANDIDATE_ID,
        organizationId: ORGANIZATION_ID,
      });
      await cancelHumanInterviewRound({
        organizationId: ORGANIZATION_ID,
        reason: "候选人取消",
        roundId: cancelledRound.id,
      });

      const finalRound = await createHumanInterviewRound({
        input: { format: "online", interviewerIds: [INTERVIEWER_ID], label: "技术复面" },
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
      await completeHumanInterviewRound({
        actorUserId: HR_USER_ID,
        feedback: "复面通过",
        organizationId: ORGANIZATION_ID,
        outcome: "pass",
        roundId: finalRound.id,
      });

      const [finalEvent] = await db
        .select()
        .from(interviewNotificationEvent)
        .where(
          and(
            eq(interviewNotificationEvent.humanMeetingId, finalMeeting.id),
            eq(interviewNotificationEvent.type, "human_interview_completed"),
          ),
        );
      expect(finalEvent?.payloadSnapshot.evaluationSummary).toContain("第 1 轮 AI HR 初面评价");
      expect(finalEvent?.payloadSnapshot.evaluationSummary).toContain("第 2 轮 技术初面评价");
      expect(finalEvent?.payloadSnapshot.evaluationSummary).toContain("第 3 轮 技术复面评价");
      expect(finalEvent?.payloadSnapshot.evaluationSummary).not.toContain("技术二面评价");
    } finally {
      if (previousFlag === undefined) {
        delete process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED;
      } else {
        process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED = previousFlag;
      }
    }
  });
});
