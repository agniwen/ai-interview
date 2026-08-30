// Smoke test for the resume library route. We bypass the Hono pipeline (auth
// middleware needs a session cookie which is heavyweight to fake) and assert
// the DAO + handler glue directly via the same code paths that the live
// route calls. The DAO test already covers query scope; here we lock in the
// PATCH whitelist (no interview field bleed) and that the detail DTO drops
// interview-only properties even when the underlying row has them.

import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ResumeAnalysisResult } from "@arc/db-schema/interview/types";
import type { db as database } from "@app/server/lib/server/db";
import type {
  member as memberTable,
  organization as organizationTable,
  studioInterview as studioInterviewTable,
  user as userTable,
} from "@arc/db-schema/schema";
import type { loadResumeDetail as loadResumeDetailFn } from "@app/server/server/routes/studio/routes/resumes/dao/resumes";
import type { parseResumeLibraryEditFormInput as parseResumeLibraryEditFormInputFn } from "@app/server/server/routes/studio/routes/resumes/route";

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

const ORG = "test_org_resume_route";
const USER_ID = "test_user_resume_route";
const NOW = new Date("2026-05-13T11:00:00.000Z");

const RESUME_PAYLOAD: ResumeAnalysisResult = {
  fileName: "resume.pdf",
  interviewQuestions: [],
  resumeProfile: {
    age: null,
    email: "candidate@example.com",
    gender: null,
    name: "候选人",
    personalStrengths: [],
    phone: "13800138000",
    projectExperiences: [],
    schools: [],
    skills: [],
    targetRoles: [],
    workExperiences: [],
    workYears: null,
  },
  resumeText: "客户端预解析 OCR 原文",
};

describeWithDatabase("resume detail route database behavior", () => {
  let db: typeof database;
  let loadResumeDetail: typeof loadResumeDetailFn;
  let member: typeof memberTable;
  let organization: typeof organizationTable;
  let parseResumeLibraryEditFormInput: typeof parseResumeLibraryEditFormInputFn;
  let studioInterview: typeof studioInterviewTable;
  let user: typeof userTable;

  async function cleanup() {
    await db.delete(studioInterview).where(eq(studioInterview.organizationId, ORG));
    await db.delete(member).where(eq(member.userId, USER_ID));
    await db.delete(organization).where(eq(organization.id, ORG));
    await db.delete(user).where(eq(user.id, USER_ID));
  }

  beforeAll(async () => {
    ({ db } = await import("@app/server/lib/server/db"));
    ({ member, organization, studioInterview, user } = await import("@arc/db-schema/schema"));
    ({ loadResumeDetail } =
      await import("@app/server/server/routes/studio/routes/resumes/dao/resumes"));
    ({ parseResumeLibraryEditFormInput } =
      await import("@app/server/server/routes/studio/routes/resumes/route"));

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
        updatedAt: NOW,
      });

      const detail = await loadResumeDetail("ri_route_test", ORG);
      expect(detail).not.toBeNull();
      // interviewQuestions is now exposed by the detail DTO (Task 1).
      // interviewQuestions 已由 Task 1 纳入详情 DTO，此处不再断言其缺失。
      expect(detail).not.toHaveProperty("scheduleEntries");
      expect(detail?.pipelineStage).toBe("screening");
      expect(detail?.outcome).toBe("in_pipeline");
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
});

describeWithDatabase("resolveResumeUploadStorage", () => {
  it("stores only the uploaded object when the client already sent resumePayload", async () => {
    const { resolveResumeUploadStorage } =
      await import("@app/server/server/routes/interview/utils");
    const storeObjectOnly = vi.fn().mockResolvedValue({
      contentHash: "hash-1",
      storageKey: "resume/hash-1.pdf",
    });
    const storeParsedResume = vi.fn();

    const result = await resolveResumeUploadStorage({
      organizationId: ORG,
      parsedResumePayload: RESUME_PAYLOAD,
      resume: new File(["pdf-bytes"], "resume.pdf", { type: "application/pdf" }),
      storeObjectOnly,
      storeParsedResume,
      userId: USER_ID,
    });

    expect(storeObjectOnly).toHaveBeenCalledTimes(1);
    expect(storeParsedResume).not.toHaveBeenCalled();
    expect(result).toEqual({
      cachedResumeProfile: null,
      contentHash: "hash-1",
      resumeText: "客户端预解析 OCR 原文",
      storageKey: "resume/hash-1.pdf",
    });
  });
});
