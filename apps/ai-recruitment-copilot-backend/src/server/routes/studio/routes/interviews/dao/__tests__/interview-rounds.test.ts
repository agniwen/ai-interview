// 真实 DB 集成测试：按轮次维度查询 + 详情 + 计数聚合。
// Per project memory: 用真实数据库，不 mock。
//
// Real-DB integration tests for the round-keyed DAO. Per project memory,
// hits the live test database — no mocks.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  interviewConversation,
  member,
  organization,
  studioInterview,
  studioInterviewSchedule,
  user,
} from "@arc/db-schema/schema";
import {
  loadInterviewRoundDetail,
  queryPaginatedInterviewRounds,
  summarizeInterviewRoundCounts,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/interview-rounds";
import { loadAiCalendarEventPreview } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/calendar/dao";

const ORG = "test_org_interview_rounds";
const USER_ID = "test_user_interview_rounds";
const USER_ID_ALT = "test_user_interview_rounds_alt";
const NOW = new Date("2026-05-13T15:00:00.000Z");

async function cleanup() {
  await db.delete(studioInterviewSchedule).where(eq(studioInterviewSchedule.organizationId, ORG));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG));
  await db.delete(member).where(eq(member.userId, USER_ID));
  await db.delete(member).where(eq(member.userId, USER_ID_ALT));
  await db.delete(organization).where(eq(organization.id, ORG));
  await db.delete(user).where(eq(user.id, USER_ID));
  await db.delete(user).where(eq(user.id, USER_ID_ALT));
}

beforeAll(async () => {
  await cleanup();
  await db.insert(user).values([
    {
      createdAt: NOW,
      email: "rounds-dao@example.com",
      emailVerified: false,
      id: USER_ID,
      name: "rd",
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      email: "rounds-dao-alt@example.com",
      emailVerified: false,
      id: USER_ID_ALT,
      name: "rd-alt",
      updatedAt: NOW,
    },
  ]);
  await db.insert(organization).values({
    createdAt: NOW,
    id: ORG,
    name: "Org Rounds",
    slug: "test-rounds-dao",
  });
  await db.insert(member).values([
    {
      createdAt: NOW,
      id: "m_rounds",
      organizationId: ORG,
      role: "owner",
      userId: USER_ID,
    },
    {
      createdAt: NOW,
      id: "m_rounds_alt",
      organizationId: ORG,
      role: "member",
      userId: USER_ID_ALT,
    },
  ]);

  // Candidate A with 2 rounds
  await db.insert(studioInterview).values({
    candidateName: "郭靖",
    createdAt: NOW,
    createdBy: USER_ID,
    id: "cand-a",
    interviewQuestions: [],
    organizationId: ORG,
    resumeProfile: null,
    targetRole: "前端工程师",
    updatedAt: NOW,
  });
  await db.insert(studioInterviewSchedule).values([
    {
      allowTextInput: true,
      createdAt: NOW,
      createdBy: USER_ID,
      id: "rnd-a1",
      interviewRecordId: "cand-a",
      organizationId: ORG,
      roundLabel: "一面",
      scheduledAt: new Date("2026-05-14T10:00:00.000Z"),
      sortOrder: 0,
      status: "pending",
      updatedAt: NOW,
    },
    {
      allowTextInput: false,
      createdAt: NOW,
      createdBy: USER_ID,
      id: "rnd-a2",
      interviewRecordId: "cand-a",
      organizationId: ORG,
      roundLabel: "二面",
      scheduledAt: null,
      sortOrder: 1,
      status: "pending",
      updatedAt: NOW,
    },
  ]);

  // Candidate B with 1 round (completed)
  await db.insert(studioInterview).values({
    candidateName: "李四",
    createdAt: NOW,
    createdBy: USER_ID,
    id: "cand-b",
    interviewQuestions: [],
    organizationId: ORG,
    resumeProfile: null,
    targetRole: "后端工程师",
    updatedAt: NOW,
  });
  await db.insert(studioInterviewSchedule).values({
    allowTextInput: true,
    createdAt: NOW,
    createdBy: USER_ID_ALT,
    id: "rnd-b1",
    interviewRecordId: "cand-b",
    organizationId: ORG,
    roundLabel: "一面",
    scheduledAt: new Date("2026-05-12T10:00:00.000Z"),
    sortOrder: 0,
    status: "completed",
    updatedAt: NOW,
  });
});

afterAll(cleanup);

describe("queryPaginatedInterviewRounds", () => {
  it("returns 3 rows (one per round) joined with candidate info", async () => {
    const result = await queryPaginatedInterviewRounds(ORG);

    expect(result.total).toBe(3);
    expect(result.records).toHaveLength(3);
    const byRound = Object.fromEntries(result.records.map((r) => [r.id, r]));
    expect(byRound["rnd-a1"]?.candidateName).toBe("郭靖");
    expect(byRound["rnd-a1"]?.roundLabel).toBe("一面");
    expect(byRound["rnd-a2"]?.candidateName).toBe("郭靖");
    expect(byRound["rnd-b1"]?.candidateName).toBe("李四");
  });

  it("scopes by organizationId", async () => {
    const result = await queryPaginatedInterviewRounds("other_org_no_data");
    expect(result.total).toBe(0);
    expect(result.records).toHaveLength(0);
  });

  it("filters by status (CSV)", async () => {
    const result = await queryPaginatedInterviewRounds(ORG, { status: "completed" });
    expect(result.total).toBe(1);
    expect(result.records[0]?.id).toBe("rnd-b1");
  });

  it("filters by creatorIds", async () => {
    const byOwner = await queryPaginatedInterviewRounds(ORG, { creatorIds: [USER_ID] });
    expect(byOwner.total).toBe(2);
    expect(byOwner.records.map((row) => row.id).toSorted()).toEqual(["rnd-a1", "rnd-a2"]);

    const byMember = await queryPaginatedInterviewRounds(ORG, { creatorIds: [USER_ID_ALT] });
    expect(byMember.total).toBe(1);
    expect(byMember.records[0]?.id).toBe("rnd-b1");
    expect(byMember.records[0]?.createdBy).toBe(USER_ID_ALT);
  });

  it("intersects creator filters with recruiting visibility scope", async () => {
    const result = await queryPaginatedInterviewRounds(
      ORG,
      { creatorIds: [USER_ID, USER_ID_ALT] },
      undefined,
      { kind: "restricted", userIds: [USER_ID_ALT] },
    );

    expect(result.total).toBe(1);
    expect(result.records[0]?.id).toBe("rnd-b1");
  });

  it("filters by search across candidate name + round label", async () => {
    const byName = await queryPaginatedInterviewRounds(ORG, { search: "郭靖" });
    expect(byName.total).toBe(2);
    const byRound = await queryPaginatedInterviewRounds(ORG, { search: "二面" });
    expect(byRound.total).toBe(1);
    expect(byRound.records[0]?.id).toBe("rnd-a2");
  });

  it("serializes lastInterviewAt from conversation timestamps without timezone loss", async () => {
    const startedAt = new Date("2026-05-13T10:00:00.000Z");
    await db.insert(interviewConversation).values({
      conversationId: "conv_rounds_dao_last_interview_at",
      createdAt: new Date("2026-05-13T09:00:00.000Z"),
      interviewRecordId: "cand-a",
      lastSyncedAt: NOW,
      organizationId: ORG,
      scheduleEntryId: "rnd-a1",
      startedAt,
      status: "completed",
      updatedAt: NOW,
    });

    try {
      const result = await queryPaginatedInterviewRounds(ORG);
      const row = result.records.find((record) => record.id === "rnd-a1");
      expect(row?.lastInterviewAt).toBe(startedAt.toISOString());
    } finally {
      await db
        .delete(interviewConversation)
        .where(eq(interviewConversation.conversationId, "conv_rounds_dao_last_interview_at"));
    }
  });
});

describe("loadInterviewRoundDetail", () => {
  it("loads a round with candidate snapshot", async () => {
    const detail = await loadInterviewRoundDetail("rnd-a1", ORG);
    expect(detail).not.toBeNull();
    expect(detail?.id).toBe("rnd-a1");
    expect(detail?.roundLabel).toBe("一面");
    expect(detail?.candidate.id).toBe("cand-a");
    expect(detail?.candidate.candidateName).toBe("郭靖");
    expect(detail?.candidate.targetRole).toBe("前端工程师");
  });

  it("applies recruiting visibility scope to round detail loads", async () => {
    const allowed = await loadInterviewRoundDetail("rnd-b1", ORG, {
      kind: "restricted",
      userIds: [USER_ID_ALT],
    });
    const blocked = await loadInterviewRoundDetail("rnd-a1", ORG, {
      kind: "restricted",
      userIds: [USER_ID_ALT],
    });

    expect(allowed?.id).toBe("rnd-b1");
    expect(blocked).toBeNull();
  });

  it("returns null on org mismatch", async () => {
    const detail = await loadInterviewRoundDetail("rnd-a1", "other_org_no_data");
    expect(detail).toBeNull();
  });

  it("returns null on unknown id", async () => {
    const detail = await loadInterviewRoundDetail("nope", ORG);
    expect(detail).toBeNull();
  });
});

describe("loadAiCalendarEventPreview", () => {
  it("uses the candidate owner for recruiting visibility when the round creator differs", async () => {
    const allowed = await loadAiCalendarEventPreview({
      organizationId: ORG,
      roundId: "rnd-b1",
      visibilityScope: { kind: "restricted", userIds: [USER_ID] },
    });
    const blocked = await loadAiCalendarEventPreview({
      organizationId: ORG,
      roundId: "rnd-b1",
      visibilityScope: { kind: "restricted", userIds: [USER_ID_ALT] },
    });

    expect(allowed?.round.id).toBe("rnd-b1");
    expect(blocked).toBeNull();
  });
});

describe("summarizeInterviewRoundCounts", () => {
  it("counts by round status", async () => {
    const summary = await summarizeInterviewRoundCounts(ORG);
    expect(summary.total).toBe(3);
    expect(summary.pending).toBe(2);
    expect(summary.completed).toBe(1);
    expect(summary.inProgress).toBe(0);
    expect(summary.interrupted).toBe(0);
  });
});
