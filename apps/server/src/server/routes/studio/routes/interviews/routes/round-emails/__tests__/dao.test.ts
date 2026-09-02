// 真实 DB 集成测试：邮件日志插入 + 轮次摘要聚合。
// Per project memory: 用真实数据库，不 mock。
//
// Real-DB integration tests for round-emails DAO — insert log + summarize per round.
// Hits the live test database — no mocks.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../../../../../../lib/server/db/index";
import {
  organization,
  studioInterview,
  studioInterviewSchedule,
  studioRoundEmailLog,
  user,
} from "@app/db-schema/schema";
import { insertRoundEmailLog, summarizeRoundEmailLogs } from "../dao";

const ORG = "test_org_round_emails_dao";
const ORG_OTHER = "test_org_round_emails_dao_other";
const USER_ID = "test_user_round_emails_dao";
const INTERVIEW_ID = "test_int_round_emails";
const ROUND_A = "test_round_a";
const ROUND_B = "test_round_b";
const NOW = new Date("2026-05-19T12:00:00.000Z");

async function cleanup() {
  for (const orgId of [ORG, ORG_OTHER]) {
    await db.delete(studioRoundEmailLog).where(eq(studioRoundEmailLog.organizationId, orgId));
    await db
      .delete(studioInterviewSchedule)
      .where(eq(studioInterviewSchedule.organizationId, orgId));
    await db.delete(studioInterview).where(eq(studioInterview.organizationId, orgId));
    await db.delete(organization).where(eq(organization.id, orgId));
  }
  await db.delete(user).where(eq(user.id, USER_ID));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(user).values({
    createdAt: NOW,
    email: "round-emails-dao@example.com",
    emailVerified: false,
    id: USER_ID,
    name: "rd",
    updatedAt: NOW,
  });
  for (const orgId of [ORG, ORG_OTHER]) {
    await db.insert(organization).values({
      createdAt: NOW,
      id: orgId,
      name: `Org ${orgId}`,
      slug: orgId,
    });
  }
  await db.insert(studioInterview).values({
    candidateName: "Test",
    createdAt: NOW,
    id: INTERVIEW_ID,
    organizationId: ORG,
    updatedAt: NOW,
  });
  await db.insert(studioInterviewSchedule).values([
    {
      createdAt: NOW,
      id: ROUND_A,
      interviewRecordId: INTERVIEW_ID,
      organizationId: ORG,
      roundLabel: "Round A",
      sortOrder: 0,
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      id: ROUND_B,
      interviewRecordId: INTERVIEW_ID,
      organizationId: ORG,
      roundLabel: "Round B",
      sortOrder: 1,
      updatedAt: NOW,
    },
  ]);
});

afterAll(cleanup);

describe("round-emails dao", () => {
  it("insertRoundEmailLog persists a row", async () => {
    const log = await insertRoundEmailLog({
      errorMessage: null,
      interviewRecordId: INTERVIEW_ID,
      organizationId: ORG,
      resendMessageId: "msg_1",
      roundId: ROUND_A,
      sentBy: USER_ID,
      status: "sent",
      subject: "Round A 面试邀请",
      toEmail: "a@example.com",
    });
    expect(log.id).toBeTruthy();
    expect(log.status).toBe("sent");
  });

  it("summarizeRoundEmailLogs returns count + last sent timestamp + last status", async () => {
    await insertRoundEmailLog({
      errorMessage: "boom",
      interviewRecordId: INTERVIEW_ID,
      organizationId: ORG,
      resendMessageId: null,
      roundId: ROUND_A,
      sentBy: USER_ID,
      status: "failed",
      subject: "Round A 面试邀请",
      toEmail: "a@example.com",
    });
    const summary = await summarizeRoundEmailLogs(ORG, [ROUND_A, ROUND_B]);
    expect(summary[ROUND_A]?.count).toBe(2);
    expect(summary[ROUND_A]?.lastStatus).toBe("failed");
    expect(summary[ROUND_A]?.lastSentAt).toBeTruthy();
    expect(summary[ROUND_B]).toEqual({ count: 0, lastSentAt: null, lastStatus: null });
  });

  it("summarizeRoundEmailLogs ignores other organizations", async () => {
    const summary = await summarizeRoundEmailLogs(ORG_OTHER, [ROUND_A]);
    expect(summary[ROUND_A]).toEqual({ count: 0, lastSentAt: null, lastStatus: null });
  });
});
