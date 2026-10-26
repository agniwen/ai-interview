import { deleteRecruitingRecords, createRecruitingRecords } from "@app/recruiting/records";
import { recruitingRecordReadModel } from "@app/recruiting/read-model";
// 真实 DB 集成测试：按轮次维度查询 + 详情 + 计数聚合。
// Per project memory: 用真实数据库，不 mock。
//
// Real-DB integration tests for the round-keyed DAO. Per project memory,
// hits the live test database — no mocks.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "../../../../../../infrastructure/db/index";
import {
  aiInterviewConversation,
  humanInterviewRound,
  recruitingNotificationDelivery,
  recruitingEvaluationDocument,
  member,
  organization,
  aiInterviewRound,
  user,
} from "@app/db-schema/schema";
import type { RecruitingVisibilityScope } from "@app/resume-processing/review/support/access-recruiting-visibility";
import type { StudioAiInterviewRecordListRecord } from "@app/shared/studio-interview-rounds";
import { loadInterviewRoundDetail } from "../interview-rounds";
import {
  queryPaginatedInterviewRecords,
  summarizeInterviewRecordCounts,
} from "../interview-records";
import type { InterviewRecordFilters } from "../interview-records";
import { loadAiCalendarEventPreview } from "../../../calendar/dao";

const ORG = "test_org_interview_rounds";
const USER_ID = "test_user_interview_rounds";
const USER_ID_ALT = "test_user_interview_rounds_alt";
const NOW = new Date("2026-05-13T15:00:00.000Z");

async function cleanup() {
  await db.delete(aiInterviewRound).where(eq(aiInterviewRound.organizationId, ORG));
  await db.delete(humanInterviewRound).where(eq(humanInterviewRound.organizationId, ORG));
  await deleteRecruitingRecords(db, eq(recruitingRecordReadModel.organizationId, ORG));
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
  await createRecruitingRecords(db, {
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
  await db.insert(aiInterviewRound).values([
    {
      allowTextInput: true,
      createdAt: NOW,
      createdBy: USER_ID,
      id: "rnd-a1",
      organizationId: ORG,
      recruitingRecordId: "cand-a",
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
      organizationId: ORG,
      recruitingRecordId: "cand-a",
      roundLabel: "二面",
      scheduledAt: null,
      sortOrder: 1,
      status: "pending",
      updatedAt: NOW,
    },
  ]);

  // Candidate B with 1 round (completed)
  await createRecruitingRecords(db, {
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
  await db.insert(aiInterviewRound).values({
    allowTextInput: true,
    createdAt: NOW,
    createdBy: USER_ID_ALT,
    id: "rnd-b1",
    organizationId: ORG,
    recruitingRecordId: "cand-b",
    roundLabel: "一面",
    scheduledAt: new Date("2026-05-12T10:00:00.000Z"),
    sortOrder: 0,
    status: "completed",
    updatedAt: NOW,
  });
});

afterAll(cleanup);

// AI 面试相关断言只看 AI 行，不受真人面试权限影响。/ AI-only listing for the AI assertions.
async function queryAiInterviewRecords(
  filters?: InterviewRecordFilters,
  visibilityScope?: RecruitingVisibilityScope,
  organizationId = ORG,
) {
  const result = await queryPaginatedInterviewRecords(organizationId, filters, undefined, {
    includeHuman: false,
    visibilityScope,
  });
  return {
    ...result,
    records: result.records.filter(
      (record): record is StudioAiInterviewRecordListRecord => record.kind === "ai",
    ),
  };
}

describe("queryPaginatedInterviewRecords (AI rounds)", () => {
  it("returns 3 rows (one per round) joined with candidate info", async () => {
    const result = await queryAiInterviewRecords();

    expect(result.total).toBe(3);
    expect(result.records).toHaveLength(3);
    const byRound = Object.fromEntries(result.records.map((r) => [r.id, r]));
    expect(byRound["rnd-a1"]?.candidateName).toBe("郭靖");
    expect(byRound["rnd-a1"]?.roundLabel).toBe("一面");
    expect(byRound["rnd-a2"]?.candidateName).toBe("郭靖");
    expect(byRound["rnd-b1"]?.candidateName).toBe("李四");
  });

  it("scopes by organizationId", async () => {
    const result = await queryAiInterviewRecords(undefined, undefined, "other_org_no_data");
    expect(result.total).toBe(0);
    expect(result.records).toHaveLength(0);
  });

  it("filters by status (CSV)", async () => {
    const result = await queryAiInterviewRecords({ status: "completed" });
    expect(result.total).toBe(1);
    expect(result.records[0]?.id).toBe("rnd-b1");
  });

  it("filters by creatorIds", async () => {
    const byOwner = await queryAiInterviewRecords({ creatorIds: [USER_ID] });
    expect(byOwner.total).toBe(2);
    expect(byOwner.records.map((row) => row.id).toSorted()).toEqual(["rnd-a1", "rnd-a2"]);

    const byMember = await queryAiInterviewRecords({ creatorIds: [USER_ID_ALT] });
    expect(byMember.total).toBe(1);
    expect(byMember.records[0]?.id).toBe("rnd-b1");
    expect(byMember.records[0]?.createdBy).toBe(USER_ID_ALT);
  });

  it("intersects creator filters with recruiting visibility scope", async () => {
    const result = await queryAiInterviewRecords(
      { creatorIds: [USER_ID, USER_ID_ALT] },
      { kind: "restricted", userIds: [USER_ID_ALT] },
    );

    expect(result.total).toBe(1);
    expect(result.records[0]?.id).toBe("rnd-b1");
  });

  it("filters by search across candidate name + round label", async () => {
    const byName = await queryAiInterviewRecords({ search: "郭靖" });
    expect(byName.total).toBe(2);
    const byRound = await queryAiInterviewRecords({ search: "二面" });
    expect(byRound.total).toBe(1);
    expect(byRound.records[0]?.id).toBe("rnd-a2");
  });

  it("serializes lastInterviewAt from conversation timestamps without timezone loss", async () => {
    const startedAt = new Date("2026-05-13T10:00:00.000Z");
    await db.insert(aiInterviewConversation).values({
      aiRoundId: "rnd-a1",
      conversationId: "conv_rounds_dao_last_interview_at",
      createdAt: new Date("2026-05-13T09:00:00.000Z"),
      lastSyncedAt: NOW,
      organizationId: ORG,
      recruitingRecordId: "cand-a",
      startedAt,
      status: "completed",
      updatedAt: NOW,
    });
    try {
      const result = await queryAiInterviewRecords();
      const row = result.records.find((record) => record.id === "rnd-a1");
      expect(row?.lastInterviewAt).toBe(startedAt.toISOString());
    } finally {
      await db
        .delete(aiInterviewConversation)
        .where(eq(aiInterviewConversation.conversationId, "conv_rounds_dao_last_interview_at"));
    }
  });

  it("returns the Feishu document for the round conversation", async () => {
    const conversationId = "conv_rounds_dao_feishu_document";
    await db.insert(aiInterviewConversation).values({
      aiRoundId: "rnd-a1",
      conversationId,
      createdAt: NOW,
      dataCollectionResults: {
        questions: [
          {
            answerSummary: "回答完整",
            difficulty: "medium",
            endedAtSecs: 30,
            evaluationFocus: null,
            followUpCount: 0,
            followUpDirections: null,
            question: "请介绍项目经历。",
            questionId: "q1",
            reason: null,
            revision: 1,
            startedAtSecs: 10,
            status: "answered",
          },
        ],
        schemaVersion: 2,
      },
      endedAt: NOW,
      lastSyncedAt: NOW,
      organizationId: ORG,
      recruitingRecordId: "cand-a",
      status: "completed",
      summaryStatus: "ready",
      updatedAt: NOW,
    });
    await db
      .update(aiInterviewRound)
      .set({ conversationId })
      .where(eq(aiInterviewRound.id, "rnd-a1"));
    await db.insert(recruitingNotificationDelivery).values({
      conversationId,
      createdAt: NOW,
      feishuDocumentUrl: "https://example.feishu.cn/docx/round-a1",
      id: "notification_rounds_dao_feishu_document",
      organizationId: ORG,
      providerId: "feishu:test",
      recipientOpenId: "ou_test",
      recruitingRecordId: "cand-a",
      status: "sent",
      type: "summary_ready",
      updatedAt: NOW,
    });
    await db.insert(recruitingEvaluationDocument).values({
      documentId: "round-a1",
      documentUrl: "https://example.feishu.cn/docx/round-a1",
      organizationId: ORG,
      providerId: "feishu",
      recruitingRecordId: "cand-a",
      status: "ready",
    });

    try {
      const result = await queryAiInterviewRecords();
      const withDocument = result.records.find((record) => record.id === "rnd-a1");
      const withoutDocument = result.records.find((record) => record.id === "rnd-a2");
      expect(withDocument?.feishuDocumentUrl).toBe("https://example.feishu.cn/docx/round-a1");
      expect(withDocument?.feishuEvaluationDocumentStatus).toBe("generated");
      expect(withoutDocument?.feishuDocumentUrl).toBe("https://example.feishu.cn/docx/round-a1");
    } finally {
      await db
        .delete(recruitingEvaluationDocument)
        .where(eq(recruitingEvaluationDocument.recruitingRecordId, "cand-a"));
      await db
        .delete(recruitingNotificationDelivery)
        .where(eq(recruitingNotificationDelivery.id, "notification_rounds_dao_feishu_document"));
      await db
        .update(aiInterviewRound)
        .set({ conversationId: null })
        .where(eq(aiInterviewRound.id, "rnd-a1"));
      await db
        .delete(aiInterviewConversation)
        .where(eq(aiInterviewConversation.conversationId, conversationId));
    }
  });

  it("offers manual generation from the latest ended partial interview", async () => {
    const conversationId = "conv_rounds_dao_partial_evaluation";
    await db.insert(aiInterviewConversation).values({
      aiRoundId: "rnd-b1",
      conversationId,
      createdAt: new Date("2026-05-13T13:00:00.000Z"),
      dataCollectionResults: {
        questions: [
          {
            answerSummary: "候选人介绍了最近一次项目交付",
            difficulty: "medium",
            endedAtSecs: 30,
            evaluationFocus: null,
            followUpCount: 0,
            followUpDirections: null,
            question: "请介绍项目经历。",
            questionId: "q1",
            reason: null,
            revision: 1,
            startedAtSecs: 10,
            status: "answered",
          },
          {
            answerSummary: null,
            difficulty: "medium",
            endedAtSecs: 31,
            evaluationFocus: null,
            followUpCount: 0,
            followUpDirections: null,
            question: "请介绍一次困难问题的处理过程。",
            questionId: "q2",
            reason: "candidate_ended_round",
            revision: 1,
            startedAtSecs: 31,
            status: "unasked",
          },
        ],
        schemaVersion: 2,
      },
      endedAt: new Date("2026-05-13T14:00:00.000Z"),
      lastSyncedAt: NOW,
      organizationId: ORG,
      recruitingRecordId: "cand-b",
      status: "completed",
      summaryStatus: "ready",
      updatedAt: NOW,
    });

    try {
      const result = await queryAiInterviewRecords();
      const row = result.records.find((record) => record.id === "rnd-b1");
      expect(row?.feishuDocumentUrl).toBeNull();
      expect(row?.feishuEvaluationDocumentStatus).toBe("answers_available");
    } finally {
      await db
        .delete(aiInterviewConversation)
        .where(eq(aiInterviewConversation.conversationId, conversationId));
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

describe("summarizeInterviewRecordCounts", () => {
  it("counts AI rounds by status", async () => {
    const summary = await summarizeInterviewRecordCounts(ORG, { includeHuman: false });
    expect(summary.total).toBe(3);
    expect(summary.pending).toBe(2);
    expect(summary.completed).toBe(1);
    expect(summary.inProgress).toBe(0);
    expect(summary.interrupted).toBe(0);
    expect(summary.cancelled).toBe(0);
  });
});

describe("queryPaginatedInterviewRecords (AI + human rounds)", () => {
  const HUMAN_ROUND_ID = "hrnd-a1";

  beforeAll(async () => {
    await db.insert(humanInterviewRound).values({
      createdAt: new Date("2026-05-13T16:00:00.000Z"),
      format: "onsite",
      id: HUMAN_ROUND_ID,
      label: "复试",
      organizationId: ORG,
      recruitingRecordId: "cand-a",
      roundKind: "second_interview",
      scheduledAt: new Date("2026-05-15T10:00:00.000Z"),
      status: "cancelled",
      updatedAt: NOW,
    });
  });

  afterAll(async () => {
    await db.delete(humanInterviewRound).where(eq(humanInterviewRound.id, HUMAN_ROUND_ID));
  });

  it("merges human rounds into one paginated list ordered by creation time", async () => {
    const result = await queryPaginatedInterviewRecords(ORG, undefined, undefined, {
      includeHuman: true,
    });

    expect(result.total).toBe(4);
    expect(result.records[0]).toMatchObject({
      candidateId: "cand-a",
      candidateName: "郭靖",
      createdBy: USER_ID,
      format: "onsite",
      id: HUMAN_ROUND_ID,
      kind: "human",
      roundLabel: "复试",
      status: "cancelled",
    });

    const secondPage = await queryPaginatedInterviewRecords(
      ORG,
      undefined,
      { page: 2, pageSize: 2 },
      { includeHuman: true },
    );
    expect(secondPage.total).toBe(4);
    expect(secondPage.records).toHaveLength(2);
    expect(secondPage.records.some((record) => record.id === HUMAN_ROUND_ID)).toBe(false);
  });

  it("omits human rounds without human interview read access", async () => {
    const result = await queryPaginatedInterviewRecords(ORG, undefined, undefined, {
      includeHuman: false,
    });
    expect(result.total).toBe(3);
    expect(result.records.every((record) => record.kind === "ai")).toBe(true);
  });

  it("filters both kinds by status and search", async () => {
    const cancelled = await queryPaginatedInterviewRecords(
      ORG,
      { status: "cancelled" },
      undefined,
      { includeHuman: true },
    );
    expect(cancelled.records.map((record) => record.id)).toEqual([HUMAN_ROUND_ID]);

    const pending = await queryPaginatedInterviewRecords(ORG, { status: "pending" }, undefined, {
      includeHuman: true,
    });
    expect(pending.records.map((record) => record.id).toSorted()).toEqual(["rnd-a1", "rnd-a2"]);

    const byLabel = await queryPaginatedInterviewRecords(ORG, { search: "复试" }, undefined, {
      includeHuman: true,
    });
    expect(byLabel.records.map((record) => record.id)).toEqual([HUMAN_ROUND_ID]);

    const byName = await queryPaginatedInterviewRecords(ORG, { search: "郭靖" }, undefined, {
      includeHuman: true,
    });
    expect(byName.total).toBe(3);
  });

  it("scopes human rounds by the recruiting record creator", async () => {
    const owner = await queryPaginatedInterviewRecords(ORG, { creatorIds: [USER_ID] }, undefined, {
      includeHuman: true,
    });
    expect(owner.records.map((record) => record.id).toSorted()).toEqual([
      HUMAN_ROUND_ID,
      "rnd-a1",
      "rnd-a2",
    ]);

    const restricted = await queryPaginatedInterviewRecords(ORG, undefined, undefined, {
      includeHuman: true,
      visibilityScope: { kind: "restricted", userIds: [USER_ID_ALT] },
    });
    expect(restricted.records.map((record) => record.id)).toEqual(["rnd-b1"]);
  });

  it("sorts by last interview time with never-interviewed rounds last", async () => {
    const conversationId = "conv_records_dao_last_interview_sort";
    await db.insert(aiInterviewConversation).values({
      aiRoundId: "rnd-a2",
      conversationId,
      createdAt: NOW,
      lastSyncedAt: NOW,
      organizationId: ORG,
      recruitingRecordId: "cand-a",
      startedAt: new Date("2026-05-13T11:00:00.000Z"),
      status: "completed",
      updatedAt: NOW,
    });
    try {
      for (const sortOrder of ["asc", "desc"] as const) {
        const result = await queryPaginatedInterviewRecords(
          ORG,
          undefined,
          { sortBy: "lastInterviewAt", sortOrder },
          { includeHuman: true },
        );
        expect(result.total).toBe(4);
        expect(result.records[0]?.id).toBe("rnd-a2");
        expect(result.records.slice(1).every((record) => record.lastInterviewAt === null)).toBe(
          true,
        );
      }
    } finally {
      await db
        .delete(aiInterviewConversation)
        .where(eq(aiInterviewConversation.conversationId, conversationId));
    }
  });

  it("shows the recruiting record's evaluation document on human rounds", async () => {
    await db.insert(recruitingEvaluationDocument).values({
      documentId: "records-human-doc",
      documentUrl: "https://example.feishu.cn/docx/records-human-doc",
      organizationId: ORG,
      providerId: "feishu",
      recruitingRecordId: "cand-a",
      status: "ready",
    });
    try {
      const result = await queryPaginatedInterviewRecords(ORG, undefined, undefined, {
        includeHuman: true,
      });
      const human = result.records.find((record) => record.id === HUMAN_ROUND_ID);
      expect(human?.feishuDocumentUrl).toBe("https://example.feishu.cn/docx/records-human-doc");
    } finally {
      await db
        .delete(recruitingEvaluationDocument)
        .where(eq(recruitingEvaluationDocument.recruitingRecordId, "cand-a"));
    }
  });

  it("counts human rounds in the summary", async () => {
    const summary = await summarizeInterviewRecordCounts(ORG, { includeHuman: true });
    expect(summary.total).toBe(4);
    expect(summary.pending).toBe(2);
    expect(summary.completed).toBe(1);
    expect(summary.cancelled).toBe(1);
  });
});
