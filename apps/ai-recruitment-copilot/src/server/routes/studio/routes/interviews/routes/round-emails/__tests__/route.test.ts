// 路由集成测试：round-emails subrouter (POST /:roundId/send + GET /summary)。
// Route integration tests for the round-emails subrouter.
// Mocks Resend + permission middleware; hits the real DB for assertions.

import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/server/db";
import { roundEmailsRouter } from "@/server/routes/studio/routes/interviews/routes/round-emails/route";
import type { Env } from "@/server/type";
import {
  organization,
  studioInterview,
  studioInterviewSchedule,
  studioRoundEmailLog,
  user,
} from "@arc/db-schema/schema";

// vi.mock 被 Vitest 提升（hoisted）；sendMock 用 vi.hoisted 确保在提升后可用。
// vi.mock is hoisted by Vitest; use vi.hoisted so sendMock is available in the factory.
const { sendMock } = vi.hoisted(() => ({ sendMock: vi.fn() }));

vi.mock("@/lib/server/resend", () => ({
  getResendClient: () => ({ emails: { send: sendMock } }),
  getResendFrom: () => "Acme <noreply@example.com>",
}));

// 直通 requirePermission：跳过权限检查，专注路由逻辑。
// Pass-through requirePermission: skip auth so tests focus on route logic.
vi.mock("@/server/middlewares/permission", () => ({
  requirePermission: () => async (_c: unknown, next: () => Promise<void>) => {
    await next();
  },
}));

// ── 测试数据常量（后缀 _route，避免与 dao.test 冲突）────────────────────────
// Test data constants (suffix _route to avoid collision with dao.test data).
const ORG = "test_org_round_emails_route";
const USER_ID = "test_user_round_emails_route";
const INTERVIEW_WITH_EMAIL = "test_int_re_route_with_email";
const INTERVIEW_NO_EMAIL = "test_int_re_route_no_email";
const ROUND_WITH_EMAIL = "test_round_re_route_with_email";
const ROUND_NO_EMAIL = "test_round_re_route_no_email";
const ROUND_SUMMARY_ONLY = "test_round_re_route_summary_only";
const NOW = new Date("2026-05-19T10:00:00.000Z");

async function cleanup() {
  await db.delete(studioRoundEmailLog).where(eq(studioRoundEmailLog.organizationId, ORG));
  await db.delete(studioInterviewSchedule).where(eq(studioInterviewSchedule.organizationId, ORG));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG));
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.delete(user).where(eq(user.id, USER_ID));
}

// ── 注入 c.var 的测试用 Hono 包装应用 ──────────────────────────────────────
// Test wrapper app that injects c.var.activeOrg + c.var.user then mounts the router.
function buildTestApp() {
  const app = new Hono<Env>();
  app.use("*", async (c, next) => {
    c.set("activeOrg", { createdAt: NOW, id: ORG, metadata: null, name: "Test Org", slug: ORG });
    c.set("user", {
      createdAt: NOW.toISOString(),
      email: "route-test@example.com",
      emailVerified: false,
      id: USER_ID,
      image: null,
      name: "Test User",
      updatedAt: NOW.toISOString(),
    });
    c.set("session", null);
    c.set("member", null);
    await next();
  });
  app.route("/", roundEmailsRouter);
  return app;
}

beforeAll(async () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
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

  // 候选人 A：有邮箱 / Candidate A: has email
  await db.insert(studioInterview).values({
    candidateEmail: "candidate@example.com",
    candidateName: "张三",
    createdAt: NOW,
    id: INTERVIEW_WITH_EMAIL,
    organizationId: ORG,
    status: "ready",
    updatedAt: NOW,
  });

  // 候选人 B：无邮箱 / Candidate B: no email
  await db.insert(studioInterview).values({
    candidateName: "李四",
    createdAt: NOW,
    id: INTERVIEW_NO_EMAIL,
    organizationId: ORG,
    status: "ready",
    updatedAt: NOW,
  });

  await db.insert(studioInterviewSchedule).values([
    {
      createdAt: NOW,
      id: ROUND_WITH_EMAIL,
      interviewRecordId: INTERVIEW_WITH_EMAIL,
      organizationId: ORG,
      roundLabel: "一面",
      sortOrder: 0,
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      id: ROUND_NO_EMAIL,
      interviewRecordId: INTERVIEW_NO_EMAIL,
      organizationId: ORG,
      roundLabel: "一面",
      sortOrder: 0,
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      id: ROUND_SUMMARY_ONLY,
      interviewRecordId: INTERVIEW_WITH_EMAIL,
      organizationId: ORG,
      roundLabel: "二面",
      sortOrder: 1,
      updatedAt: NOW,
    },
  ]);
});

afterAll(cleanup);

beforeEach(() => {
  sendMock.mockReset();
});

describe("POST /:roundId/send", () => {
  it("returns 400 when candidate email is missing; send not called", async () => {
    const app = buildTestApp();
    const res = await app.request(`/${ROUND_NO_EMAIL}/send`, { method: "POST" });
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("邮箱");
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("returns 200 on success and persists a sent log in DB", async () => {
    // Resend 返回成功 / Resend returns success
    sendMock.mockResolvedValueOnce({ data: { id: "msg_abc" }, error: null });

    const app = buildTestApp();
    const res = await app.request(`/${ROUND_WITH_EMAIL}/send`, { method: "POST" });
    expect(res.status).toBe(200);

    const body = (await res.json()) as { logId: string; sentAt: string; toEmail: string };
    expect(body.toEmail).toBe("candidate@example.com");
    expect(body.logId).toBeTruthy();

    // 验证 DB 中有 status='sent' 且 resendMessageId='msg_abc' 的日志。
    // Assert DB has a sent log with the expected resendMessageId.
    const [log] = await db
      .select()
      .from(studioRoundEmailLog)
      .where(eq(studioRoundEmailLog.id, body.logId));
    expect(log?.status).toBe("sent");
    expect(log?.resendMessageId).toBe("msg_abc");
  });

  it("returns 400 and persists a failed log when Resend returns an error", async () => {
    // Resend 返回 rate limit 错误 / Resend returns rate limit error
    sendMock.mockResolvedValueOnce({ data: null, error: { message: "rate limit exceeded" } });

    const app = buildTestApp();
    const res = await app.request(`/${ROUND_WITH_EMAIL}/send`, { method: "POST" });
    expect(res.status).toBe(400);

    const body = (await res.json()) as { error: string; logId: string };
    expect(body.error).toContain("rate limit");
    expect(body.logId).toBeTruthy();

    // 验证 DB 中有 status='failed' 且 errorMessage 包含 'rate limit' 的日志。
    // Assert DB has a failed log with the error message.
    const [log] = await db
      .select()
      .from(studioRoundEmailLog)
      .where(eq(studioRoundEmailLog.id, body.logId));
    expect(log?.status).toBe("failed");
    expect(log?.errorMessage).toContain("rate limit");
  });
});

describe("GET /summary", () => {
  it("returns 200 with correct count for rounds with logs, zero for others", async () => {
    // 先发送一封邮件来为 ROUND_WITH_EMAIL 创建日志。
    // Send one email to create a log for ROUND_WITH_EMAIL.
    sendMock.mockResolvedValueOnce({ data: { id: "msg_summary" }, error: null });
    const app = buildTestApp();
    await app.request(`/${ROUND_WITH_EMAIL}/send`, { method: "POST" });

    // 查询摘要：ROUND_WITH_EMAIL 应有 >=1 条，ROUND_SUMMARY_ONLY 应为 0。
    // Query summary: ROUND_WITH_EMAIL should have >=1, ROUND_SUMMARY_ONLY should be 0.
    const res = await app.request(`/summary?roundIds=${ROUND_WITH_EMAIL},${ROUND_SUMMARY_ONLY}`, {
      method: "GET",
    });
    expect(res.status).toBe(200);

    const summary = (await res.json()) as Record<
      string,
      { count: number; lastSentAt: string | null; lastStatus: string | null }
    >;
    expect(summary[ROUND_WITH_EMAIL]?.count).toBeGreaterThanOrEqual(1);
    expect(summary[ROUND_SUMMARY_ONLY]).toEqual({ count: 0, lastSentAt: null, lastStatus: null });
  });
});
