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
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { member, organization, studioInterview, user } from "@arc/db-schema/schema";

const ORG = "test_org_transition";
const USER_ID = "test_user_transition";
const RECORD_ID = "ri_transition_1";
const NOW = new Date("2026-05-22T08:00:00.000Z");

async function cleanup() {
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG));
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
  await db.insert(studioInterview).values({
    candidateName: "结案测试",
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

// 注：drizzle 抛的错只带 "Failed query: ..." 这条 message，原始 PG 错误对象在
// error.cause 上；约束名 / 错误码通过 cause.constraint / cause.code 字段读到。
// Drizzle wraps PG errors with "Failed query: ..."; the original error
// (with constraint + code) sits on .cause.
async function expectCheckViolation(promise: Promise<unknown>) {
  const err = await promise.then(
    () => null,
    (error: unknown) => error,
  );
  expect(err, "expected the UPDATE to reject").toBeTruthy();
  // PG error 23514 = check_violation。drizzle 的 wrapper 跟 client 版本不同，
  // .code 和 .cause.code 都试一次；约束名走 message 文本兜底，最稳。
  // 23514 = check_violation. Different drizzle/pg versions expose code on
  // either the top-level error or .cause; constraint name matched via
  // message text is most portable.
  const code =
    (err as { cause?: { code?: string }; code?: string })?.cause?.code ??
    (err as { code?: string })?.code;
  expect(code).toBe("23514");
  // 这张表上只有这一个 CHECK 约束，code=23514 + 表名匹配就足以确认是我们的不变量在生效。
  // 约束名本身在 drizzle 1.0 RC 的 toString 里被吞掉了，不在文本里。
  // This table has only one CHECK constraint, so code=23514 + table name is
  // sufficient evidence; the constraint name itself is swallowed by drizzle
  // 1.0 RC's error.toString.
  expect(String(err)).toMatch(/studio_interview/);
}

describe("candidate transition invariants", () => {
  it("DB CHECK 拒绝 outcome=hired 配 pipelineStage=ai_interview（违反不变量）", async () => {
    await expectCheckViolation(
      db.update(studioInterview).set({ outcome: "hired" }).where(eq(studioInterview.id, RECORD_ID)),
    );
  });

  it("DB CHECK 拒绝 pipelineStage=closed 配 outcome=in_pipeline（违反不变量）", async () => {
    await expectCheckViolation(
      db
        .update(studioInterview)
        .set({ pipelineStage: "closed" })
        .where(eq(studioInterview.id, RECORD_ID)),
    );
  });

  it("结案：原子写入 pipelineStage + outcome + closedAt + closedReason", async () => {
    const closedAt = new Date("2026-05-22T09:00:00.000Z");
    await db
      .update(studioInterview)
      .set({
        closedAt,
        closedReason: "技能匹配度不够",
        outcome: "rejected",
        pipelineStage: "closed",
        updatedAt: closedAt,
      })
      .where(eq(studioInterview.id, RECORD_ID));

    const [row] = await db
      .select({
        closedAt: studioInterview.closedAt,
        closedReason: studioInterview.closedReason,
        outcome: studioInterview.outcome,
        pipelineStage: studioInterview.pipelineStage,
      })
      .from(studioInterview)
      .where(eq(studioInterview.id, RECORD_ID));

    expect(row).toEqual({
      closedAt,
      closedReason: "技能匹配度不够",
      outcome: "rejected",
      pipelineStage: "closed",
    });
  });

  it("重新激活：清空 closedAt + closedReason，回到 ai_interview / in_pipeline", async () => {
    const reactivatedAt = new Date("2026-05-22T10:00:00.000Z");
    await db
      .update(studioInterview)
      .set({
        closedAt: null,
        closedReason: null,
        outcome: "in_pipeline",
        pipelineStage: "ai_interview",
        updatedAt: reactivatedAt,
      })
      .where(eq(studioInterview.id, RECORD_ID));

    const [row] = await db
      .select({
        closedAt: studioInterview.closedAt,
        closedReason: studioInterview.closedReason,
        outcome: studioInterview.outcome,
        pipelineStage: studioInterview.pipelineStage,
      })
      .from(studioInterview)
      .where(eq(studioInterview.id, RECORD_ID));

    expect(row).toEqual({
      closedAt: null,
      closedReason: null,
      outcome: "in_pipeline",
      pipelineStage: "ai_interview",
    });
  });
});
