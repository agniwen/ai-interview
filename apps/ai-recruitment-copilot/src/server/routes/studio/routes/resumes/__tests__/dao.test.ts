// Real-DB integration test for the resume library DAO.
// Per project memory: integration tests hit the actual database — no mocks.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import {
  department,
  jobDescription,
  member,
  organization,
  studioInterview,
  studioOrgSkill,
  user,
} from "@arc/db-schema/schema";
import { queryPaginatedResumeRecords } from "@/server/routes/studio/routes/resumes/dao/resumes";
import { syncResumeSkills } from "@/server/routes/studio/routes/resumes/dao/skills";

const ORG_A = "test_org_resume_dao_a";
const ORG_B = "test_org_resume_dao_b";
const USER_ID = "test_user_resume_dao";

const NOW = new Date("2026-05-13T10:00:00.000Z");

const JD_FRONTEND = "jd_test_resume_dao_frontend";
const JD_BACKEND = "jd_test_resume_dao_backend";
const DEPT_ID = "dept_test_resume_dao";

async function cleanup() {
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_A));
  await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG_B));
  await db.delete(studioOrgSkill).where(eq(studioOrgSkill.organizationId, ORG_A));
  await db.delete(studioOrgSkill).where(eq(studioOrgSkill.organizationId, ORG_B));
  await db.delete(jobDescription).where(eq(jobDescription.organizationId, ORG_A));
  await db.delete(department).where(eq(department.organizationId, ORG_A));
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
      candidateName: "张三",
      createdAt: NOW,
      createdBy: USER_ID,
      id: "ri_test_a_1",
      interviewQuestions: [],
      jobDescriptionId: JD_FRONTEND,
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
      jobDescriptionId: JD_BACKEND,
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

  // 张三：React + TypeScript；李四：Python + Django。
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

  it("filters by skills with AND (intersection) semantics", async () => {
    // 张三：React + TypeScript；李四：Python + Django。
    const r1 = await queryPaginatedResumeRecords(ORG_A, { skills: ["React"] });
    expect(r1.records.map((row) => row.candidateName)).toEqual(["张三"]);

    const r2 = await queryPaginatedResumeRecords(ORG_A, {
      skills: ["React", "TypeScript"],
    });
    expect(r2.records.map((row) => row.candidateName)).toEqual(["张三"]);

    // 张三只会 React + TS，缺 Python；李四不会 React。
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
    // matches and exclude 张三 — make sure that doesn't happen.
    expect(result.records.map((row) => row.candidateName)).toEqual(["张三"]);
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
    expect(result.records.map((row) => row.candidateName)).toEqual(["张三"]);
  });

  it("filters by jobDescriptionIds", async () => {
    const result = await queryPaginatedResumeRecords(ORG_A, {
      jobDescriptionIds: [JD_FRONTEND],
    });
    expect(result.records.map((row) => row.candidateName)).toEqual(["张三"]);
  });

  it("combines skills + jobDescriptionIds + search (intersection)", async () => {
    // React 命中张三；JD 限定后端 → 没人；search 不限。
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
});
