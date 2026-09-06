import { afterAll, beforeAll, describe, expect, it } from "vitest";
import postgres from "postgres";
import { and, eq } from "drizzle-orm";
import { createDatabase } from "@app/database";
import { deleteRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import {
  advanceScreeningRecruitingNodeTx,
  closeRecruitingRecordTx,
  reopenRecruitingRecordTx,
  transitionRecruitingNodeTx,
  updateRecruitingNodeTx,
} from "@app/database/recruiting-pipeline";
import {
  aiInterviewRound,
  candidate,
  humanInterviewRound,
  organization,
  recruitingEvent,
  recruitingFulfillment,
  recruitingNodeState,
  recruitingNodeValues,
  recruitingNotificationDelivery,
  recruitingNotificationEvent,
  recruitingOffer,
  recruitingRecord,
} from "@app/db-schema/schema";
import type { RecruitingNode } from "@app/db-schema/schema";

// 必须显式指定独立测试库；禁止默认连接开发/生产库。
const testUrl = process.env.RECRUITING_TEST_DATABASE_URL;
const suite = testUrl ? describe : describe.skip;
const client = testUrl ? postgres(testUrl, { max: 5 }) : null;
const db = client ? createDatabase(client) : null;
const orgId = `pipeline-test-${crypto.randomUUID()}`;
const otherOrgId = `${orgId}-other`;
const now = new Date("2026-09-05T08:00:00Z");

function database() {
  if (!db) {
    throw new Error("缺少独立招聘测试库 URL。");
  }
  return db;
}
function command(recordId: string) {
  return { now, operatorId: null, organizationId: orgId, recordId };
}
function initialStatus(node: RecruitingNode, stage: RecruitingNode, index: number) {
  if (node === stage) {
    return "pending" as const;
  }
  if (index < recruitingNodeValues.indexOf(stage)) {
    return "skipped" as const;
  }
  return "inactive" as const;
}
async function seed(stage: RecruitingNode = "screening") {
  const id = crypto.randomUUID();
  await database().transaction(async (tx) => {
    await tx
      .insert(candidate)
      .values({ id: `${id}-person`, name: "流程测试人才", organizationId: orgId });
    await tx
      .insert(recruitingRecord)
      .values({ candidateId: `${id}-person`, currentStage: stage, id, organizationId: orgId });
    await tx.insert(recruitingNodeState).values(
      recruitingNodeValues.map((node, index) => ({
        enteredAt: index <= recruitingNodeValues.indexOf(stage) ? now : null,
        node,
        organizationId: orgId,
        recruitingRecordId: id,
        result: node === "screening" && stage !== "screening" ? ("pass" as const) : null,
        status:
          node === "screening" && stage !== "screening"
            ? ("completed" as const)
            : initialStatus(node, stage, index),
      })),
    );
  });
  return id;
}
async function loadNode(recordId: string, target: RecruitingNode) {
  const [row] = await database()
    .select()
    .from(recruitingNodeState)
    .where(
      and(
        eq(recruitingNodeState.recruitingRecordId, recordId),
        eq(recruitingNodeState.node, target),
      ),
    );
  if (!row) {
    throw new Error("测试节点不存在");
  }
  return row;
}
function pass(
  recordId: string,
  target: RecruitingNode,
  evidence: {
    effectiveAiRoundId?: string;
    effectiveHumanRoundId?: string;
    effectiveOfferId?: string;
  } = {},
) {
  return database().transaction((tx) =>
    updateRecruitingNodeTx(tx, {
      ...command(recordId),
      node: target,
      result: "pass",
      status: "completed",
      ...evidence,
    }),
  );
}
function advance(recordId: string, targetNode: RecruitingNode) {
  return database().transaction((tx) =>
    transitionRecruitingNodeTx(tx, { ...command(recordId), targetNode }),
  );
}
async function human(
  recordId: string,
  roundKind: "second_interview" | "final_interview",
  outcome: "pass" | "fail" = "pass",
) {
  const id = crypto.randomUUID();
  await database().insert(humanInterviewRound).values({
    completedAt: now,
    feedback: "有真实反馈",
    format: "online",
    id,
    label: roundKind,
    organizationId: orgId,
    outcome,
    recruitingRecordId: recordId,
    roundKind,
    status: "completed",
  });
  return id;
}

suite("新招聘节点事务真实 SQL", () => {
  beforeAll(async () => {
    if (!testUrl || !new URL(testUrl).pathname.includes("test")) {
      throw new Error("拒绝使用非测试数据库。");
    }
    await database()
      .insert(organization)
      .values([
        { createdAt: now, id: orgId, name: "流程集成测试", slug: orgId },
        { createdAt: now, id: otherOrgId, name: "隔离测试", slug: otherOrgId },
      ]);
  });
  afterAll(async () => {
    if (!client) {
      return;
    }
    await deleteRecruitingRecords(database(), eq(recruitingRecordReadModel.organizationId, orgId));
    await database().delete(organization).where(eq(organization.id, orgId));
    await database().delete(organization).where(eq(organization.id, otherOrgId));
    await client.end();
  });

  it("回开取消旧批次待发通知并释放租约，保留已发送历史", async () => {
    const id = await seed("ai_interview");
    const roundId = crypto.randomUUID();
    await database().insert(aiInterviewRound).values({
      id: roundId,
      organizationId: orgId,
      recruitingRecordId: id,
      roundLabel: "旧批次",
      sortOrder: 0,
      status: "pending",
    });
    const eventId = crypto.randomUUID();
    await database()
      .insert(recruitingNotificationEvent)
      .values({
        aiRoundId: roundId,
        dedupeKey: eventId,
        id: eventId,
        leaseExpiresAt: new Date(now.getTime() + 60_000),
        leaseOwner: "old-worker",
        organizationId: orgId,
        payloadSnapshot: { schemaVersion: 1, timeZone: "Asia/Shanghai" },
        recruitingRecordId: id,
        scopeType: "ai_round",
        status: "processing",
        type: "ai_interview_invited",
      });
    const pendingId = crypto.randomUUID();
    const sentId = crypto.randomUUID();
    await database()
      .insert(recruitingNotificationDelivery)
      .values([
        {
          eventId,
          id: pendingId,
          leaseExpiresAt: new Date(now.getTime() + 60_000),
          leaseOwner: "old-worker",
          organizationId: orgId,
          providerId: "test",
          recipientOpenId: "pending",
          recruitingRecordId: id,
          status: "sending",
          type: "ai_interview_invited",
        },
        {
          eventId,
          id: sentId,
          organizationId: orgId,
          providerId: "test",
          recipientOpenId: "sent",
          recruitingRecordId: id,
          sentAt: now,
          status: "sent",
          type: "ai_interview_invited",
        },
      ]);
    await database().transaction((tx) =>
      reopenRecruitingRecordTx(tx, {
        ...command(id),
        reason: "重新安排面试",
        targetNode: "ai_interview",
      }),
    );
    const [event] = await database()
      .select()
      .from(recruitingNotificationEvent)
      .where(eq(recruitingNotificationEvent.id, eventId));
    expect(event).toMatchObject({ leaseExpiresAt: null, leaseOwner: null, status: "cancelled" });
    const deliveries = await database()
      .select()
      .from(recruitingNotificationDelivery)
      .where(eq(recruitingNotificationDelivery.eventId, eventId));
    expect(deliveries.find((row) => row.id === pendingId)).toMatchObject({
      leaseExpiresAt: null,
      leaseOwner: null,
      status: "cancelled",
    });
    expect(deliveries.find((row) => row.id === sentId)).toMatchObject({
      sentAt: now,
      status: "sent",
    });
  });

  it("从筛选到入职逐节点推进，原子记录每个版本", async () => {
    const id = await seed();
    await pass(id, "screening");
    await advance(id, "ai_interview");
    const aiId = crypto.randomUUID();
    await database().insert(aiInterviewRound).values({
      id: aiId,
      organizationId: orgId,
      recruitingRecordId: id,
      reviewOutcome: "pass",
      roundLabel: "AI 初面",
      sortOrder: 0,
      status: "completed",
    });
    await pass(id, "ai_interview", { effectiveAiRoundId: aiId });
    await advance(id, "second_interview");
    await pass(id, "second_interview", {
      effectiveHumanRoundId: await human(id, "second_interview"),
    });
    await advance(id, "final_interview");
    await pass(id, "final_interview", {
      effectiveHumanRoundId: await human(id, "final_interview"),
    });
    await advance(id, "income_proof");
    await pass(id, "income_proof");
    await advance(id, "offer");
    const offerId = crypto.randomUUID();
    await database().insert(recruitingOffer).values({
      baseSalary: 25_000,
      id: offerId,
      organizationId: orgId,
      position: "工程师",
      recruitingRecordId: id,
      status: "accepted",
      version: 1,
    });
    await pass(id, "offer", { effectiveOfferId: offerId });
    await advance(id, "background_check");
    await pass(id, "background_check");
    await advance(id, "onboarding");
    const completed = await pass(id, "onboarding");
    expect(completed).toMatchObject({ currentStage: "closed", outcome: "hired", version: 15 });
    const events = await database()
      .select()
      .from(recruitingEvent)
      .where(eq(recruitingEvent.recruitingRecordId, id));
    expect(events).toHaveLength(15);
    expect(new Set(events.map((event) => event.pipelineVersion)).size).toBe(15);
    expect(await loadNode(id, "onboarding")).toMatchObject({ result: "pass", status: "completed" });
  });

  it("拒绝未通过推进、无原因跳过、跨租户操作和过期版本", async () => {
    const id = await seed();
    await expect(advance(id, "ai_interview")).rejects.toThrow("筛选标记为通过");
    await expect(
      database().transaction((tx) =>
        transitionRecruitingNodeTx(tx, {
          ...command(id),
          skipNodes: ["screening", "ai_interview"],
          targetNode: "second_interview",
        }),
      ),
    ).rejects.toThrow("筛选标记为通过");
    await expect(
      database().transaction((tx) =>
        updateRecruitingNodeTx(tx, {
          ...command(id),
          node: "screening",
          organizationId: otherOrgId,
          result: "pass",
          status: "completed",
        }),
      ),
    ).rejects.toThrow("不存在");
    await pass(id, "screening");
    await expect(
      database().transaction((tx) =>
        transitionRecruitingNodeTx(tx, {
          ...command(id),
          expectedVersion: 0,
          targetNode: "ai_interview",
        }),
      ),
    ).rejects.toThrow("刷新");
  });

  it.each(["ai_interview", "second_interview"] as const)(
    "筛选显式推进 %s 原子合格、不创建轮次或通知",
    async (targetNode) => {
      const id = await seed();
      const result = await database().transaction((tx) =>
        advanceScreeningRecruitingNodeTx(tx, { ...command(id), expectedVersion: 0, targetNode }),
      );
      expect(result).toMatchObject({ currentStage: targetNode, version: 2 });
      expect(await loadNode(id, "screening")).toMatchObject({
        result: "pass",
        status: "completed",
      });
      expect(await loadNode(id, targetNode)).toMatchObject({
        effectiveAiRoundId: null,
        effectiveHumanRoundId: null,
        result: null,
        status: "pending",
      });
      if (targetNode === "second_interview") {
        expect(await loadNode(id, "ai_interview")).toMatchObject({
          result: null,
          status: "skipped",
        });
      }
      expect(
        await database()
          .select()
          .from(aiInterviewRound)
          .where(eq(aiInterviewRound.recruitingRecordId, id)),
      ).toEqual([]);
      expect(
        await database()
          .select()
          .from(humanInterviewRound)
          .where(eq(humanInterviewRound.recruitingRecordId, id)),
      ).toEqual([]);
      expect(
        await database()
          .select()
          .from(recruitingNotificationEvent)
          .where(eq(recruitingNotificationEvent.recruitingRecordId, id)),
      ).toEqual([]);
    },
  );

  it("筛选显式推进允许已合格，拒绝淘汰及其他节点，并发只成功一次", async () => {
    const passed = await seed();
    await pass(passed, "screening");
    await expect(
      database().transaction((tx) =>
        advanceScreeningRecruitingNodeTx(tx, {
          ...command(passed),
          expectedVersion: 1,
          targetNode: "ai_interview",
        }),
      ),
    ).resolves.toMatchObject({ version: 2 });
    const rejected = await seed();
    await database().transaction((tx) =>
      updateRecruitingNodeTx(tx, {
        ...command(rejected),
        node: "screening",
        result: "fail",
        status: "completed",
      }),
    );
    await expect(
      database().transaction((tx) =>
        advanceScreeningRecruitingNodeTx(tx, {
          ...command(rejected),
          expectedVersion: 1,
          targetNode: "ai_interview",
        }),
      ),
    ).rejects.toThrow();
    await expect(
      database().transaction((tx) =>
        advanceScreeningRecruitingNodeTx(tx, {
          ...command(passed),
          expectedVersion: 2,
          targetNode: "second_interview",
        }),
      ),
    ).rejects.toThrow("只有简历筛选");
    const concurrent = await seed();
    const results = await Promise.allSettled(
      (["ai_interview", "second_interview"] as const).map((targetNode) =>
        database().transaction((tx) =>
          advanceScreeningRecruitingNodeTx(tx, {
            ...command(concurrent),
            expectedVersion: 0,
            targetNode,
          }),
        ),
      ),
    );
    expect(results.filter((value) => value.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((value) => value.status === "rejected")).toHaveLength(1);
  });

  it("筛选显式推进事务后续失败时回滚合格与推进", async () => {
    const id = await seed();
    await expect(
      database().transaction(async (tx) => {
        await advanceScreeningRecruitingNodeTx(tx, {
          ...command(id),
          expectedVersion: 0,
          targetNode: "second_interview",
        });
        throw new Error("模拟事务后续失败");
      }),
    ).rejects.toThrow("模拟事务后续失败");
    expect(await loadNode(id, "screening")).toMatchObject({ result: null, status: "pending" });
    expect(await loadNode(id, "ai_interview")).toMatchObject({ result: null, status: "inactive" });
    expect(
      await database()
        .select()
        .from(recruitingEvent)
        .where(eq(recruitingEvent.recruitingRecordId, id)),
    ).toEqual([]);
  });

  it("筛选不能跳过，通过后可以明确跳过 AI 初面", async () => {
    const id = await seed();
    await expect(
      database().transaction((tx) =>
        transitionRecruitingNodeTx(tx, {
          ...command(id),
          reason: "直接安排复试",
          skipNodes: ["screening", "ai_interview"],
          targetNode: "second_interview",
        }),
      ),
    ).rejects.toThrow("筛选标记为通过");
    expect(await loadNode(id, "screening")).toMatchObject({ result: null, status: "pending" });
    await pass(id, "screening");
    await database().transaction((tx) =>
      transitionRecruitingNodeTx(tx, {
        ...command(id),
        reason: "直接安排复试",
        skipNodes: ["ai_interview"],
        targetNode: "second_interview",
      }),
    );
    expect(await loadNode(id, "screening")).toMatchObject({ result: "pass", status: "completed" });
    expect(await loadNode(id, "ai_interview")).toMatchObject({ result: null, status: "skipped" });
  });

  it("真人通过需要本节点的有效通过轮次和反馈，历史终面不能充当复试", async () => {
    const id = await seed("second_interview");
    await expect(pass(id, "second_interview")).rejects.toThrow("有效面试轮次");
    await expect(
      pass(id, "second_interview", { effectiveHumanRoundId: await human(id, "final_interview") }),
    ).rejects.toThrow("反馈");
    await expect(
      pass(id, "second_interview", {
        effectiveHumanRoundId: await human(id, "second_interview", "fail"),
      }),
    ).rejects.toThrow("反馈");
    await expect(advance(id, "income_proof")).rejects.toThrow("确认通过");
  });

  it("淘汰后回开同节点使旧轮次失效，晚到回调不会重新激活旧结果", async () => {
    const id = await seed("second_interview");
    const roundId = await human(id, "second_interview", "fail");
    await database().transaction((tx) =>
      updateRecruitingNodeTx(tx, {
        ...command(id),
        effectiveHumanRoundId: roundId,
        node: "second_interview",
        status: "scheduled",
      }),
    );
    const failed = await database().transaction((tx) =>
      updateRecruitingNodeTx(tx, {
        ...command(id),
        expectedEffectiveId: roundId,
        node: "second_interview",
        result: "fail",
        status: "completed",
      }),
    );
    expect(failed).toMatchObject({ currentStage: "closed", outcome: "rejected" });
    await database().transaction((tx) =>
      reopenRecruitingRecordTx(tx, {
        ...command(id),
        reason: "候选人申请复核",
        targetNode: "second_interview",
      }),
    );
    expect(await loadNode(id, "second_interview")).toMatchObject({
      effectiveHumanRoundId: null,
      result: null,
      status: "pending",
    });
    await expect(
      database().transaction((tx) =>
        updateRecruitingNodeTx(tx, {
          ...command(id),
          expectedEffectiveId: roundId,
          node: "second_interview",
          result: "fail",
          status: "completed",
        }),
      ),
    ).rejects.toThrow("失效");
    await pass(id, "second_interview", {
      effectiveHumanRoundId: await human(id, "second_interview"),
    });
    await advance(id, "final_interview");
    const rounds = await database()
      .select()
      .from(humanInterviewRound)
      .where(eq(humanInterviewRound.recruitingRecordId, id));
    expect(rounds).toHaveLength(2);
  });

  it("回到 Offer 保留上游，清除下游有效状态和当前办理时间，并冻结历史", async () => {
    const id = await seed("offer");
    const offerId = crypto.randomUUID();
    await database().insert(recruitingOffer).values({
      baseSalary: 10_000,
      id: offerId,
      organizationId: orgId,
      position: "工程师",
      recruitingRecordId: id,
      status: "accepted",
      version: 1,
    });
    await database().insert(recruitingFulfillment).values({
      actualJoiningDate: "2026-09-05",
      backgroundCheckCompletedAt: now,
      backgroundCheckStartedAt: now,
      onboardingConfirmedAt: now,
      organizationId: orgId,
      recruitingRecordId: id,
      selectedOfferId: offerId,
    });
    await pass(id, "offer", { effectiveOfferId: offerId });
    await advance(id, "background_check");
    await database().transaction((tx) =>
      closeRecruitingRecordTx(tx, {
        ...command(id),
        closeReason: "background_check_failed",
        outcome: "rejected",
      }),
    );
    const upstream = await loadNode(id, "income_proof");
    await database().transaction((tx) =>
      reopenRecruitingRecordTx(tx, { ...command(id), reason: "重新协商条款", targetNode: "offer" }),
    );
    expect(await loadNode(id, "income_proof")).toEqual(upstream);
    expect(await loadNode(id, "background_check")).toMatchObject({
      result: null,
      status: "inactive",
    });
    const [fulfillment] = await database()
      .select()
      .from(recruitingFulfillment)
      .where(eq(recruitingFulfillment.recruitingRecordId, id));
    expect(fulfillment).toMatchObject({
      actualJoiningDate: null,
      backgroundCheckCompletedAt: null,
      selectedOfferId: null,
    });
    const events = await database()
      .select()
      .from(recruitingEvent)
      .where(
        and(
          eq(recruitingEvent.recruitingRecordId, id),
          eq(recruitingEvent.action, "recruiting_reopened"),
        ),
      );
    expect(events[0]?.detail.previousFulfillment).toMatchObject({
      actualJoiningDate: "2026-09-05",
      selectedOfferId: offerId,
    });
    const offers = await database()
      .select()
      .from(recruitingOffer)
      .where(eq(recruitingOffer.id, offerId));
    expect(offers).toHaveLength(1);
  });

  it("禁止回开到从未到达的未来节点、从 AI 直接标为已入职", async () => {
    const id = await seed("ai_interview");
    await expect(
      database().transaction((tx) =>
        closeRecruitingRecordTx(tx, { ...command(id), closeReason: "onboarded", outcome: "hired" }),
      ),
    ).rejects.toThrow("入职节点");
    await database().transaction((tx) =>
      closeRecruitingRecordTx(tx, {
        ...command(id),
        closeReason: "candidate_withdrew",
        outcome: "withdrawn",
      }),
    );
    await expect(
      database().transaction((tx) =>
        reopenRecruitingRecordTx(tx, {
          ...command(id),
          reason: "不允许跳未来",
          targetNode: "onboarding",
        }),
      ),
    ).rejects.toThrow("已经到达");
  });

  it("节点完成重试幂等，并发同版本只有一个更新成功", async () => {
    const id = await seed();
    await pass(id, "screening");
    expect(await pass(id, "screening")).toMatchObject({ changed: false, version: 1 });
    const actions = await Promise.allSettled(
      [1, 2].map(() =>
        database().transaction((tx) =>
          transitionRecruitingNodeTx(tx, {
            ...command(id),
            expectedVersion: 1,
            targetNode: "ai_interview",
          }),
        ),
      ),
    );
    expect(actions.filter((action) => action.status === "fulfilled")).toHaveLength(1);
    expect(actions.filter((action) => action.status === "rejected")).toHaveLength(1);
  });
  it("确认入职保存日期和确认人，非法日期不改变流程", async () => {
    const id = await seed("onboarding");
    await expect(
      database().transaction((tx) =>
        closeRecruitingRecordTx(tx, {
          ...command(id),
          closeReason: "onboarded",
          details: { hiredDetails: { actualJoiningDate: "2026-02-31" } },
          outcome: "hired",
        }),
      ),
    ).rejects.toThrow("日期无效");
    const [before] = await database()
      .select()
      .from(recruitingRecord)
      .where(eq(recruitingRecord.id, id));
    expect(before?.currentStage).toBe("onboarding");
    await database().transaction((tx) =>
      closeRecruitingRecordTx(tx, {
        ...command(id),
        closeReason: "onboarded",
        details: { hiredDetails: { actualJoiningDate: "2026-09-05" } },
        outcome: "hired",
      }),
    );
    const [fulfillment] = await database()
      .select()
      .from(recruitingFulfillment)
      .where(eq(recruitingFulfillment.recruitingRecordId, id));
    expect(fulfillment).toMatchObject({
      actualJoiningDate: "2026-09-05",
      onboardingConfirmedAt: now,
      onboardingConfirmedBy: null,
    });
  });
});
