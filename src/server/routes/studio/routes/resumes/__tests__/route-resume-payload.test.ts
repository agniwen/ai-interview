// Real-DB integration test: 验证 loadResumeDetail 暴露 interviewQuestions
// 字段。POST handler 接 resumePayload 后会把 questions 写进同一行 JSON 列。
//
// Verify loadResumeDetail surfaces interviewQuestions. The handler-level POST
// round-trip is exercised manually in Phase 5 — faking the auth pipeline here
// would dwarf the value the test provides.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/server/db";
import { member, organization, studioInterview, user } from "@/lib/shared/db/schema";
import { loadResumeDetail } from "@/server/routes/studio/routes/resumes/dao/resumes";

const ORG = "test_org_resume_payload";
const USER_ID = "test_user_resume_payload";
const NOW = new Date("2026-05-13T12:00:00.000Z");

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
    email: "resume-payload@example.com",
    emailVerified: false,
    id: USER_ID,
    name: "rp",
    updatedAt: NOW,
  });
  await db.insert(organization).values({
    createdAt: NOW,
    id: ORG,
    name: "Org Payload",
    slug: "test-resume-payload",
  });
  await db.insert(member).values({
    createdAt: NOW,
    id: "m_rp",
    organizationId: ORG,
    role: "owner",
    userId: USER_ID,
  });
});

afterAll(cleanup);

describe("loadResumeDetail interviewQuestions surfacing", () => {
  it("returns generated questions when the row has them", async () => {
    const recordId = "rp-with-questions";
    await db.insert(studioInterview).values({
      candidateName: "张三",
      createdAt: NOW,
      createdBy: USER_ID,
      id: recordId,
      interviewQuestions: [
        { difficulty: "easy", order: 1, question: "自我介绍" },
        { difficulty: "medium", order: 2, question: "项目难点" },
      ],
      organizationId: ORG,
      resumeProfile: {
        age: null,
        email: null,
        gender: null,
        name: "张三",
        personalStrengths: [],
        phone: null,
        projectExperiences: [],
        schools: [],
        skills: [],
        targetRoles: [],
        workExperiences: [],
        workYears: null,
      },
      status: "draft",
      updatedAt: NOW,
    });

    const detail = await loadResumeDetail(recordId, ORG);
    expect(detail).not.toBeNull();
    expect(detail?.interviewQuestions).toHaveLength(2);
    expect(detail?.interviewQuestions[0]?.question).toBe("自我介绍");
  });

  it("returns empty array for rows without questions", async () => {
    const recordId = "rp-no-questions";
    await db.insert(studioInterview).values({
      candidateName: "李四",
      createdAt: NOW,
      createdBy: USER_ID,
      id: recordId,
      interviewQuestions: [],
      organizationId: ORG,
      status: "draft",
      updatedAt: NOW,
    });

    const detail = await loadResumeDetail(recordId, ORG);
    expect(detail?.interviewQuestions).toEqual([]);
  });
});
