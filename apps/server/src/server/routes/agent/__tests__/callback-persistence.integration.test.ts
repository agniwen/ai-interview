import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, sql } from "drizzle-orm";
import {
  aiInterviewConversation,
  aiInterviewReportReceipt,
  recruitingNotificationEvent,
  recruitingContextSnapshot,
  recruitingEvidenceSnapshot,
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
import { retryAgentReportReceipts } from "../report-inbox";
import { submitCandidateInterviewFeedback } from "../../interview/routes/feedback/dao";
import type { AgentRouterDependencies, CheckpointPayload, ReportPayload } from "../route";

import { createInterviewRouter } from "../../interview/route";
const liveSession = vi.fn<() => Promise<"active" | "ended" | "unavailable">>();
const interviewRouter = createInterviewRouter({ getLiveSession: liveSession });
async function interviewStatus(path: string) {
  const response = await interviewRouter.request(path, { method: "POST" });
  return response.status;
}

const dependencies: AgentRouterDependencies = {
  ...agentRouterDependencies,
  runKeyInformationJob: async () => {},
  runSummaryJob: async () => {},
};
const agentRouter = createAgentRouter(dependencies);
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
    await db.insert(recruitingContextSnapshot).values({
      aiRoundId: roundId,
      contentHash: crypto.randomUUID(),
      id: crypto.randomUUID(),
      organizationId: org,
      payload: {
        candidate: {
          candidateEmail: null,
          candidateName: "回调候选人",
          candidatePhone: null,
          resumeProfile: null,
          targetRole: "测试岗位",
        },
        createdAt: new Date().toISOString(),
        forms: [],
        globalConfig: {
          closingInstructions: null,
          companyContext: null,
          openingInstructions: null,
        },
        interviewRecordId: recordId,
        interviewers: [],
        jobDescription: { id: "job", name: "测试岗位", prompt: "测试岗位" },
        personalizedQuestions: [],
        questionTemplates: [
          {
            bindingId: "b",
            disabledByUser: false,
            scope: "global",
            snapshot: {
              description: null,
              jobDescriptionIds: [],
              questions: [
                {
                  content: "介绍项目",
                  difficulty: "easy",
                  evaluationFocus: null,
                  followUpDirections: null,
                  id: "q1",
                  sortOrder: 0,
                },
              ],
              scope: "global",
              templateId: "t",
              title: "测试题目",
            },
            sortOrder: 0,
            templateId: "t",
            version: 1,
            versionId: "v",
          },
        ],
        scheduleEntryId: roundId,
        schemaVersion: 1,
      },
      reason: "create",
      recruitingRecordId: recordId,
      version: 1,
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
  it("重复断连不延长宽限；续连只保留原 Agent；房间结束后刷新不再开新面试", async () => {
    process.env.LIVEKIT_API_KEY = "test-key";
    process.env.LIVEKIT_API_SECRET = "test-secret-long-enough-for-token-signing";
    process.env.LIVEKIT_URL = "wss://test.invalid";
    process.env.INTERVIEW_RECORDING_ENABLED = "false";
    const disconnectedAt = new Date(Date.now() - 30_000);
    await db
      .update(aiInterviewRound)
      .set({
        disconnectedAt,
        liveKitParticipantIdentity: "test-candidate",
        sessionStartedAt: new Date(Date.now() - 3 * 24 * 60 * 60_000),
        status: "interrupted",
      })
      .where(eq(aiInterviewRound.id, roundId));
    const path = `/${recordId}/${roundId}`;
    expect(await interviewStatus(`${path}/complete?mode=interrupt`)).toBe(200);
    const [interrupted] = await db
      .select()
      .from(aiInterviewRound)
      .where(eq(aiInterviewRound.id, roundId));
    expect(interrupted?.disconnectedAt).toEqual(disconnectedAt);
    liveSession.mockResolvedValue("active");
    const reconnect = await interviewRouter.request(`${path}/livekit-token`, { method: "POST" });
    expect(reconnect.status).toBe(200);
    const token = await reconnect.json();
    expect(token.isReconnect).toBe(true);
    const claims = JSON.parse(
      Buffer.from(token.participantToken.split(".")[1], "base64url").toString(),
    );
    expect(claims.roomConfig).toBeUndefined();
    liveSession.mockResolvedValue("unavailable");
    expect(await interviewStatus(`${path}/livekit-token`)).toBe(503);
    liveSession.mockResolvedValue("ended");
    expect(await interviewStatus(`${path}/livekit-token`)).toBe(410);
    expect(await interviewStatus(`${path}/livekit-token`)).toBe(403);
    await db
      .update(aiInterviewRound)
      .set({ status: "in_progress" })
      .where(eq(aiInterviewRound.id, roundId));
    expect(await interviewStatus(`${path}/complete?mode=agent`)).toBe(200);
    expect(await interviewStatus(`${path}/complete?mode=interrupt`)).toBe(200);
    const [completed] = await db
      .select()
      .from(aiInterviewRound)
      .where(eq(aiInterviewRound.id, roundId));
    expect(completed?.status).toBe("completed");
    await db
      .update(aiInterviewRound)
      .set({ disconnectedAt: new Date(Date.now() - 4 * 60_000), status: "interrupted" })
      .where(eq(aiInterviewRound.id, roundId));
    expect(await interviewStatus(`${path}/livekit-token`)).toBe(410);
    const [expired] = await db
      .select()
      .from(aiInterviewRound)
      .where(eq(aiInterviewRound.id, roundId));
    expect(expired?.liveKitRoomName).toBe(conversationId);
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
    const resumedOutcome: CheckpointPayload["outcome"] = {
      answerSummary: "候选人先拒绝透露，随后愿意补充，项目团队尚待了解",
      difficulty: "easy",
      endedAtSecs: 35,
      evaluationFocus: null,
      followUpCount: 0,
      followUpDirections: null,
      question: "介绍项目",
      questionId: "question-1",
      reason: null,
      revision: 3,
      startedAtSecs: 10,
      status: "in_progress",
    };
    const refused = await post("/checkpoint", {
      ...identity,
      outcome: { ...resumedOutcome, revision: 2, status: "skipped" },
    });
    expect(refused.status).toBe(201);
    const resumedResponse = await post("/checkpoint", { ...identity, outcome: resumedOutcome });
    expect(resumedResponse.status).toBe(201);
    const [resumed] = await db
      .select()
      .from(aiInterviewConversation)
      .where(eq(aiInterviewConversation.conversationId, conversationId));
    expect(resumed?.dataCollectionResults).toMatchObject({
      questions: [{ questionId: "question-1", revision: 3, status: "in_progress" }],
    });
    // A delayed earlier refusal must not roll the resumed answer back.
    await post("/checkpoint", {
      ...identity,
      outcome: { ...resumedOutcome, revision: 2, status: "skipped" },
    });
    const [afterDelayed] = await db
      .select()
      .from(aiInterviewConversation)
      .where(eq(aiInterviewConversation.conversationId, conversationId));
    expect(afterDelayed?.dataCollectionResults).toMatchObject({
      questions: [{ questionId: "question-1", revision: 3, status: "in_progress" }],
    });
    await post("/checkpoint", {
      ...identity,
      outcome: { ...resumedOutcome, answerSummary: "项目职责", revision: 4, status: "answered" },
    });
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
    const snapshots = await db
      .select()
      .from(recruitingEvidenceSnapshot)
      .where(eq(recruitingEvidenceSnapshot.conversationId, conversationId));
    expect(snapshots).toHaveLength(1);
    expect(snapshots[0]?.payload.transcript).toEqual([
      { message: "我负责项目开发", role: "user", timeInCallSecs: 12 },
    ]);
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
  it("保留首次问答与题目检查点，冲突的后续报告只归档", async () => {
    const response = await post("/report", {
      conversationId,
      interviewRecordId: recordId,
      scheduleEntryId: roundId,
      startedAt: "2026-09-14T07:37:31Z",
      status: "completed",
      transcript: [{ message: "欢迎参加面试", role: "agent", timeInCallSecs: 1 }],
    });
    expect(response.status).toBe(201);
    const [conversation] = await db
      .select()
      .from(aiInterviewConversation)
      .where(eq(aiInterviewConversation.conversationId, conversationId));
    expect(conversation?.transcript).toEqual([
      { message: "我负责项目开发", role: "user", timeInCallSecs: 12 },
    ]);
    expect(conversation?.dataCollectionResults).toMatchObject({
      questions: [expect.objectContaining({ status: "answered" })],
    });
    const receipts = await db
      .select()
      .from(aiInterviewReportReceipt)
      .where(eq(aiInterviewReportReceipt.conversationId, conversationId));
    expect(receipts).toHaveLength(2);
    expect(receipts.map((row) => row.status).toSorted()).toEqual(["archived", "processed"]);
  });
  it("通知索引不匹配不回滚完整报告，修复索引后可重试", async () => {
    process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED = "true";
    await db.execute(sql`DROP INDEX recruiting_notification_event_namespace_dedupe_uq`);
    try {
      const response = await post("/report", {
        conversationId,
        interviewRecordId: recordId,
        scheduleEntryId: roundId,
        status: "completed",
        transcript: [
          { message: "我负责项目开发", role: "user", timeInCallSecs: 12 },
          { message: "项目已上线", role: "user", timeInCallSecs: 30 },
        ],
      });
      expect(response.status).toBe(201);
      const [conversation] = await db
        .select()
        .from(aiInterviewConversation)
        .where(eq(aiInterviewConversation.conversationId, conversationId));
      expect(conversation?.transcript).toHaveLength(2);
      const receipts = await db
        .select()
        .from(aiInterviewReportReceipt)
        .where(eq(aiInterviewReportReceipt.conversationId, conversationId));
      expect(receipts.find((row) => row.status === "applied")?.payload.transcript).toHaveLength(2);
    } finally {
      await db.execute(
        sql`CREATE UNIQUE INDEX recruiting_notification_event_namespace_dedupe_uq ON recruiting_notification_event (queue_namespace, dedupe_key)`,
      );
    }
    await db
      .update(aiInterviewReportReceipt)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(aiInterviewReportReceipt.conversationId, conversationId));
    await retryAgentReportReceipts(dependencies);
    const receipts = await db
      .select()
      .from(aiInterviewReportReceipt)
      .where(eq(aiInterviewReportReceipt.conversationId, conversationId));
    expect(receipts.filter((row) => row.status === "applied")).toHaveLength(0);
    expect(
      await db
        .select()
        .from(recruitingNotificationEvent)
        .where(eq(recruitingNotificationEvent.organizationId, org)),
    ).toHaveLength(1);
    process.env.INTERVIEW_NOTIFICATION_FLOW_ENABLED = "false";
  });
  it("投影事务失败仍保存原始报告并可恢复", async () => {
    const failing = createAgentRouter({
      ...dependencies,
      persistReport: () => Promise.reject(new Error("projection schema unavailable")),
    });
    const payload = {
      conversationId,
      interviewRecordId: recordId,
      scheduleEntryId: roundId,
      status: "completed",
      transcript: [
        { message: "我负责项目开发", role: "user", timeInCallSecs: 12 },
        { message: "项目已上线", role: "user", timeInCallSecs: 30 },
        { message: "谢谢", role: "agent", timeInCallSecs: 35 },
      ],
    };
    const failedProjectionResponse = await failing.request("/report", {
      body: JSON.stringify(payload),
      headers: { "Content-Type": "application/json", "X-Agent-Secret": "test-agent-secret" },
      method: "POST",
    });
    expect(failedProjectionResponse.status).toBe(201);
    const rows = await db
      .select()
      .from(aiInterviewReportReceipt)
      .where(eq(aiInterviewReportReceipt.conversationId, conversationId));
    expect(rows.find((row) => row.status === "pending")?.payload.transcript).toHaveLength(3);
    await db
      .update(aiInterviewReportReceipt)
      .set({ nextAttemptAt: new Date(0) })
      .where(eq(aiInterviewReportReceipt.conversationId, conversationId));
    await retryAgentReportReceipts(dependencies);
    const [conversation] = await db
      .select()
      .from(aiInterviewConversation)
      .where(eq(aiInterviewConversation.conversationId, conversationId));
    expect(conversation?.transcript).toHaveLength(3);
  });
  it("反馈提交响应丢失后可原样重试，不能修改已提交内容", async () => {
    const input = {
      categories: ["audio" as const, "network" as const],
      detail: "面试结束后点击反馈提交没有反应",
      interviewRecordId: recordId,
      roundId,
    };
    const first = await submitCandidateInterviewFeedback(input);
    expect(first).not.toBeNull();
    expect(
      await submitCandidateInterviewFeedback({
        ...input,
        categories: input.categories.toReversed(),
      }),
    ).toEqual(first);
    expect(
      await submitCandidateInterviewFeedback({
        ...input,
        detail: "修改后的反馈内容不能覆盖已提交内容",
      }),
    ).toBeNull();
  });
});
