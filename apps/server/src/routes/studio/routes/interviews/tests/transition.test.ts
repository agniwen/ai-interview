import {
  deleteRecruitingRecords,
  createRecruitingRecords,
  updateRecruitingRecords,
} from "@app/recruiting/records";
import { recruitingRecordReadModel } from "@app/recruiting/read-model";
// 候选人阶段流转的集成测试：直接对 DAO/DB 写入做断言，覆盖：
//   1. CHECK 约束：outcome 与 pipelineStage 的不变量在 DB 层强制
//   2. close + reactivate 的 closedAt / closedReason 维护
//   3. 重置后被守卫阻拦的场景（pipelineStage='closed'）
//
// Integration tests for candidate stage transition. Asserts via direct DB
// writes: CHECK constraint, closedAt/closedReason lifecycle, and the reset
// route's pipelineStage='closed' guard.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../../../infrastructure/db/index";
import { member, organization, user } from "@app/db-schema/schema";

const ORG = "test_org_transition";
const USER_ID = "test_user_transition";
const RECORD_ID = "ri_transition_1";
const NOW = new Date("2026-05-22T08:00:00.000Z");

async function cleanup() {
  await deleteRecruitingRecords(db, eq(recruitingRecordReadModel.organizationId, ORG));
  await db.delete(member).where(eq(member.userId, USER_ID));
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.delete(user).where(eq(user.id, USER_ID));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(user).values({
    createdAt: NOW,
    email: "transition@example.com",
    emailVerified: false,
    id: USER_ID,
    name: "transition-test",
    updatedAt: NOW,
  });
  await db.insert(organization).values({
    createdAt: NOW,
    id: ORG,
    name: "Transition Org",
    slug: "test-transition",
  });
  await db.insert(member).values({
    createdAt: NOW,
    id: "m_transition",
    organizationId: ORG,
    role: "owner",
    userId: USER_ID,
  });
  await createRecruitingRecords(db, {
    candidateName: "结束测试",
    createdAt: NOW,
    createdBy: USER_ID,
    id: RECORD_ID,
    interviewQuestions: [],
    organizationId: ORG,
    pipelineStage: "ai_interview",
    updatedAt: NOW,
  });
});

afterAll(async () => {
  await cleanup();
});

// Stage, outcome, and close details belong to the recruiting node transaction; a metadata
// patch must never change them, so invalid combinations cannot be written at all.
describe("candidate transition invariants", () => {
  const patchRecord = (patch: Parameters<typeof updateRecruitingRecords>[2]) =>
    updateRecruitingRecords(db, eq(recruitingRecordReadModel.id, RECORD_ID), patch);

  it("rejects an outcome change outside the recruiting node transaction", async () => {
    await expect(patchRecord({ outcome: "hired" })).rejects.toThrow(
      "流程变化必须通过招聘节点事务执行",
    );
  });

  it("rejects a pipeline stage change outside the recruiting node transaction", async () => {
    await expect(patchRecord({ pipelineStage: "closed" })).rejects.toThrow(
      "流程变化必须通过招聘节点事务执行",
    );
  });

  it("rejects close details outside the recruiting node transaction", async () => {
    await expect(
      patchRecord({
        closedAt: new Date("2026-05-22T09:00:00.000Z"),
        closedReason: "技能匹配度不够",
      }),
    ).rejects.toThrow("结束信息必须通过招聘节点事务执行");
  });

  it("leaves stage, outcome, and close details unchanged after rejected patches", async () => {
    const [row] = await db
      .select({
        closedAt: recruitingRecordReadModel.closedAt,
        closedReason: recruitingRecordReadModel.closedReason,
        outcome: recruitingRecordReadModel.outcome,
        pipelineStage: recruitingRecordReadModel.pipelineStage,
      })
      .from(recruitingRecordReadModel)
      .where(eq(recruitingRecordReadModel.id, RECORD_ID));

    expect(row).toEqual({
      closedAt: null,
      closedReason: null,
      outcome: "in_pipeline",
      pipelineStage: "ai_interview",
    });
  });
});
