import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { createRecruitingRecords, deleteRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import {
  closeRecruitingRecordTx,
  updateRecruitingNodeTx,
  reopenRecruitingRecordTx,
  transitionRecruitingNodeTx,
} from "@app/database/recruiting-pipeline";
import {
  humanInterviewRound,
  humanInterviewRoundInterviewer,
  organization,
  recruitingNodeState,
  recruitingRecord,
  user,
} from "@app/db-schema/schema";
import { db } from "../lib/server/db/index";
import {
  createOfferDraft,
  sendOfferDraft,
  respondOfferDraft,
} from "../server/routes/studio/routes/interviews/dao/offer-drafts";
import {
  createHumanInterviewRound,
  completeHumanInterviewRound,
  cancelHumanInterviewRound,
  editHumanInterviewRound,
} from "../server/routes/studio/routes/interviews/dao/human-interview-rounds";

const suite = process.env.RECRUITING_TEST_DATABASE_URL ? describe : describe.skip;
const orgId = `human-pipeline-${crypto.randomUUID()}`;
const interviewer = `${orgId}-interviewer`;
function command(recordId: string) {
  return { operatorId: null, organizationId: orgId, recordId };
}
async function seed() {
  const id = crypto.randomUUID();
  await createRecruitingRecords(db, {
    candidateName: "真人流程测试",
    id,
    organizationId: orgId,
    pipelineStage: "screening",
    resumeEvaluationStatus: "pass",
  });
  return id;
}
function create(
  recordId: string,
  roundKind: "second_interview" | "final_interview" = "second_interview",
  expectedVersion?: number,
) {
  return createHumanInterviewRound({
    input: { expectedVersion, format: "online", interviewerIds: [], label: roundKind, roundKind },
    interviewRecordId: recordId,
    organizationId: orgId,
  });
}
async function active(recordId: string, node: "second_interview" | "final_interview") {
  const [row] = await db
    .select()
    .from(recruitingNodeState)
    .where(
      and(eq(recruitingNodeState.recruitingRecordId, recordId), eq(recruitingNodeState.node, node)),
    );
  return row;
}

suite("真人面试与新招聘节点集成", () => {
  beforeAll(async () => {
    if (
      process.env.DATABASE_URL !== process.env.RECRUITING_TEST_DATABASE_URL ||
      !new URL(process.env.RECRUITING_TEST_DATABASE_URL ?? "").pathname.includes("test")
    ) {
      throw new Error("必须使用独立测试库。");
    }
    await db.insert(organization).values({ id: orgId, name: "真人流程测试", slug: orgId });
    await db
      .insert(user)
      .values({ email: `${interviewer}@example.invalid`, id: interviewer, name: "面试官" });
  });
  afterAll(async () => {
    await deleteRecruitingRecords(db, eq(recruitingRecordReadModel.organizationId, orgId));
    await db.delete(organization).where(eq(organization.id, orgId));
    await db.delete(user).where(eq(user.id, interviewer));
  });
  it("筛选通过后快捷真人创建只跳过 AI 并绑定复试，不能跳到终试", async () => {
    const id = await seed();
    await expect(create(id, "final_interview")).rejects.toThrow("前序");
    const round = await create(id);
    expect(round.roundKind).toBe("second_interview");
    expect(await active(id, "second_interview")).toMatchObject({
      effectiveHumanRoundId: round.id,
      status: "scheduled",
    });
    const before = await db
      .select()
      .from(recruitingNodeState)
      .where(
        and(
          eq(recruitingNodeState.recruitingRecordId, id),
          eq(recruitingNodeState.node, "screening"),
        ),
      );
    expect(before[0]).toMatchObject({ result: "pass", status: "completed" });
  });
  it("复试通过后才能安排终试，终试淘汰原子结束后可回开重试", async () => {
    const id = await seed();
    const second = await create(id);
    await expect(create(id, "final_interview")).rejects.toThrow("通过");
    await completeHumanInterviewRound({
      feedback: "复试通过",
      organizationId: orgId,
      outcome: "pass",
      roundId: second.id,
    });
    const final = await create(id, "final_interview");
    await completeHumanInterviewRound({
      feedback: "终试未通过",
      organizationId: orgId,
      outcome: "fail",
      roundId: final.id,
    });
    const [record] = await db.select().from(recruitingRecord).where(eq(recruitingRecord.id, id));
    expect(record).toMatchObject({
      closeReason: "interview_failed",
      closedFromNode: "final_interview",
      currentStage: "closed",
    });
    await db.transaction((tx) =>
      reopenRecruitingRecordTx(tx, {
        ...command(id),
        reason: "补充复核",
        targetNode: "final_interview",
      }),
    );
    const replacement = await create(id, "final_interview");
    expect(replacement.id).not.toBe(final.id);
    expect(await active(id, "second_interview")).toMatchObject({
      effectiveHumanRoundId: second.id,
      result: "pass",
      status: "completed",
    });
  });
  it("取消清除当前轮次，两个同时安排请求只有一个创建成功", async () => {
    const id = await seed();
    const first = await create(id);
    await cancelHumanInterviewRound({ organizationId: orgId, roundId: first.id });
    expect(await active(id, "second_interview")).toMatchObject({
      effectiveHumanRoundId: null,
      status: "pending",
    });
    const results = await Promise.allSettled([create(id), create(id)]);
    expect(results.filter((value) => value.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((value) => value.status === "rejected")).toHaveLength(1);
  });
  it("回开后旧轮次完成只保存历史，不覆盖新有效轮次", async () => {
    const id = await seed();
    const old = await create(id);
    await db.transaction((tx) =>
      closeRecruitingRecordTx(tx, {
        ...command(id),
        closeReason: "candidate_withdrew",
        outcome: "withdrawn",
      }),
    );
    await db.transaction((tx) =>
      reopenRecruitingRecordTx(tx, {
        ...command(id),
        reason: "再次应聘",
        targetNode: "second_interview",
      }),
    );
    const current = await create(id);
    await completeHumanInterviewRound({
      feedback: "晚到历史结果",
      organizationId: orgId,
      outcome: "pass",
      roundId: old.id,
    });
    expect(await active(id, "second_interview")).toMatchObject({
      effectiveHumanRoundId: current.id,
      result: null,
      status: "scheduled",
    });
    const [historical] = await db
      .select()
      .from(humanInterviewRound)
      .where(eq(humanInterviewRound.id, old.id));
    expect(historical).toMatchObject({ outcome: "pass", status: "completed" });
    await expect(
      db.transaction((tx) =>
        transitionRecruitingNodeTx(tx, { ...command(id), targetNode: "income_proof" }),
      ),
    ).rejects.toThrow("通过");
  });
  it("过期创建版本不生成轮次，清空面试官列表同步清空关联", async () => {
    const id = await seed();
    const round = await createHumanInterviewRound({
      input: {
        format: "online",
        interviewerIds: [interviewer],
        label: "复试",
        roundKind: "second_interview",
      },
      interviewRecordId: id,
      organizationId: orgId,
    });
    await expect(create(id, "second_interview", 0)).rejects.toThrow("刷新");
    await editHumanInterviewRound({
      input: { interviewerIds: [] },
      organizationId: orgId,
      roundId: round.id,
    });
    const rows = await db
      .select()
      .from(humanInterviewRoundInterviewer)
      .where(eq(humanInterviewRoundInterviewer.roundId, round.id));
    expect(rows).toHaveLength(0);
  });
  it("实际真人与 Offer 动作贯通入职；谈薪拒绝和背调失败后可回开", async () => {
    const id = await seed();
    const second = await create(id);
    await completeHumanInterviewRound({
      feedback: "复试通过",
      organizationId: orgId,
      outcome: "pass",
      roundId: second.id,
    });
    const final = await create(id, "final_interview");
    await completeHumanInterviewRound({
      feedback: "终试通过",
      organizationId: orgId,
      outcome: "pass",
      roundId: final.id,
    });
    await db.transaction((tx) =>
      transitionRecruitingNodeTx(tx, { ...command(id), targetNode: "income_proof" }),
    );
    await db.transaction((tx) =>
      updateRecruitingNodeTx(tx, {
        ...command(id),
        node: "income_proof",
        result: "pass",
        status: "completed",
      }),
    );
    await db.transaction((tx) =>
      transitionRecruitingNodeTx(tx, { ...command(id), targetNode: "offer" }),
    );
    const first = await createOfferDraft({
      input: { baseSalary: 20_000, position: "测试岗位" },
      interviewRecordId: id,
      organizationId: orgId,
    });
    await sendOfferDraft(first.id, orgId);
    await respondOfferDraft({
      candidateCounter: "希望调整薪资",
      draftId: first.id,
      organizationId: orgId,
      response: "counter",
    });
    await respondOfferDraft({ draftId: first.id, organizationId: orgId, response: "declined" });
    let [record] = await db.select().from(recruitingRecord).where(eq(recruitingRecord.id, id));
    expect(record).toMatchObject({ closeReason: "offer_declined", currentStage: "closed" });
    await db.transaction((tx) =>
      reopenRecruitingRecordTx(tx, { ...command(id), reason: "重新谈薪", targetNode: "offer" }),
    );
    const offer = await createOfferDraft({
      input: { baseSalary: 22_000, position: "测试岗位" },
      interviewRecordId: id,
      organizationId: orgId,
    });
    await sendOfferDraft(offer.id, orgId);
    await respondOfferDraft({ draftId: offer.id, organizationId: orgId, response: "accepted" });
    await db.transaction((tx) =>
      transitionRecruitingNodeTx(tx, { ...command(id), targetNode: "background_check" }),
    );
    await db.transaction((tx) =>
      updateRecruitingNodeTx(tx, {
        ...command(id),
        node: "background_check",
        result: "fail",
        status: "completed",
      }),
    );
    [record] = await db.select().from(recruitingRecord).where(eq(recruitingRecord.id, id));
    expect(record).toMatchObject({
      closeReason: "background_check_failed",
      currentStage: "closed",
    });
    await db.transaction((tx) =>
      reopenRecruitingRecordTx(tx, {
        ...command(id),
        reason: "补充背调证据",
        targetNode: "background_check",
      }),
    );
    await db.transaction((tx) =>
      updateRecruitingNodeTx(tx, {
        ...command(id),
        node: "background_check",
        result: "pass",
        status: "completed",
      }),
    );
    await db.transaction((tx) =>
      transitionRecruitingNodeTx(tx, { ...command(id), targetNode: "onboarding" }),
    );
    await db.transaction((tx) =>
      closeRecruitingRecordTx(tx, {
        ...command(id),
        closeReason: "onboarding_no_show",
        outcome: "withdrawn",
      }),
    );
    await db.transaction((tx) =>
      reopenRecruitingRecordTx(tx, {
        ...command(id),
        reason: "候选人重新确认入职",
        targetNode: "onboarding",
      }),
    );
    const hired = await db.transaction((tx) =>
      closeRecruitingRecordTx(tx, {
        ...command(id),
        closeReason: "onboarded",
        details: { actualJoiningDate: "2026-09-05" },
        outcome: "hired",
      }),
    );
    expect(hired).toMatchObject({ currentStage: "closed", outcome: "hired" });
  }, 60_000);
});
