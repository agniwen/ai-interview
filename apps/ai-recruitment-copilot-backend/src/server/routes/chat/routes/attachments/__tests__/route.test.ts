import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultJobDescriptionStructuredConfig } from "@arc/db-schema/job-description-structured-config";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { ResumeParserStructured } from "@arc/db-schema/resume-parser-schema";
import { createDefaultResumeScreeningPolicy } from "@arc/shared/job-descriptions";
import type { JobDescriptionListRecord } from "@arc/shared/job-descriptions";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import type { ChatAttachmentRow } from "@arc/ai-recruitment-copilot-backend/server/routes/chat/dao/chat-attachments";
import { createAttachmentsRouter } from "@arc/ai-recruitment-copilot-backend/server/routes/chat/routes/attachments/route";
import type { AttachmentRouteDependencies } from "@arc/ai-recruitment-copilot-backend/server/routes/chat/routes/attachments/route";

const mocks = {
  generateResumeStructured: vi.fn<AttachmentRouteDependencies["generateResumeStructured"]>(),
  getObjectBytes: vi.fn<AttachmentRouteDependencies["getObjectBytes"]>(),
  getObjectStream: vi.fn<AttachmentRouteDependencies["getObjectStream"]>(),
  getUserAttachment: vi.fn<AttachmentRouteDependencies["getUserAttachment"]>(),
  listRecruitingJobDescriptions:
    vi.fn<AttachmentRouteDependencies["listRecruitingJobDescriptions"]>(),
  parseResumeFast: vi.fn<AttachmentRouteDependencies["parseResumeFast"]>(),
  projectAttachmentToResumeProfile:
    vi.fn<AttachmentRouteDependencies["projectAttachmentToResumeProfile"]>(),
  resolveJobDescriptionMatchBestEffort:
    vi.fn<AttachmentRouteDependencies["resolveJobDescriptionMatchBestEffort"]>(),
  updateParseResultByHash: vi.fn<AttachmentRouteDependencies["updateParseResultByHash"]>(),
  updateStructuredByHash: vi.fn<AttachmentRouteDependencies["updateStructuredByHash"]>(),
};

const dependencies: AttachmentRouteDependencies = mocks;

const ORG_ID = "org_attachments_route";
const USER_ID = "user_attachments_route";

const profile: ResumeProfile = {
  age: null,
  educationExperiences: [],
  email: null,
  gender: null,
  name: "林雪莹",
  personalStrengths: [],
  phone: null,
  projectExperiences: [],
  schools: [],
  skills: ["React"],
  targetRoles: ["前端工程师"],
  workExperiences: [],
  workYears: null,
};

const structured: ResumeParserStructured = {
  age: null,
  degree: null,
  education: null,
  educationExperiences: [],
  email: null,
  gender: null,
  graduationYear: null,
  links: [],
  major: null,
  name: "林雪莹",
  personalStrengths: [],
  phone: null,
  projectExperiences: [],
  schools: [],
  skills: ["React"],
  targetRoles: ["前端工程师"],
  timelineSummary: {
    currentStatus: null,
    dateRanges: [],
    estimatedExperienceYears: null,
    riskSignals: [],
  },
  workExperiences: [],
  workYears: null,
};

const jobDescriptions: JobDescriptionListRecord[] = [
  {
    allowCrossDepartmentInterviewers: false,
    code: null,
    createdAt: "2026-08-18T00:00:00.000Z",
    createdBy: null,
    deductionRuleSetVersion: null,
    departmentId: "department-1",
    departmentName: null,
    description: null,
    evaluationBlueprint: null,
    evaluationBlueprintHash: null,
    evaluationBlueprintPreview: null,
    evaluationBlueprintPreviewGeneratedAt: null,
    evaluationBlueprintPreviewHash: null,
    evaluationBlueprintPreviewInputHash: null,
    evaluationBlueprintSchemaVersion: null,
    evaluationMode: "legacy",
    evaluationUpgradedAt: null,
    evaluationUpgradedBy: null,
    hasEvaluationUpgradeDraft: false,
    id: "jd-1",
    interviewerIds: [],
    interviewers: [],
    lifecycleStatus: "published",
    name: "前端工程师",
    presetQuestions: [],
    prompt: "负责前端工程开发。",
    publishedAt: "2026-08-18T00:00:00.000Z",
    resumeCount: 0,
    resumeScreeningPolicy: createDefaultResumeScreeningPolicy(),
    resumeScreeningPolicyHash: null,
    resumeScreeningPolicyVersion: 1,
    structuredConfig: createDefaultJobDescriptionStructuredConfig(),
    updatedAt: "2026-08-18T00:00:00.000Z",
  },
];

function makeAttachment(overrides: Partial<ChatAttachmentRow>): ChatAttachmentRow {
  return {
    contentHash: null,
    createdAt: new Date("2026-08-18T00:00:00.000Z"),
    filename: "resume.pdf",
    id: "att-1",
    mediaType: "application/pdf",
    organizationId: ORG_ID,
    parsedAt: null,
    parsedError: null,
    parsedPageCount: null,
    parsedStatus: "ready",
    parsedStructured: null,
    parsedText: null,
    parsedTextSource: null,
    size: 1024,
    storageKey: "attachments/att-1.pdf",
    userId: USER_ID,
    ...overrides,
  };
}

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("user", { id: USER_ID } as never);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("activeOrg", { id: ORG_ID } as never);
      await next();
    })
    .route("/attachments", createAttachmentsRouter(dependencies));
}

describe("attachmentsRouter match-job-description", () => {
  beforeEach(() => {
    for (const fn of Object.values(mocks)) {
      fn.mockReset();
    }
    mocks.listRecruitingJobDescriptions.mockResolvedValue(jobDescriptions);
    mocks.resolveJobDescriptionMatchBestEffort.mockResolvedValue({
      matchedId: "jd-1",
      reason: "技能匹配",
    });
  });

  it("matches from parsedStructured without regenerating structured resume data", async () => {
    mocks.getUserAttachment.mockResolvedValue(
      makeAttachment({
        contentHash: "a".repeat(64),
        parsedStructured: structured,
        parsedText: "ocr text",
      }),
    );
    mocks.projectAttachmentToResumeProfile.mockReturnValue(profile);

    const res = await makeApp().request("/attachments/att-1/match-job-description", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ matchedId: "jd-1", reason: "技能匹配" });
    expect(mocks.generateResumeStructured).not.toHaveBeenCalled();
    expect(mocks.resolveJobDescriptionMatchBestEffort).toHaveBeenCalledWith({
      jobDescriptions,
      resumeProfile: profile,
    });
  });

  it("generates structured resume data from cached OCR text and backfills by content hash", async () => {
    mocks.getUserAttachment.mockResolvedValue(
      makeAttachment({
        contentHash: "b".repeat(64),
        id: "att-2",
        parsedStructured: null,
        parsedText: "cached ocr text",
      }),
    );
    mocks.generateResumeStructured.mockResolvedValue(structured);
    mocks.projectAttachmentToResumeProfile.mockReturnValue(profile);

    const res = await makeApp().request("/attachments/att-2/match-job-description", {
      method: "POST",
    });

    expect(res.status).toBe(200);
    expect(mocks.generateResumeStructured).toHaveBeenCalledWith("cached ocr text");
    expect(mocks.updateStructuredByHash).toHaveBeenCalledWith("b".repeat(64), structured);
    expect(mocks.resolveJobDescriptionMatchBestEffort).toHaveBeenCalledWith({
      jobDescriptions,
      resumeProfile: profile,
    });
  });
});
