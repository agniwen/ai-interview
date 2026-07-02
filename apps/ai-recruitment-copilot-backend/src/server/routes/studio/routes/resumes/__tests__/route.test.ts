// Smoke test for the resume library route. We bypass the Hono pipeline (auth
// middleware needs a session cookie which is heavyweight to fake) and assert
// the DAO + handler glue directly via the same code paths that the live
// route calls. The DAO test already covers query scope; here we lock in the
// PATCH whitelist (no interview field bleed) and that the detail DTO drops
// interview-only properties even when the underlying row has them.

import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ResumeAnalysisResult } from "@arc/db-schema/interview/types";
import type { db as database } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import type {
  member as memberTable,
  organization as organizationTable,
  studioInterview as studioInterviewTable,
  user as userTable,
} from "@arc/db-schema/schema";
import type { loadResumeDetail as loadResumeDetailFn } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/resumes";
import type { parseResumeLibraryEditFormInput as parseResumeLibraryEditFormInputFn } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/route";

const routeSource = readFileSync(new URL("../route.ts", import.meta.url), "utf-8");
const createFromStorageSource = readFileSync(
  new URL("../utils/create-from-storage.ts", import.meta.url),
  "utf-8",
);
const evaluationDaoSource = readFileSync(new URL("../dao/evaluation.ts", import.meta.url), "utf-8");
const resumeDaoSource = readFileSync(new URL("../dao/resumes.ts", import.meta.url), "utf-8");
const resumePoolDaoSource = readFileSync(
  new URL("../../resume-pool/dao.ts", import.meta.url),
  "utf-8",
);
const resumePoolRouteSource = readFileSync(
  new URL("../../resume-pool/route.ts", import.meta.url),
  "utf-8",
);
const batchProcessorSource = readFileSync(
  new URL("../../resume-upload-batches/utils/processor.ts", import.meta.url),
  "utf-8",
);
const dbSchemaSource = readFileSync(
  new URL("../../../../../../../../../packages/db-schema/src/schema.ts", import.meta.url),
  "utf-8",
);
const sharedStudioResumesSource = readFileSync(
  new URL("../../../../../../../../../packages/shared/src/studio-resumes.ts", import.meta.url),
  "utf-8",
);
const sharedResumePoolSource = readFileSync(
  new URL("../../../../../../../../../packages/shared/src/resume-pool.ts", import.meta.url),
  "utf-8",
);
const resumeTextMigrationSource = readFileSync(
  new URL(
    "../../../../../../../../../apps/ai-recruitment-copilot/drizzle/20260625160000_add_resume_text/migration.sql",
    import.meta.url,
  ),
  "utf-8",
);
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
    ({ db } = await import("@arc/ai-recruitment-copilot-backend/lib/server/db"));
    ({ member, organization, studioInterview, user } = await import("@arc/db-schema/schema"));
    ({ loadResumeDetail } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/dao/resumes"));
    ({ parseResumeLibraryEditFormInput } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/route"));

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
});

describe("resume duplicate match details route", () => {
  it("exposes duplicate match details for badge clicks", () => {
    expect(routeSource).toContain('"/:id/duplicate-matches"');
    expect(routeSource).toContain("listDuplicateMatchesForSource");
  });
});

describeWithDatabase("resolveResumeUploadStorage", () => {
  it("stores only the uploaded object when the client already sent resumePayload", async () => {
    const { resolveResumeUploadStorage } =
      await import("@arc/ai-recruitment-copilot-backend/server/routes/interview/utils");
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

describe("resume semantic index cleanup", () => {
  it("cleans semantic indexes after single and bulk resume-library deletion", () => {
    expect(routeSource).toContain("deleteResumeSemanticIndexBestEffort");
    expect(routeSource).toContain("deleteDuplicateMatchesForSource");
    expect(routeSource).toContain('sourceType: "studio_interview"');
    expect(routeSource).toContain("sourceId: id");
    expect(routeSource).toContain("for (const deletedId of result)");
    expect(routeSource).toContain("sourceId: deletedId.id");
  });
});

describe("resume library create duplicate handling", () => {
  it("persists duplicate matches after creating the resume instead of returning conflict", () => {
    expect(routeSource).toContain("replaceDuplicateMatchesForSource");
    expect(routeSource).toContain("const dedupMatches = await findSemanticResumeDuplicates");
    expect(routeSource).toContain("sourceId: recordId");
    expect(routeSource).toContain('sourceType: "studio_interview"');
    expect(routeSource).not.toContain("return c.json(dedupConflict, 409)");
  });
});

describe("resume OCR text persistence", () => {
  it("adds nullable resume_text columns to resume library and resume pool tables", () => {
    expect(dbSchemaSource).toContain('resumeText: text("resume_text")');
    expect(resumeTextMigrationSource).toContain(
      'ALTER TABLE "studio_interview" ADD COLUMN "resume_text" text;',
    );
    expect(resumeTextMigrationSource).toContain(
      'ALTER TABLE "resume_pool_item" ADD COLUMN "resume_text" text;',
    );
  });

  it("persists parser text on direct uploads, batch uploads, pool rows, and pool imports", () => {
    expect(routeSource).toContain("resumeText = parsed.parsedText");
    expect(routeSource).toContain("resumeText,");
    expect(createFromStorageSource).toContain("resumeText: input.resumeText");
    expect(batchProcessorSource).toContain("resumeText,");
    expect(resumePoolRouteSource).toContain("resumeText = parsed.parsedText");
    expect(resumePoolDaoSource).toContain("resumeText: input.resumeText");
    expect(resumePoolDaoSource).toContain("resumeText: poolItem.resumeText");
  });

  it("does not expose resumeText through frontend-facing list or detail DTOs", () => {
    expect(sharedStudioResumesSource).not.toContain("resumeText");
    expect(sharedResumePoolSource).not.toContain("resumeText");
    expect(evaluationDaoSource).not.toContain("resumeText");
    expect(createFromStorageSource).toContain("resumeText: input.resumeText");
    expect(resumePoolDaoSource).not.toContain("resumeText: row.resumeText");
    expect(resumePoolDaoSource).not.toContain("resumeText: row.item.resumeText");
  });
});

describe("resume library list DTO", () => {
  it("exposes card-ready summary fields instead of full resume JSON blobs", () => {
    const listRecordSource = sharedStudioResumesSource.slice(
      sharedStudioResumesSource.indexOf("export interface ResumeLibraryListRecord"),
      sharedStudioResumesSource.indexOf("export interface ResumeLibraryDetail"),
    );
    const detailRecordSource = sharedStudioResumesSource.slice(
      sharedStudioResumesSource.indexOf("export interface ResumeLibraryDetail"),
    );
    const toRecordSource = resumeDaoSource.slice(
      resumeDaoSource.indexOf("function toRecord("),
      resumeDaoSource.indexOf("export async function queryPaginatedResumeRecords("),
    );

    expect(listRecordSource).toContain("resumeSkills: string[];");
    expect(listRecordSource).toContain("resumeSummary: string | null;");
    expect(listRecordSource).toContain("resumeProfileSnapshot: ResumeLibraryProfileSnapshot;");
    expect(listRecordSource).not.toContain("resumeProfile: ResumeProfile | null;");
    expect(listRecordSource).not.toContain("resumeReview: ResumeReview | null;");
    expect(detailRecordSource).toContain("resumeProfile: ResumeProfile | null;");
    expect(detailRecordSource).toContain("resumeReview: ResumeReview | null;");
    expect(resumeDaoSource).toContain("resumeProfile: studioInterview.resumeProfile");
    expect(toRecordSource).toContain("resumeSkills:");
    expect(toRecordSource).toContain("resumeSummary:");
    expect(toRecordSource).toContain("resumeProfileSnapshot:");
    expect(toRecordSource).not.toContain("resumeProfile: row.resumeProfile");
    expect(toRecordSource).not.toContain("resumeReview: row.resumeReview");
  });
});

describe("resume review detail route", () => {
  it("exposes member-scoped review endpoints without relaxing the existing library detail route", () => {
    expect(routeSource).toContain('"/:id/review"');
    expect(routeSource).toContain('"/:id/review/timeline"');
    expect(routeSource).toContain('"/:id/review/rounds"');
    expect(routeSource).toContain('"/:id/review/resume"');
    expect(routeSource).toContain('"/:id/review/evaluation"');
    expect(routeSource).toContain("loadResumeDetailForWorkspaceMember");
    expect(routeSource).toContain("submitResumeEvaluationOnce");
  });

  it("records audit logs for reviewer submission and admin edits", () => {
    expect(evaluationDaoSource).toContain("resume_evaluation_submitted");
    expect(evaluationDaoSource).toContain("resume_evaluation_updated");
    expect(evaluationDaoSource).toContain("fromStatus");
    expect(evaluationDaoSource).toContain("toStatus");
  });

  it("generates a V2 resume review on create when the client did not provide one", () => {
    expect(routeSource).toContain("generateResumeReviewBestEffort");
    expect(routeSource).toContain("let resumeReview = resumeReviewInput.data");
    expect(routeSource).toContain("generatedReview?.structuredReview ?? null");
    expect(routeSource).toContain("resumeReview,");
  });
});
