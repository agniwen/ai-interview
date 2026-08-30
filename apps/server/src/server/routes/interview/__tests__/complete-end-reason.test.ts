import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@app/server/lib/server/db";
import {
  interviewConversation,
  organization,
  studioInterview,
  studioInterviewSchedule,
} from "@arc/db-schema/schema";
import { interviewRouter } from "../route";

const ORGANIZATION_ID = "test_candidate_end_reason_org";
const INTERVIEW_ID = "test_candidate_end_reason_interview";
const ROUND_ID = "test_candidate_end_reason_round";
const CONVERSATION_ID = "test_candidate_end_reason_room";
const NOW = new Date("2026-08-28T12:00:00.000Z");

async function cleanup() {
  await db
    .delete(interviewConversation)
    .where(eq(interviewConversation.organizationId, ORGANIZATION_ID));
  await db
    .delete(studioInterviewSchedule)
    .where(eq(studioInterviewSchedule.organizationId, ORGANIZATION_ID));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORGANIZATION_ID));
  await db.delete(organization).where(eq(organization.id, ORGANIZATION_ID));
}

beforeAll(async () => {
  delete process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED;
  await cleanup();
  await db.insert(organization).values({
    createdAt: NOW,
    id: ORGANIZATION_ID,
    name: "Candidate End Reason Test Org",
    slug: ORGANIZATION_ID,
  });
  await db.insert(studioInterview).values({
    candidateEmail: null,
    candidateName: "结束原因候选人",
    createdAt: NOW,
    id: INTERVIEW_ID,
    interviewQuestions: [],
    organizationId: ORGANIZATION_ID,
    resumeProfile: null,
    targetRole: "测试工程师",
    updatedAt: NOW,
  });
  await db.insert(studioInterviewSchedule).values({
    createdAt: NOW,
    id: ROUND_ID,
    interviewRecordId: INTERVIEW_ID,
    liveKitRoomName: CONVERSATION_ID,
    organizationId: ORGANIZATION_ID,
    roundLabel: "第一轮",
    sortOrder: 0,
    status: "in_progress",
    updatedAt: NOW,
  });
});

afterAll(cleanup);

describe("POST /:id/:roundId/complete", () => {
  it("records an explicit candidate button end reason", async () => {
    const response = await interviewRouter.request(
      `/${INTERVIEW_ID}/${ROUND_ID}/complete?mode=final`,
      { method: "POST" },
    );

    expect(response.status).toBe(200);
    const [conversation] = await db
      .select({
        endedAt: interviewConversation.endedAt,
        metadata: interviewConversation.metadata,
        status: interviewConversation.status,
      })
      .from(interviewConversation)
      .where(eq(interviewConversation.conversationId, CONVERSATION_ID))
      .limit(1);
    expect(conversation).toMatchObject({
      metadata: { closeReason: "candidate_clicked_end" },
      status: "completed",
    });
    expect(conversation?.endedAt).toBeInstanceOf(Date);
  });
});
