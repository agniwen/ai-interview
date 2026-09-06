import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import {
  aiInterviewConversation,
  aiInterviewRound,
  candidate,
  organization,
} from "@app/db-schema/schema";
import { createRecruitingRecords, deleteRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel as read } from "@app/database/recruiting-read-model";
import {
  reopenRecruitingRecordTx,
  updateRecruitingNodeTx,
} from "@app/database/recruiting-pipeline";
import { db } from "../../../../../../lib/server/db/index";
import { deleteAiRounds, lockAiRound, updateEffectiveAiProgress } from "./ai-round-lifecycle";

const testUrl = process.env.RECRUITING_TEST_DATABASE_URL;
describe.skipIf(!testUrl)("AI 新表轮次生命周期", () => {
  if (
    !testUrl ||
    process.env.DATABASE_URL !== testUrl ||
    !new URL(testUrl).pathname.includes("_test_")
  ) {
    throw new Error("必须显式配置隔离招聘测试库");
  }
  const org = `ai-lifecycle-${crypto.randomUUID()}`;
  beforeAll(async () => {
    await db.insert(organization).values({ id: org, name: "AI生命周期测试", slug: org });
  });
  afterAll(async () => {
    await deleteRecruitingRecords(db, eq(read.organizationId, org));
    await db.delete(aiInterviewConversation).where(eq(aiInterviewConversation.organizationId, org));
    await db.delete(candidate).where(eq(candidate.organizationId, org));
    await db.delete(organization).where(eq(organization.id, org));
  });
  async function fixture() {
    const [record] = await createRecruitingRecords(db, {
      candidateName: "生命周期候选人",
      organizationId: org,
      pipelineStage: "ai_interview",
    });
    if (!record) {
      throw new Error("创建失败");
    }
    const roundId = crypto.randomUUID();
    await db.insert(aiInterviewRound).values({
      id: roundId,
      organizationId: org,
      recruitingRecordId: record.id,
      roundLabel: "AI初面",
      sortOrder: 0,
    });
    await db.transaction((tx) =>
      updateRecruitingNodeTx(tx, {
        effectiveAiRoundId: roundId,
        node: "ai_interview",
        operatorId: null,
        organizationId: org,
        recordId: record.id,
        status: "scheduled",
      }),
    );
    return { recordId: record.id, roundId };
  }
  it("删除解除双向会话引用并保留历史，最后一轮删除显式回筛选", async () => {
    const f = await fixture();
    const conversationId = crypto.randomUUID();
    await db.insert(aiInterviewConversation).values({
      aiRoundId: f.roundId,
      conversationId,
      mode: "voice",
      organizationId: org,
      recruitingRecordId: f.recordId,
    });
    await db
      .update(aiInterviewRound)
      .set({ conversationId })
      .where(eq(aiInterviewRound.id, f.roundId));
    const deleted = await db.transaction((tx) => deleteAiRounds(tx, [f.roundId], org, null));
    expect(deleted).toEqual({ kind: "ok", removed: [{ interviewRecordId: f.recordId }] });
    const [history] = await db
      .select()
      .from(aiInterviewConversation)
      .where(eq(aiInterviewConversation.conversationId, conversationId));
    expect(history).toMatchObject({ aiRoundId: null, recruitingRecordId: f.recordId });
    const [record] = await db.select().from(read).where(eq(read.id, f.recordId));
    expect(record).toMatchObject({ currentStage: "screening", result: null, status: "pending" });
  });
  it("回退后旧轮次不能获取有效资格，迟到完成不改变新节点", async () => {
    const f = await fixture();
    await db.transaction((tx) =>
      reopenRecruitingRecordTx(tx, {
        operatorId: null,
        organizationId: org,
        reason: "重新筛选",
        recordId: f.recordId,
        targetNode: "screening",
      }),
    );
    const locked = await db.transaction((tx) => lockAiRound(tx, f.roundId, org));
    expect(locked?.isEffective).toBe(false);
    expect(
      await db.transaction((tx) => updateEffectiveAiProgress(tx, f.roundId, "awaiting_review")),
    ).toBe(false);
    const [record] = await db.select().from(read).where(eq(read.id, f.recordId));
    expect(record).toMatchObject({ currentStage: "screening", status: "pending" });
  });
});
