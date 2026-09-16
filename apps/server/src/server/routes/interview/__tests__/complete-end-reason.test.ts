import { updateRecruitingNodeTx } from "@app/database/recruiting-pipeline";
import { deleteRecruitingRecords, createRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "../../../../lib/server/db/index";
import { aiInterviewConversation, organization, aiInterviewRound } from "@app/db-schema/schema";
import { createInterviewRouter } from "../route";

const endLiveSession = vi.fn(async (_room: string) => {});
const interviewRouter = createInterviewRouter({
  endLiveSession,
  getLiveSession: () => Promise.resolve("active"),
});

const ORGANIZATION_ID = "test_candidate_end_reason_org";
const INTERVIEW_ID = "test_candidate_end_reason_interview";
const ROUND_ID = "test_candidate_end_reason_round";
const CONVERSATION_ID = "test_candidate_end_reason_room";
const NOW = new Date("2026-08-28T12:00:00.000Z");

async function cleanup() {
  await deleteRecruitingRecords(db, eq(recruitingRecordReadModel.organizationId, ORGANIZATION_ID));
  await db
    .delete(aiInterviewConversation)
    .where(eq(aiInterviewConversation.organizationId, ORGANIZATION_ID));
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
  await createRecruitingRecords(db, {
    candidateEmail: null,
    candidateName: "结束原因候选人",
    createdAt: NOW,
    id: INTERVIEW_ID,
    interviewQuestions: [],
    organizationId: ORGANIZATION_ID,
    pipelineStage: "ai_interview",
    resumeProfile: null,
    targetRole: "测试工程师",
    updatedAt: NOW,
  });
  await db.insert(aiInterviewRound).values({
    createdAt: NOW,
    id: ROUND_ID,
    liveKitRoomName: CONVERSATION_ID,
    organizationId: ORGANIZATION_ID,
    recruitingRecordId: INTERVIEW_ID,
    roundLabel: "第一轮",
    sortOrder: 0,
    status: "in_progress",
    updatedAt: NOW,
  });
  await db.transaction((tx) =>
    updateRecruitingNodeTx(tx, {
      effectiveAiRoundId: ROUND_ID,
      node: "ai_interview",
      now: NOW,
      operatorId: null,
      organizationId: ORGANIZATION_ID,
      recordId: INTERVIEW_ID,
      status: "in_progress",
    }),
  );
});

afterAll(cleanup);

describe("POST /:id/:roundId/complete", () => {
  it("records an explicit candidate button end reason", async () => {
    const response = await interviewRouter.request(
      `/${INTERVIEW_ID}/${ROUND_ID}/complete?mode=final`,
      { method: "POST" },
    );

    expect(response.status).toBe(200);
    expect(endLiveSession).toHaveBeenCalledWith(CONVERSATION_ID);
    const [conversation] = await db
      .select({
        endedAt: aiInterviewConversation.endedAt,
        metadata: aiInterviewConversation.metadata,
        status: aiInterviewConversation.status,
      })
      .from(aiInterviewConversation)
      .where(eq(aiInterviewConversation.conversationId, CONVERSATION_ID))
      .limit(1);
    expect(conversation).toMatchObject({
      metadata: { closeReason: "candidate_clicked_end" },
      status: "completed",
    });
    expect(conversation?.endedAt).toBeInstanceOf(Date);
  });
});

it("retries room closure after a transient failure without losing the explicit end", async () => {
  endLiveSession.mockRejectedValueOnce(new Error("temporary transport failure"));
  const path = `/${INTERVIEW_ID}/${ROUND_ID}/complete?mode=final`;
  const failed = await interviewRouter.request(path, { method: "POST" });
  expect(failed.status).toBe(503);
  const retried = await interviewRouter.request(path, { method: "POST" });
  expect(retried.status).toBe(200);
  expect(endLiveSession).toHaveBeenLastCalledWith(CONVERSATION_ID);
});

it("does not close the room for a browser interrupt signal", async () => {
  endLiveSession.mockClear();
  const response = await interviewRouter.request(
    `/${INTERVIEW_ID}/${ROUND_ID}/complete?mode=interrupt`,
    { method: "POST" },
  );
  expect(response.status).toBe(200);
  expect(endLiveSession).not.toHaveBeenCalled();
});
