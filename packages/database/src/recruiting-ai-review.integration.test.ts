import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import {
  aiInterviewRound,
  candidate,
  organization,
  recruitingNodeState,
} from "@app/db-schema/schema";
import { createDatabase } from "./index";
import { createRecruitingRecords, deleteRecruitingRecords } from "./recruiting-records";
import { recruitingRecordReadModel as read } from "./recruiting-read-model";
import { reopenRecruitingRecordTx, updateRecruitingNodeTx } from "./recruiting-pipeline";
import { reviewAiInterviewRoundTx } from "./recruiting-ai-review";

const testUrl = process.env.RECRUITING_TEST_DATABASE_URL;
describe.skipIf(!testUrl)("AI 多轮人工确认", () => {
  if (testUrl && !new URL(testUrl).pathname.includes("_test_")) {
    throw new Error("必须使用隔离测试库");
  }
  const client = postgres(testUrl ?? "postgres://localhost/unused", { max: 1 });
  const db = createDatabase(client);
  const org = `ai-review-${crypto.randomUUID()}`;
  beforeAll(async () => {
    await db.insert(organization).values({ id: org, name: "AI确认测试", slug: org });
  });
  afterAll(async () => {
    await deleteRecruitingRecords(db, eq(read.organizationId, org));
    await db.delete(candidate).where(eq(candidate.organizationId, org));
    await db.delete(organization).where(eq(organization.id, org));
    await client.end();
  });
  async function fixture() {
    const at = new Date("2026-09-05T01:00:00Z");
    const [record] = await createRecruitingRecords(db, {
      candidateName: "多轮候选人",
      createdAt: at,
      organizationId: org,
      pipelineStage: "ai_interview",
    });
    if (!record) {
      throw new Error("记录创建失败");
    }
    const first = crypto.randomUUID();
    const second = crypto.randomUUID();
    await db.insert(aiInterviewRound).values([
      {
        createdAt: at,
        id: first,
        organizationId: org,
        recruitingRecordId: record.id,
        roundLabel: "一轮",
        sortOrder: 0,
        status: "completed",
      },
      {
        createdAt: at,
        id: second,
        organizationId: org,
        recruitingRecordId: record.id,
        roundLabel: "二轮",
        sortOrder: 1,
        status: "pending",
      },
    ]);
    await db.transaction((tx) =>
      updateRecruitingNodeTx(tx, {
        effectiveAiRoundId: first,
        node: "ai_interview",
        now: at,
        operatorId: null,
        organizationId: org,
        recordId: record.id,
        status: "awaiting_review",
      }),
    );
    return { at, first, recordId: record.id, second };
  }
  it("首轮通过切到同批下一轮，末轮通过才完成节点", async () => {
    const f = await fixture();
    await db.transaction((tx) =>
      reviewAiInterviewRoundTx(tx, {
        operatorId: null,
        organizationId: org,
        outcome: "pass",
        recordId: f.recordId,
        roundId: f.first,
      }),
    );
    const [node] = await db
      .select()
      .from(recruitingNodeState)
      .where(
        and(
          eq(recruitingNodeState.recruitingRecordId, f.recordId),
          eq(recruitingNodeState.node, "ai_interview"),
        ),
      );
    expect(node).toMatchObject({ effectiveAiRoundId: f.second, result: null, status: "scheduled" });
    await db
      .update(aiInterviewRound)
      .set({ status: "completed" })
      .where(eq(aiInterviewRound.id, f.second));
    await db.transaction((tx) =>
      reviewAiInterviewRoundTx(tx, {
        operatorId: null,
        organizationId: org,
        outcome: "pass",
        recordId: f.recordId,
        roundId: f.second,
      }),
    );
    const [done] = await db.select().from(read).where(eq(read.id, f.recordId));
    expect(done).toMatchObject({
      currentStage: "ai_interview",
      result: "pass",
      status: "completed",
    });
  });
  it("回退保留已完成轮次供重新确认，但不会恢复旧排期", async () => {
    const f = await fixture();
    await db.transaction((tx) =>
      reopenRecruitingRecordTx(tx, {
        now: new Date(f.at.getTime() + 1000),
        operatorId: null,
        organizationId: org,
        reason: "重新确认",
        recordId: f.recordId,
        targetNode: "ai_interview",
      }),
    );
    const [reopened] = await db
      .select()
      .from(recruitingNodeState)
      .where(
        and(
          eq(recruitingNodeState.recruitingRecordId, f.recordId),
          eq(recruitingNodeState.node, "ai_interview"),
        ),
      );
    expect(reopened).toMatchObject({
      effectiveAiRoundId: f.first,
      result: null,
      status: "awaiting_review",
    });
    await db.transaction((tx) =>
      reviewAiInterviewRoundTx(tx, {
        operatorId: null,
        organizationId: org,
        outcome: "pass",
        recordId: f.recordId,
        roundId: f.first,
      }),
    );
    const [node] = await db
      .select()
      .from(recruitingNodeState)
      .where(
        and(
          eq(recruitingNodeState.recruitingRecordId, f.recordId),
          eq(recruitingNodeState.node, "ai_interview"),
        ),
      );
    expect(node).toMatchObject({
      effectiveAiRoundId: f.first,
      result: "pass",
      status: "completed",
    });
  });
});
