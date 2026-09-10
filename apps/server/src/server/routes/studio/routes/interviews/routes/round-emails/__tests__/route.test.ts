import { deleteRecruitingRecords, createRecruitingRecords } from "@app/database/recruiting-records";
import { recruitingRecordReadModel } from "@app/database/recruiting-read-model";
// 路由集成测试：round-emails subrouter (POST /:roundId/send + GET /summary)。
// Route integration tests for the round-emails subrouter.
// Mocks Resend + permission middleware; hits the real DB for assertions.

import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "../../../../../../../../lib/server/db/index";
import { createRoundEmailsRouter } from "../route";
import { insertRoundEmailLog } from "../dao";
import type { Env } from "../../../../../../../type";
import {
  organization,
  aiInterviewRound,
  recruitingRoundEmailLog,
  user,
} from "@app/db-schema/schema";

const mocks = {
  sendMock: vi.fn(),
  throwOnClient: false,
};

const roundEmailsRouter = createRoundEmailsRouter({
  buildSenderFromAddress: (companyName) => {
    const display = companyName?.trim() ? `${companyName.trim()} AI HR` : "AI HR";
    return `${display} <noreply@example.com>`;
  },
  requirePermission: () => (_c, next) => next(),
  sendEmail: (input) => {
    if (mocks.throwOnClient) {
      throw new Error("RESEND_API_KEY 未配置");
    }
    return mocks.sendMock(input);
  },
});

// ── 测试数据常量（后缀 _route，避免与 dao.test 冲突）────────────────────────
// Test data constants (suffix _route to avoid collision with dao.test data).
const ORG = "test_org_round_emails_route";
const OTHER_ORG = "test_org_round_emails_route_other";
const USER_ID = "test_user_round_emails_route";
const INTERVIEW_WITH_EMAIL = "test_int_re_route_with_email";
const INTERVIEW_NO_EMAIL = "test_int_re_route_no_email";
const ROUND_WITH_EMAIL = "test_round_re_route_with_email";
const ROUND_NO_EMAIL = "test_round_re_route_no_email";
const ROUND_SUMMARY_ONLY = "test_round_re_route_summary_only";
const NOW = new Date("2026-05-19T10:00:00.000Z");

async function cleanup() {
  await db.delete(recruitingRoundEmailLog).where(eq(recruitingRoundEmailLog.organizationId, ORG));
  await db.delete(aiInterviewRound).where(eq(aiInterviewRound.organizationId, ORG));
  await deleteRecruitingRecords(db, eq(recruitingRecordReadModel.organizationId, ORG));
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.delete(organization).where(eq(organization.id, OTHER_ORG));
  await db.delete(user).where(eq(user.id, USER_ID));
}

// ── 注入 c.var 的测试用 Hono 包装应用 ──────────────────────────────────────
// Test wrapper app that injects c.var.activeOrg + c.var.user then mounts the router.
function buildTestAppForOrg(orgId: string) {
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    c.set("activeOrg", {
      createdAt: NOW,
      id: orgId,
      logo: null,
      metadata: null,
      name: "Test Org",
      slug: orgId,
    });
    c.set("user", {
      banExpires: null,
      banReason: null,
      banned: false,
      createdAt: NOW,
      email: "route-test@example.com",
      emailVerified: false,
      feishuTenantKey: null,
      feishuTenantName: null,
      id: USER_ID,
      image: null,
      name: "Test User",
      role: null,
      updatedAt: NOW,
    });
    c.set("session", null);
    c.set("member", null);
    await next();
  });
  app.route("/", roundEmailsRouter);
  return app;
}

function buildTestApp() {
  return buildTestAppForOrg(ORG);
}

beforeAll(async () => {
  process.env.NEXT_PUBLIC_BASE_URL = "https://app.example.com";
  await cleanup();

  await db.insert(user).values({
    createdAt: NOW,
    email: "route-test@example.com",
    emailVerified: false,
    id: USER_ID,
    name: "Test User",
    updatedAt: NOW,
  });
  await db.insert(organization).values({
    createdAt: NOW,
    id: ORG,
    name: "Test Org",
    slug: ORG,
  });
  await db.insert(organization).values({
    createdAt: NOW,
    id: OTHER_ORG,
    name: "Other Org",
    slug: OTHER_ORG,
  });

  // 候选人 A：有邮箱 / Candidate A: has email
  await createRecruitingRecords(db, {
    candidateEmail: "candidate@example.com",
    candidateName: "郭靖",
    createdAt: NOW,
    id: INTERVIEW_WITH_EMAIL,
    organizationId: ORG,
    updatedAt: NOW,
  });

  // 候选人 B：无邮箱 / Candidate B: no email
  await createRecruitingRecords(db, {
    candidateName: "李四",
    createdAt: NOW,
    id: INTERVIEW_NO_EMAIL,
    organizationId: ORG,
    updatedAt: NOW,
  });

  await db.insert(aiInterviewRound).values([
    {
      createdAt: NOW,
      id: ROUND_WITH_EMAIL,
      organizationId: ORG,
      recruitingRecordId: INTERVIEW_WITH_EMAIL,
      roundLabel: "一面",
      sortOrder: 0,
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      id: ROUND_NO_EMAIL,
      organizationId: ORG,
      recruitingRecordId: INTERVIEW_NO_EMAIL,
      roundLabel: "一面",
      sortOrder: 0,
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      id: ROUND_SUMMARY_ONLY,
      organizationId: ORG,
      recruitingRecordId: INTERVIEW_WITH_EMAIL,
      roundLabel: "二面",
      sortOrder: 1,
      updatedAt: NOW,
    },
  ]);
});

afterAll(cleanup);

beforeEach(() => {
  mocks.sendMock.mockReset();
  mocks.throwOnClient = false;
});

describe("POST /:roundId/send", () => {
  it.each([ROUND_WITH_EMAIL, ROUND_NO_EMAIL, "nonexistent-round"])(
    "returns 503 while candidate emails are paused: %s",
    async (roundId) => {
      const app = buildTestAppForOrg(ORG);
      const response = await app.request(`/${roundId}/send`, { method: "POST" });
      expect(response.status).toBe(503);
      expect(mocks.sendMock).not.toHaveBeenCalled();
    },
  );
});

describe("GET /summary", () => {
  it("returns 200 with correct count for rounds with logs, zero for others", async () => {
    // 暂停发送后，直接准备历史日志来验证摘要仍可读取，不调用发信接口。
    await insertRoundEmailLog({
      errorMessage: null,
      interviewRecordId: INTERVIEW_WITH_EMAIL,
      organizationId: ORG,
      resendMessageId: "historical-message",
      roundId: ROUND_WITH_EMAIL,
      sentBy: USER_ID,
      status: "sent",
      subject: "历史面试邀请",
      toEmail: "candidate@example.com",
    });
    const app = buildTestApp();

    // 查询摘要：ROUND_WITH_EMAIL 应有 >=1 条，ROUND_SUMMARY_ONLY 应为 0。
    // Query summary: ROUND_WITH_EMAIL should have >=1, ROUND_SUMMARY_ONLY should be 0.
    const res = await app.request(`/summary?roundIds=${ROUND_WITH_EMAIL},${ROUND_SUMMARY_ONLY}`, {
      method: "GET",
    });
    expect(res.status).toBe(200);

    // SAFETY: This test constructs the value with the asserted contract before this boundary.
    const summary = (await res.json()) as Record<
      string,
      { count: number; lastSentAt: string | null; lastStatus: string | null }
    >;
    expect(summary[ROUND_WITH_EMAIL]?.count).toBeGreaterThanOrEqual(1);
    expect(summary[ROUND_SUMMARY_ONLY]).toEqual({ count: 0, lastSentAt: null, lastStatus: null });
  });
});
