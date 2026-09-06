import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { createRecruitingRecords, deleteRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
import { updateRecruitingNodeTx } from "@app/database/recruiting-pipeline";
import {
  aiInterviewRound,
  candidate,
  department,
  jobDescription,
  organization,
  recruitingEvent,
  recruitingNodeState,
  recruitingRecord,
} from "@app/db-schema/schema";
import { db } from "../../../../../../lib/server/db/index";
import { transitionCandidateStage } from "./candidate-stage-transition";

const org = `confirm-ai-${crypto.randomUUID()}`;
const suite = process.env.RECRUITING_TEST_DATABASE_URL ? describe : describe.skip;
async function state(f: { recordId: string; roundId: string }) {
  const [record] = await db
    .select()
    .from(recruitingRecord)
    .where(eq(recruitingRecord.id, f.recordId));
  const [round] = await db
    .select()
    .from(aiInterviewRound)
    .where(eq(aiInterviewRound.id, f.roundId));
  const nodes = await db
    .select()
    .from(recruitingNodeState)
    .where(eq(recruitingNodeState.recruitingRecordId, f.recordId));
  return { nodes, record, round };
}

suite("AI 结果确认与复试推进", () => {
  beforeAll(async () => {
    if (
      process.env.DATABASE_URL !== process.env.RECRUITING_TEST_DATABASE_URL ||
      !new URL(process.env.RECRUITING_TEST_DATABASE_URL ?? "").pathname.includes("test")
    ) {
      throw new Error("必须使用独立测试库");
    }
    await db.insert(organization).values({ id: org, name: "结果推进测试", slug: org });
    await db.insert(department).values({ id: org, name: "测试部门", organizationId: org });
    await db
      .insert(jobDescription)
      .values({ departmentId: org, id: org, name: "测试岗位", organizationId: org, prompt: "JD" });
  });
  afterAll(async () => {
    await deleteRecruitingRecords(db, eq(recruitingRecordReadModel.organizationId, org));
    await db.delete(candidate).where(eq(candidate.organizationId, org));
    await db.delete(jobDescription).where(eq(jobDescription.id, org));
    await db.delete(department).where(eq(department.id, org));
    await db.delete(organization).where(eq(organization.id, org));
  });
  async function seed(hasJob = true, nextRound = false) {
    const now = new Date();
    const [record] = await createRecruitingRecords(db, {
      candidateName: "AI推进候选人",
      jobDescriptionId: hasJob ? org : null,
      organizationId: org,
      pipelineStage: "ai_interview",
      resumeEvaluationStatus: "pass",
    });
    if (!record) {
      throw new Error("未创建记录");
    }
    await db
      .update(recruitingNodeState)
      .set({ result: "pass", status: "completed" })
      .where(
        and(
          eq(recruitingNodeState.recruitingRecordId, record.id),
          eq(recruitingNodeState.node, "screening"),
        ),
      );
    const roundId = crypto.randomUUID();
    await db.insert(aiInterviewRound).values({
      createdAt: now,
      id: roundId,
      organizationId: org,
      recruitingRecordId: record.id,
      roundLabel: "AI初面",
      sortOrder: 0,
      status: "completed",
    });
    if (nextRound) {
      await db.insert(aiInterviewRound).values({
        createdAt: now,
        id: crypto.randomUUID(),
        organizationId: org,
        recruitingRecordId: record.id,
        roundLabel: "AI下一轮",
        sortOrder: 1,
        status: "pending",
      });
    }
    const updated = await db.transaction((tx) =>
      updateRecruitingNodeTx(tx, {
        effectiveAiRoundId: roundId,
        node: "ai_interview",
        now,
        operatorId: null,
        organizationId: org,
        recordId: record.id,
        status: "awaiting_review",
      }),
    );
    return { recordId: record.id, roundId, version: updated.version };
  }
  function confirm(
    f: Awaited<ReturnType<typeof seed>>,
    result: "pass" | "fail" = "pass",
    permitted = true,
  ) {
    return transitionCandidateStage(
      {
        authorize: () => Promise.resolve(permitted),
        candidateId: f.recordId,
        input: {
          action: "update_node",
          effectiveAiRoundId: f.roundId,
          expectedVersion: f.version,
          node: "ai_interview",
          reason: "人工确认",
          result,
          targetStatus: "completed",
        },
        operatorId: null,
        organizationId: org,
        provenance: { kind: "manual" },
      },
      { invalidateCaches: vi.fn(), transaction: db.transaction.bind(db) },
    );
  }
  it("末轮通过同事务进入复试，并记录确认与推进，重复请求冲突", async () => {
    const f = await seed();
    expect(await confirm(f)).toMatchObject({
      currentStage: "second_interview",
      kind: "ok",
      version: f.version + 2,
    });
    const current = await state(f);
    expect(current.round.reviewOutcome).toBe("pass");
    expect(current.nodes.find((n) => n.node === "ai_interview")).toMatchObject({
      result: "pass",
      status: "completed",
    });
    expect(current.nodes.find((n) => n.node === "second_interview")).toMatchObject({
      result: null,
      status: "pending",
    });
    const events = await db
      .select()
      .from(recruitingEvent)
      .where(
        and(
          eq(recruitingEvent.recruitingRecordId, f.recordId),
          eq(recruitingEvent.action, "recruiting_node_advanced"),
        ),
      );
    expect(events).toHaveLength(1);
    expect(await confirm(f)).toMatchObject({ kind: "conflict" });
  });
  it("缺少真人权限不确认也不推进", async () => {
    const f = await seed();
    expect(await confirm(f, "pass", false)).toMatchObject({ kind: "forbidden" });
    const current = await state(f);
    expect(current.round.reviewOutcome).toBeNull();
  });
  it("缺少岗位不确认也不推进", async () => {
    const f = await seed(false);
    expect(await confirm(f)).toMatchObject({ kind: "invalid" });
    const current = await state(f);
    expect(current.round.reviewOutcome).toBeNull();
  });
  it("淘汰仍结束 AI 流程，无需真人权限", async () => {
    const f = await seed();
    expect(await confirm(f, "fail", false)).toMatchObject({
      currentStage: "closed",
      kind: "ok",
      outcome: "rejected",
    });
  });
  it("同批还有 AI 轮次时继续 AI，不能提前进入复试", async () => {
    const f = await seed(false, true);
    expect(await confirm(f, "pass", false)).toMatchObject({
      currentStage: "ai_interview",
      kind: "ok",
    });
    const current = await state(f);
    expect(current.nodes.find((n) => n.node === "ai_interview")).toMatchObject({
      result: null,
      status: "scheduled",
    });
  });
});
