import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  aiInterviewConversation,
  aiInterviewRound,
  candidate,
  organization,
  recruitingNodeState,
} from "@app/db-schema/schema";
import { createRecruitingRecords, deleteRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel as read } from "@app/database/recruiting-read-model";
import { updateRecruitingNodeTx } from "@app/database/recruiting-pipeline";
import { db } from "../../../../lib/server/db/index";

import { agentRouterDependencies } from "../route-runtime";
import { createAgentRouter } from "../route";
import type { CheckpointPayload, ReportPayload } from "../route";

const agentRouter = createAgentRouter({
  ...agentRouterDependencies,
  createInterviewEvidenceSnapshot: async () => {},
  runKeyInformationJob: async () => {},
  runSummaryJob: async () => {},
});
function post(path: string, body: CheckpointPayload | ReportPayload) {
  return agentRouter.request(path, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json", "X-Agent-Secret": "test-agent-secret" },
    method: "POST",
  });
}

const testUrl = process.env.RECRUITING_TEST_DATABASE_URL;
describe.skipIf(!testUrl)("新招聘记录的 Agent 回调", () => {
  if (
    !testUrl ||
    process.env.DATABASE_URL !== testUrl ||
    !new URL(testUrl).pathname.includes("_test_")
  ) {
    throw new Error("必须显式配置隔离招聘测试库");
  }
  const org = `callback-${crypto.randomUUID()}`;
  let recordId: string;
  const roundId = crypto.randomUUID();
  const conversationId = `interview_${crypto.randomUUID()}`;
  beforeAll(async () => {
    process.env.AGENT_CALLBACK_SECRET = "test-agent-secret";
    await db.insert(organization).values({ id: org, name: "回调测试", slug: org });
    const [record] = await createRecruitingRecords(db, {
      candidateName: "回调候选人",
      organizationId: org,
      pipelineStage: "ai_interview",
    });
    if (!record) {
      throw new Error("创建测试招聘记录失败");
    }
    recordId = record.id;
    await db.insert(aiInterviewRound).values({
      id: roundId,
      liveKitRoomName: conversationId,
      organizationId: org,
      recruitingRecordId: recordId,
      roundLabel: "AI初面",
      sortOrder: 0,
      status: "in_progress",
    });
    await db.transaction((tx) =>
      updateRecruitingNodeTx(tx, {
        effectiveAiRoundId: roundId,
        node: "ai_interview",
        operatorId: null,
        organizationId: org,
        recordId,
        status: "in_progress",
      }),
    );
  });
  afterAll(async () => {
    await deleteRecruitingRecords(db, eq(read.organizationId, org));
    await db.delete(candidate).where(eq(candidate.organizationId, org));
    await db.delete(organization).where(eq(organization.id, org));
  });
  it("保存检查点并接收完整结果，将有效轮次转为待人工确认", async () => {
    await db.insert(aiInterviewConversation).values({
      aiRoundId: roundId,
      conversationId,
      metadata: { endReason: "candidate_clicked_end" },
      organizationId: org,
      recruitingRecordId: recordId,
      status: "completed",
    });
    await db
      .update(aiInterviewRound)
      .set({ conversationId, status: "completed" })
      .where(eq(aiInterviewRound.id, roundId));
    const identity = { conversationId, interviewRecordId: recordId, scheduleEntryId: roundId };
    const checkpoint = await post("/checkpoint", {
      ...identity,
      outcome: {
        answerSummary: "项目职责",
        difficulty: "easy",
        endedAtSecs: 30,
        evaluationFocus: null,
        followUpCount: 0,
        followUpDirections: null,
        question: "介绍项目",
        questionId: "question-1",
        reason: null,
        revision: 1,
        startedAtSecs: 10,
        status: "answered",
      },
    });
    expect(checkpoint.status).toBe(201);
    const response = await post("/report", {
      ...identity,
      status: "completed",
      transcript: [{ message: "我负责项目开发", role: "user", timeInCallSecs: 12 }],
    });
    expect(response.status).toBe(201);
    const [conversation] = await db
      .select()
      .from(aiInterviewConversation)
      .where(eq(aiInterviewConversation.conversationId, conversationId));
    expect(conversation).toMatchObject({
      aiRoundId: roundId,
      recruitingRecordId: recordId,
      status: "completed",
    });
    const [node] = await db
      .select()
      .from(recruitingNodeState)
      .where(eq(recruitingNodeState.effectiveAiRoundId, roundId));
    expect(node).toMatchObject({ result: null, status: "awaiting_review" });
  });
  it("重复结果回调不会清除已经人工确认的通过结论", async () => {
    await db
      .update(aiInterviewRound)
      .set({ reviewOutcome: "pass" })
      .where(eq(aiInterviewRound.id, roundId));
    await db.transaction((tx) =>
      updateRecruitingNodeTx(tx, {
        effectiveAiRoundId: roundId,
        node: "ai_interview",
        operatorId: null,
        organizationId: org,
        recordId,
        result: "pass",
        status: "completed",
      }),
    );
    const response = await post("/report", {
      conversationId,
      interviewRecordId: recordId,
      scheduleEntryId: roundId,
      status: "completed",
      transcript: [{ message: "我负责项目开发", role: "user", timeInCallSecs: 12 }],
    });
    expect(response.status).toBe(201);
    const [node] = await db
      .select()
      .from(recruitingNodeState)
      .where(eq(recruitingNodeState.effectiveAiRoundId, roundId));
    expect(node).toMatchObject({ result: "pass", status: "completed" });
  });
});
