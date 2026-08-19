// Real-DB integration test for the resume library DAO.
// Per project memory: integration tests hit the actual database — no mocks.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import {
  department,
  interviewConversation,
  interviewNotification,
  jobDescription,
  member,
  organization,
  resumeDuplicateMatch,
  studioHumanInterviewRound,
  studioInterview,
  studioInterviewSchedule,
  studioOfferDraft,
  studioOrgSkill,
  user,
} from "@arc/db-schema/schema";
import {
  loadResumeDetail,
  queryPaginatedResumeRecords,
} from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/resumes";
import { syncResumeSkills } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/skills";

const ORG_A = "test_org_resume_dao_a";
const ORG_B = "test_org_resume_dao_b";
const USER_ID = "test_user_resume_dao";
const USER_ID_ALT = "test_user_resume_dao_alt";

const NOW = new Date("2026-05-13T10:00:00.000Z");

const JD_FRONTEND = "jd_test_resume_dao_frontend";
const JD_BACKEND = "jd_test_resume_dao_backend";
const DEPT_ID = "dept_test_resume_dao";

async function cleanup() {
  await db.delete(resumeDuplicateMatch).where(eq(resumeDuplicateMatch.organizationId, ORG_A));
  await db.delete(resumeDuplicateMatch).where(eq(resumeDuplicateMatch.organizationId, ORG_B));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_A));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_B));
  await db.delete(studioOrgSkill).where(eq(studioOrgSkill.organizationId, ORG_A));
  await db.delete(studioOrgSkill).where(eq(studioOrgSkill.organizationId, ORG_B));
  await db.delete(jobDescription).where(eq(jobDescription.organizationId, ORG_A));
  await db.delete(department).where(eq(department.organizationId, ORG_A));
  await db.delete(member).where(eq(member.userId, USER_ID));
  await db.delete(member).where(eq(member.userId, USER_ID_ALT));
  await db.delete(organization).where(eq(organization.id, ORG_A));
  await db.delete(organization).where(eq(organization.id, ORG_B));
  await db.delete(user).where(eq(user.id, USER_ID));
  await db.delete(user).where(eq(user.id, USER_ID_ALT));
}

beforeAll(async () => {
  await cleanup();

  await db.insert(user).values([
    {
      createdAt: NOW,
      email: "resume-dao@example.com",
      emailVerified: false,
      id: USER_ID,
      name: "resume-dao",
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      email: "resume-dao-alt@example.com",
      emailVerified: false,
      id: USER_ID_ALT,
      name: "resume-dao-alt",
      updatedAt: NOW,
    },
  ]);

  await db.insert(organization).values([
    { createdAt: NOW, id: ORG_A, name: "Org A", slug: "test-resume-dao-a" },
    { createdAt: NOW, id: ORG_B, name: "Org B", slug: "test-resume-dao-b" },
  ]);

  await db.insert(member).values([
    {
      createdAt: NOW,
      id: "m_resume_dao_a",
      organizationId: ORG_A,
      role: "owner",
      userId: USER_ID,
    },
    {
      createdAt: NOW,
      id: "m_resume_dao_a_alt",
      organizationId: ORG_A,
      role: "member",
      userId: USER_ID_ALT,
    },
    {
      createdAt: NOW,
      id: "m_resume_dao_b",
      organizationId: ORG_B,
      role: "owner",
      userId: USER_ID,
    },
  ]);

  await db.insert(department).values({
    createdAt: NOW,
    id: DEPT_ID,
    name: "技术部",
    organizationId: ORG_A,
    updatedAt: NOW,
  });

  await db.insert(jobDescription).values([
    {
      createdAt: NOW,
      departmentId: DEPT_ID,
      id: JD_FRONTEND,
      name: "前端工程师",
      organizationId: ORG_A,
      prompt: "",
      updatedAt: NOW,
    },
    {
      createdAt: NOW,
      departmentId: DEPT_ID,
      id: JD_BACKEND,
      name: "后端工程师",
      organizationId: ORG_A,
      prompt: "",
      updatedAt: NOW,
    },
  ]);

  await db.insert(studioInterview).values([
    {
      candidateEmail: "zhang@example.com",
      candidateName: "郭靖",
      createdAt: NOW,
      createdBy: USER_ID,
      id: "ri_test_a_1",
      interviewQuestions: [],
      jobDescriptionId: JD_FRONTEND,
      notes: null,
      organizationId: ORG_A,
      resumeFileName: "zhang.pdf",
      targetRole: "前端工程师",
      updatedAt: NOW,
    },
    {
      candidateEmail: "li@example.com",
      candidateName: "李四",
      createdAt: NOW,
      createdBy: USER_ID_ALT,
      id: "ri_test_a_2",
      interviewQuestions: [],
      jobDescriptionId: JD_BACKEND,
      notes: null,
      organizationId: ORG_A,
      resumeFileName: null,
      targetRole: "产品经理",
      updatedAt: NOW,
    },
    {
      candidateEmail: null,
      candidateName: "王五",
      createdAt: NOW,
      createdBy: USER_ID,
      id: "ri_test_b_1",
      interviewQuestions: [],
      notes: null,
      organizationId: ORG_B,
      resumeFileName: "wang.pdf",
      targetRole: null,
      updatedAt: NOW,
    },
  ]);

  // 郭靖：React + TypeScript；李四：Python + Django。
  // Zhang: React + TypeScript; Li: Python + Django.
  await db.transaction(async (tx) => {
    await syncResumeSkills(tx, {
      interviewId: "ri_test_a_1",
      organizationId: ORG_A,
      skills: ["React", "TypeScript"],
    });
    await syncResumeSkills(tx, {
      interviewId: "ri_test_a_2",
      organizationId: ORG_A,
      skills: ["Python", "Django"],
    });
  });
});

afterAll(async () => {
  await cleanup();
});

describe("queryPaginatedResumeRecords", () => {
  it("lists rows scoped to the organization", async () => {
    const result = await queryPaginatedResumeRecords(ORG_A);
    expect(result.total).toBe(2);
    const names = result.records.map((r) => r.candidateName).toSorted();
    expect(names).toEqual(["郭靖", "李四"].toSorted());
  });

  it("returns the latest generated Feishu document for each candidate", async () => {
    await db.insert(interviewNotification).values([
      {
        createdAt: new Date("2026-05-13T11:00:00.000Z"),
        feishuDocumentUrl: "https://example.feishu.cn/docx/older",
        id: "notification_resume_dao_older",
        interviewRecordId: "ri_test_a_1",
        organizationId: ORG_A,
        providerId: "feishu:test",
        recipientOpenId: "ou_test",
        status: "sent",
        type: "summary_ready",
        updatedAt: new Date("2026-05-13T11:00:00.000Z"),
      },
      {
        createdAt: new Date("2026-05-13T12:00:00.000Z"),
        feishuDocumentUrl: "https://example.feishu.cn/docx/latest",
        id: "notification_resume_dao_latest",
        interviewRecordId: "ri_test_a_1",
        organizationId: ORG_A,
        providerId: "feishu:test",
        recipientOpenId: "ou_test",
        status: "sent",
        type: "summary_ready",
        updatedAt: new Date("2026-05-13T12:00:00.000Z"),
      },
    ]);

    try {
      const result = await queryPaginatedResumeRecords(ORG_A);
      expect(result.records.find((record) => record.id === "ri_test_a_1")?.feishuDocumentUrl).toBe(
        "https://example.feishu.cn/docx/latest",
      );
      expect(
        result.records.find((record) => record.id === "ri_test_a_2")?.feishuDocumentUrl,
      ).toBeNull();
    } finally {
      await db
        .delete(interviewNotification)
        .where(eq(interviewNotification.interviewRecordId, "ri_test_a_1"));
    }
  });

  it("does not leak rows from sibling organizations", async () => {
    const result = await queryPaginatedResumeRecords(ORG_A);
    expect(result.records.some((r) => r.candidateName === "王五")).toBe(false);
  });

  it("returns records without interview-only fields", async () => {
    const result = await queryPaginatedResumeRecords(ORG_A);
    const [sample] = result.records;
    if (!sample) {
      throw new Error("expected at least one record");
    }
    expect(sample).not.toHaveProperty("interviewQuestions");
    expect(sample).not.toHaveProperty("scheduleEntries");
    expect(sample).not.toHaveProperty("resumeScreeningResult");
    expect(sample).not.toHaveProperty("hrResumeAssessment");
    expect(sample.pipelineStage).toBeTypeOf("string");
    expect(sample.outcome).toBeTypeOf("string");
    expect(sample.hasResumeFile).toBeTypeOf("boolean");
    expect(sample.createdAt).toEqual(expect.any(String));
  });

  it.each([
    {
      expected: "候选人核心经验匹配，但仍需核实复杂项目中的主导程度。",
      narrative: {
        overallComment: "候选人核心经验匹配，但仍需核实复杂项目中的主导程度。",
        summary: "候选人整体匹配岗位。",
      },
      source: "overall comment",
    },
    {
      expected: "候选人整体匹配岗位，建议进入下一轮核实项目深度。",
      narrative: {
        summary: "候选人整体匹配岗位，建议进入下一轮核实项目深度。",
      },
      source: "fallback summary for older evaluations",
    },
  ])("returns the structured $source as the list summary", async ({ expected, narrative }) => {
    await db
      .update(studioInterview)
      .set({
        notes: null,
        resumeEvaluationArtifactMode: "structured",
        resumeReview: null,
        structuredCompositeScore: 65,
        structuredGateSortRank: 0,
        structuredGateStatus: "passed",
        // SAFETY: This test constructs the value with the asserted contract before this boundary.
        structuredResumeEvaluation: {
          narrative,
        } as (typeof studioInterview.$inferInsert)["structuredResumeEvaluation"],
        structuredScoreGrade: "matched",
      })
      .where(eq(studioInterview.id, "ri_test_a_1"));

    try {
      const result = await queryPaginatedResumeRecords(ORG_A);
      const record = result.records.find((item) => item.id === "ri_test_a_1");

      expect(record?.resumeSummary).toBe(expected);
    } finally {
      await db
        .update(studioInterview)
        .set({
          resumeEvaluationArtifactMode: null,
          structuredCompositeScore: null,
          structuredGateSortRank: null,
          structuredGateStatus: null,
          structuredResumeEvaluation: null,
          structuredScoreGrade: null,
        })
        .where(eq(studioInterview.id, "ri_test_a_1"));
    }
  });

  it("reuses a known total for later pages", async () => {
    const result = await queryPaginatedResumeRecords(
      ORG_A,
      undefined,
      { page: 2, pageSize: 1 },
      undefined,
      99,
    );

    expect(result.total).toBe(99);
    expect(result.totalPages).toBe(99);
  });

  it("includes active duplicate match summary for resume library rows", async () => {
    await db.insert(resumeDuplicateMatch).values([
      {
        embeddingVersion: "test-v1",
        id: "resume_dao_duplicate_active",
        level: "high",
        matchedSourceId: "ri_test_a_2",
        matchedSourceType: "studio_interview",
        organizationId: ORG_A,
        reasons: ["整体履历高度相似"],
        score: 96,
        sourceId: "ri_test_a_1",
        sourceType: "studio_interview",
        status: "active",
      },
      {
        embeddingVersion: "test-v1",
        id: "resume_dao_duplicate_dismissed",
        level: "medium",
        matchedSourceId: "ri_test_a_1",
        matchedSourceType: "studio_interview",
        organizationId: ORG_A,
        reasons: ["已忽略"],
        score: 82,
        sourceId: "ri_test_a_2",
        sourceType: "studio_interview",
        status: "dismissed",
      },
    ]);

    try {
      const result = await queryPaginatedResumeRecords(ORG_A);
      expect(result.records.find((row) => row.id === "ri_test_a_1")?.duplicateMatch).toEqual({
        count: 1,
        highestLevel: "high",
        latestMatchedResume: {
          createdAt: NOW.toISOString(),
          creatorName: "resume-dao-alt",
        },
      });
      // 双向计数：a_2 是活跃行（a_1→a_2）的 matched 侧，也计入 a_2 的重复。
      // Bidirectional counts: a_2 is the matched side of the active row, so it
      // also shows a duplicate; the dismissed row is filtered out either way.
      expect(result.records.find((row) => row.id === "ri_test_a_2")?.duplicateMatch).toEqual({
        count: 1,
        highestLevel: "high",
        latestMatchedResume: {
          createdAt: NOW.toISOString(),
          creatorName: "resume-dao",
        },
      });

      const detail = await loadResumeDetail("ri_test_a_1", ORG_A);
      expect(detail?.duplicateMatch).toEqual({
        count: 1,
        highestLevel: "high",
        latestMatchedResume: {
          createdAt: NOW.toISOString(),
          creatorName: "resume-dao-alt",
        },
      });
    } finally {
      await db.delete(resumeDuplicateMatch).where(eq(resumeDuplicateMatch.organizationId, ORG_A));
    }
  });

  it("serializes lastInterviewAt from conversation timestamps without timezone loss", async () => {
    const startedAt = new Date("2026-05-13T10:00:00.000Z");
    await db.insert(interviewConversation).values({
      conversationId: "conv_resume_dao_last_interview_at",
      createdAt: new Date("2026-05-13T09:00:00.000Z"),
      interviewRecordId: "ri_test_a_1",
      lastSyncedAt: NOW,
      organizationId: ORG_A,
      startedAt,
      status: "completed",
      updatedAt: NOW,
    });

    try {
      const result = await queryPaginatedResumeRecords(ORG_A);
      const row = result.records.find((record) => record.id === "ri_test_a_1");
      expect(row?.lastInterviewAt).toBe(startedAt.toISOString());
    } finally {
      await db
        .delete(interviewConversation)
        .where(eq(interviewConversation.conversationId, "conv_resume_dao_last_interview_at"));
    }
  });

  it("supports search filter against candidateName", async () => {
    const result = await queryPaginatedResumeRecords(ORG_A, { search: "郭靖" });
    expect(result.total).toBe(1);
    expect(result.records[0]?.candidateName).toBe("郭靖");
  });

  it("filters by skills with AND (intersection) semantics", async () => {
    // 郭靖：React + TypeScript；李四：Python + Django。
    const r1 = await queryPaginatedResumeRecords(ORG_A, { skills: ["React"] });
    expect(r1.records.map((row) => row.candidateName)).toEqual(["郭靖"]);

    const r2 = await queryPaginatedResumeRecords(ORG_A, {
      skills: ["React", "TypeScript"],
    });
    expect(r2.records.map((row) => row.candidateName)).toEqual(["郭靖"]);

    // 郭靖只会 React + TS，缺 Python；李四不会 React。
    // Neither candidate has both React and Python, so the intersection is empty.
    const r3 = await queryPaginatedResumeRecords(ORG_A, {
      skills: ["React", "Python"],
    });
    expect(r3.records).toEqual([]);
  });

  it("dedupes duplicate skill inputs so 'React,React' is equivalent to 'React'", async () => {
    const result = await queryPaginatedResumeRecords(ORG_A, {
      skills: ["React", "React"],
    });
    // If we hadn't deduped, the HAVING count check would require 2 distinct
    // matches and exclude 郭靖 — make sure that doesn't happen.
    expect(result.records.map((row) => row.candidateName)).toEqual(["郭靖"]);
  });

  it("returns empty list when skills do not match any candidate", async () => {
    const result = await queryPaginatedResumeRecords(ORG_A, { skills: ["Rust"] });
    expect(result.total).toBe(0);
    expect(result.records).toEqual([]);
  });

  it("ignores empty / whitespace-only skill entries", async () => {
    // Caller can pass a stale CSV; the filter must drop blanks before applying.
    const result = await queryPaginatedResumeRecords(ORG_A, {
      skills: ["", "  ", "React"],
    });
    expect(result.records.map((row) => row.candidateName)).toEqual(["郭靖"]);
  });

  it("filters by jobDescriptionIds", async () => {
    const result = await queryPaginatedResumeRecords(ORG_A, {
      jobDescriptionIds: [JD_FRONTEND],
    });
    expect(result.records.map((row) => row.candidateName)).toEqual(["郭靖"]);
  });

  it("filters by creatorIds", async () => {
    const byOwner = await queryPaginatedResumeRecords(ORG_A, { creatorIds: [USER_ID] });
    expect(byOwner.records.map((row) => row.candidateName)).toEqual(["郭靖"]);

    const byMember = await queryPaginatedResumeRecords(ORG_A, { creatorIds: [USER_ID_ALT] });
    expect(byMember.records.map((row) => row.candidateName)).toEqual(["李四"]);

    const byUnknown = await queryPaginatedResumeRecords(ORG_A, { creatorIds: ["missing-user"] });
    expect(byUnknown.records).toEqual([]);
  });

  it("intersects creator filters with recruiting visibility scope", async () => {
    const result = await queryPaginatedResumeRecords(
      ORG_A,
      { creatorIds: [USER_ID, USER_ID_ALT] },
      undefined,
      { kind: "restricted", userIds: [USER_ID_ALT] },
    );

    expect(result.total).toBe(1);
    expect(result.records.map((row) => row.candidateName)).toEqual(["李四"]);
  });

  it("does not force an empty list for all-data roles when creator filter is blank", async () => {
    const result = await queryPaginatedResumeRecords(ORG_A, { creatorIds: [] }, undefined, {
      kind: "all",
    });

    expect(result.total).toBeGreaterThan(0);
    expect(result.records.map((row) => row.candidateName)).toContain("郭靖");
  });

  it("applies recruiting visibility scope to resume detail loads", async () => {
    const allowed = await loadResumeDetail("ri_test_a_2", ORG_A, {
      kind: "restricted",
      userIds: [USER_ID_ALT],
    });
    const blocked = await loadResumeDetail("ri_test_a_1", ORG_A, {
      kind: "restricted",
      userIds: [USER_ID_ALT],
    });

    expect(allowed?.candidateName).toBe("李四");
    expect(blocked).toBeNull();
  });

  it("combines skills + jobDescriptionIds + search (intersection)", async () => {
    // React 命中郭靖；JD 限定后端 → 没人；search 不限。
    const result = await queryPaginatedResumeRecords(ORG_A, {
      jobDescriptionIds: [JD_BACKEND],
      skills: ["React"],
    });
    expect(result.total).toBe(0);
  });

  it("scopes skill / JD filters to the organization (no cross-org leak)", async () => {
    // Org B doesn't have the JD seed; passing org A's JD ids must not match
    // any of org B's rows.
    const result = await queryPaginatedResumeRecords(ORG_B, {
      jobDescriptionIds: [JD_FRONTEND],
    });
    expect(result.total).toBe(0);
  });

  // 派生 stageProgress 字段的端到端验证：从 studio_interview_schedule 聚合 totalRounds /
  // completedRounds / hasStarted / activeRound。覆盖三种典型形态：无排期、轮间等待、全部完成。
  // End-to-end verification of the derived stageProgress aggregation. Covers
  // three shapes: no schedule rows, between-rounds, and all-completed.
  it("aggregates stageProgress from studio_interview_schedule", async () => {
    // 给李四（ri_test_a_2）安排 3 轮：第 1 轮 completed、第 2 轮 in_progress、第 3 轮 pending。
    // Schedule 3 rounds for Li: round-1 completed, round-2 in_progress, round-3 pending.
    await db.insert(studioInterviewSchedule).values([
      {
        allowTextInput: false,
        createdAt: NOW,
        id: "sched_test_a2_r1",
        interviewRecordId: "ri_test_a_2",
        organizationId: ORG_A,
        roundLabel: "一面",
        sortOrder: 0,
        status: "completed",
        updatedAt: NOW,
      },
      {
        allowTextInput: false,
        createdAt: NOW,
        id: "sched_test_a2_r2",
        interviewRecordId: "ri_test_a_2",
        organizationId: ORG_A,
        roundLabel: "二面",
        sortOrder: 1,
        status: "in_progress",
        updatedAt: NOW,
      },
      {
        allowTextInput: false,
        createdAt: NOW,
        id: "sched_test_a2_r3",
        interviewRecordId: "ri_test_a_2",
        organizationId: ORG_A,
        roundLabel: "三面",
        sortOrder: 2,
        status: "pending",
        updatedAt: NOW,
      },
    ]);

    try {
      const result = await queryPaginatedResumeRecords(ORG_A);
      const li = result.records.find((r) => r.id === "ri_test_a_2");
      const zhang = result.records.find((r) => r.id === "ri_test_a_1");
      if (!li || !zhang) {
        throw new Error("seed rows missing");
      }

      // 李四：3 轮、1 个 completed、有过 in_progress（hasStarted=true）、activeRound = 第 2 轮 in_progress。
      // Li: 3 rounds, 1 completed, hasStarted=true, activeRound = round-2 in_progress.
      expect(li.stageProgress.aiInterview).toEqual({
        activeRound: {
          roundLabel: "二面",
          sortOrder: 1,
          status: "in_progress",
        },
        completedRounds: 1,
        hasStarted: true,
        totalRounds: 3,
      });
      // 李四没真人复面 / Offer 子表数据 → 这两段为 null。
      // Li has no human-interview / offer rows yet → those branches are null.
      expect(li.stageProgress.humanInterview).toBeNull();
      expect(li.stageProgress.offer).toBeNull();

      // 郭靖：没排期 → 三段都 null（DAO 用 HAVING 过滤出真正有数据的子结构）。
      // Zhang: no schedule rows at all → all three branches null.
      expect(zhang.stageProgress).toEqual({
        aiInterview: null,
        humanInterview: null,
        offer: null,
      });
    } finally {
      await db
        .delete(studioInterviewSchedule)
        .where(eq(studioInterviewSchedule.interviewRecordId, "ri_test_a_2"));
    }
  });

  // 真人复面聚合：覆盖「混合状态 + 取消轮不计入 total」「全部 completed」「无数据」三种形态。
  // Human-interview aggregation: mixed statuses (cancelled excluded), all-done,
  // and empty.
  it("aggregates humanInterview branch and excludes cancelled rounds from totals", async () => {
    // 李四：4 轮真人复面 —— pending（已安排）+ completed/pass + completed/fail + cancelled。
    // cancelled 应被 total 排除；activeRound 取最低 sort_order 的 pending 那条。
    // Li: 4 rounds — pending(scheduled) + pass + fail + cancelled. cancelled
    // excluded from totals; activeRound = lowest sortOrder pending.
    await db.insert(studioHumanInterviewRound).values([
      {
        completedAt: NOW,
        createdAt: NOW,
        format: "online",
        id: "hr_li_1",
        interviewRecordId: "ri_test_a_2",
        label: "技术复面",
        organizationId: ORG_A,
        outcome: "pass",
        score: 85,
        sortOrder: 0,
        status: "completed",
        updatedAt: NOW,
      },
      {
        completedAt: NOW,
        createdAt: NOW,
        format: "online",
        id: "hr_li_2",
        interviewRecordId: "ri_test_a_2",
        label: "HR 复面",
        organizationId: ORG_A,
        outcome: "fail",
        sortOrder: 1,
        status: "completed",
        updatedAt: NOW,
      },
      {
        createdAt: NOW,
        format: "onsite",
        id: "hr_li_3",
        interviewRecordId: "ri_test_a_2",
        label: "总监终面",
        location: "上海办公室",
        organizationId: ORG_A,
        scheduledAt: new Date("2026-05-30T10:00:00.000Z"),
        sortOrder: 2,
        status: "pending",
        updatedAt: NOW,
      },
      {
        cancelReason: "候选人时间冲突",
        cancelledAt: NOW,
        createdAt: NOW,
        format: "online",
        id: "hr_li_4",
        interviewRecordId: "ri_test_a_2",
        label: "Cross 面",
        organizationId: ORG_A,
        sortOrder: 3,
        status: "cancelled",
        updatedAt: NOW,
      },
    ]);

    try {
      const result = await queryPaginatedResumeRecords(ORG_A);
      const li = result.records.find((r) => r.id === "ri_test_a_2");
      const zhang = result.records.find((r) => r.id === "ri_test_a_1");
      if (!li || !zhang) {
        throw new Error("seed rows missing");
      }

      // cancelled 不计入 total，所以 totalRounds=3；passed=1, failed=1, completed=2;
      // activeRound = sort_order=2 的 pending 行。
      // cancelled excluded → total=3; passed=1; failed=1; completed=2; active=hr_li_3.
      expect(li.stageProgress.humanInterview).toEqual({
        activeRound: {
          id: "hr_li_3",
          label: "总监终面",
          outcome: null,
          scheduledAt: "2026-05-30T10:00:00.000Z",
          sortOrder: 2,
          status: "pending",
        },
        completedRounds: 2,
        completedRoundsMissingFeedback: 2,
        failedRounds: 1,
        passedRounds: 1,
        totalRounds: 3,
      });

      // 郭靖没复面记录 → 空 null。
      // Zhang has no human rounds → null.
      expect(zhang.stageProgress.humanInterview).toBeNull();
    } finally {
      await db
        .delete(studioHumanInterviewRound)
        .where(eq(studioHumanInterviewRound.interviewRecordId, "ri_test_a_2"));
    }
  });

  // Offer 聚合：多版本时 latestDraft = 最高 version 且非 superseded；
  // totalVersions 不含 superseded（不污染计数）。
  // Offer aggregation: latestDraft = highest non-superseded version; total
  // excludes superseded versions.
  it("aggregates offer branch and excludes superseded versions from latest pointer", async () => {
    await db.insert(studioOfferDraft).values([
      {
        baseSalary: 30_000,
        createdAt: NOW,
        currency: "CNY",
        id: "od_li_v1",
        interviewRecordId: "ri_test_a_2",
        organizationId: ORG_A,
        position: "高级前端",
        sentAt: NOW,
        status: "superseded",
        updatedAt: NOW,
        version: 1,
      },
      {
        baseSalary: 32_000,
        createdAt: NOW,
        currency: "CNY",
        id: "od_li_v2",
        interviewRecordId: "ri_test_a_2",
        organizationId: ORG_A,
        position: "高级前端",
        sentAt: NOW,
        status: "sent",
        updatedAt: NOW,
        version: 2,
      },
    ]);

    try {
      const result = await queryPaginatedResumeRecords(ORG_A);
      const li = result.records.find((r) => r.id === "ri_test_a_2");
      if (!li) {
        throw new Error("seed row missing");
      }

      // totalVersions=1（superseded 不算），latestDraft 指向 v2 sent。
      expect(li.stageProgress.offer).toEqual({
        latestDraft: {
          id: "od_li_v2",
          responseAt: null,
          sentAt: "2026-05-13T10:00:00.000Z",
          status: "sent",
          version: 2,
        },
        totalVersions: 1,
      });
    } finally {
      await db
        .delete(studioOfferDraft)
        .where(eq(studioOfferDraft.interviewRecordId, "ri_test_a_2"));
    }
  });
});
