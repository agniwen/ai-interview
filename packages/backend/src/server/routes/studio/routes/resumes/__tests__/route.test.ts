// Smoke test for the resume library route. We bypass the Hono pipeline (auth
// middleware needs a session cookie which is heavyweight to fake) and assert
// the DAO + handler glue directly via the same code paths that the live
// route calls. The DAO test already covers query scope; here we lock in the
// PATCH whitelist (no interview field bleed) and that the detail DTO drops
// interview-only properties even when the underlying row has them.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@arc/backend/lib/server/db";
import { member, organization, studioInterview, user } from "@arc/db-schema/schema";
import { loadResumeDetail } from "@arc/backend/server/routes/studio/routes/resumes/dao/resumes";
import { parseResumeLibraryEditFormInput } from "@arc/backend/server/routes/studio/routes/resumes/route";

const ORG = "test_org_resume_route";
const USER_ID = "test_user_resume_route";
const NOW = new Date("2026-05-13T11:00:00.000Z");

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
    email: "route-resume@example.com",
    emailVerified: false,
    id: USER_ID,
    name: "route-resume",
    updatedAt: NOW,
  });
  await db.insert(organization).values({
    createdAt: NOW,
    id: ORG,
    name: "Route Org",
    slug: "test-route-resume",
  });
  await db.insert(member).values({
    createdAt: NOW,
    id: "m_route_resume",
    organizationId: ORG,
    role: "owner",
    userId: USER_ID,
  });
});

afterAll(async () => {
  await cleanup();
});

describe("resume detail DTO", () => {
  it("hides interview-only fields from the detail shape", async () => {
    await db.insert(studioInterview).values({
      candidateName: "测试",
      createdAt: NOW,
      createdBy: USER_ID,
      id: "ri_route_test",
      interviewQuestions: [
        { difficulty: "easy", order: 1, question: "Should never leak through detail DTO" },
      ],
      organizationId: ORG,
      status: "in_progress",
      updatedAt: NOW,
    });

    const detail = await loadResumeDetail("ri_route_test", ORG);
    expect(detail).not.toBeNull();
    // interviewQuestions is now exposed by the detail DTO (Task 1).
    // interviewQuestions 已由 Task 1 纳入详情 DTO，此处不再断言其缺失。
    expect(detail).not.toHaveProperty("scheduleEntries");
    expect(detail?.status).toBe("in_progress");
    expect(detail?.candidateName).toBe("测试");
  });
});

describe("resume PATCH form parsing", () => {
  it("requires candidate name when editing resume library records", () => {
    const formData = new FormData();
    formData.set("candidateName", "   ");
    formData.set("candidateEmail", "candidate@example.com");
    formData.set("candidatePhone", "13800138000");
    formData.set("jobDescriptionId", "jd_1");
    formData.set("notes", "备注");
    formData.set("targetRole", "前端工程师");

    const result = parseResumeLibraryEditFormInput(formData);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("请填写候选人姓名");
  });
});
