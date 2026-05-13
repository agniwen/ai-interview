// Real-DB integration test for the resume library DAO.
// Per project memory: integration tests hit the actual database — no mocks.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import { member, organization, studioInterview, user } from "@/lib/shared/db/schema";
import { queryPaginatedResumeRecords } from "@/server/routes/studio/routes/resumes/dao/resumes";

const ORG_A = "test_org_resume_dao_a";
const ORG_B = "test_org_resume_dao_b";
const USER_ID = "test_user_resume_dao";

const NOW = new Date("2026-05-13T10:00:00.000Z");

async function cleanup() {
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_A));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_B));
  await db.delete(member).where(eq(member.userId, USER_ID));
  await db.delete(organization).where(eq(organization.id, ORG_A));
  await db.delete(organization).where(eq(organization.id, ORG_B));
  await db.delete(user).where(eq(user.id, USER_ID));
}

beforeAll(async () => {
  await cleanup();

  await db.insert(user).values({
    createdAt: NOW,
    email: "resume-dao@example.com",
    emailVerified: false,
    id: USER_ID,
    name: "resume-dao",
    updatedAt: NOW,
  });

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
      id: "m_resume_dao_b",
      organizationId: ORG_B,
      role: "owner",
      userId: USER_ID,
    },
  ]);

  await db.insert(studioInterview).values([
    {
      candidateEmail: "zhang@example.com",
      candidateName: "张三",
      createdAt: NOW,
      createdBy: USER_ID,
      id: "ri_test_a_1",
      interviewQuestions: [],
      notes: null,
      organizationId: ORG_A,
      resumeFileName: "zhang.pdf",
      status: "draft",
      targetRole: "前端工程师",
      updatedAt: NOW,
    },
    {
      candidateEmail: "li@example.com",
      candidateName: "李四",
      createdAt: NOW,
      createdBy: USER_ID,
      id: "ri_test_a_2",
      interviewQuestions: [],
      notes: null,
      organizationId: ORG_A,
      resumeFileName: null,
      status: "ready",
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
      status: "draft",
      targetRole: null,
      updatedAt: NOW,
    },
  ]);
});

afterAll(async () => {
  await cleanup();
});

describe("queryPaginatedResumeRecords", () => {
  it("lists rows scoped to the organization", async () => {
    const result = await queryPaginatedResumeRecords(ORG_A);
    expect(result.total).toBe(2);
    const names = result.records.map((r) => r.candidateName).toSorted();
    expect(names).toEqual(["张三", "李四"].toSorted());
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
    expect(sample).not.toHaveProperty("status");
    expect(sample.hasResumeFile).toBeTypeOf("boolean");
    expect(typeof sample.createdAt).toBe("string");
  });

  it("supports search filter against candidateName", async () => {
    const result = await queryPaginatedResumeRecords(ORG_A, { search: "张三" });
    expect(result.total).toBe(1);
    expect(result.records[0]?.candidateName).toBe("张三");
  });
});
