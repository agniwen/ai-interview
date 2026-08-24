import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { resumePoolImportInputSchema } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-pool/schema";
import type { ResumePoolDetail } from "@arc/shared/resume-pool";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { DedupMatchRecord } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/interviews/dao/studio-interviews";
import { createResumePoolRouter } from "../route";
import type { ResumePoolRouterDependencies } from "../route";

const mocks = {
  completeResumePoolReadinessWithDefaultAdapters:
    vi.fn<ResumePoolRouterDependencies["completeResumePoolReadinessWithDefaultAdapters"]>(),
  createPptxPreviewPdfResponse:
    vi.fn<ResumePoolRouterDependencies["createPptxPreviewPdfResponse"]>(),
  createResumePoolItem: vi.fn<ResumePoolRouterDependencies["createResumePoolItem"]>(),
  deleteOwnPoolItem: vi.fn<ResumePoolRouterDependencies["deleteOwnPoolItem"]>(),
  enqueueCandidateQuestionGenerationForRecordBestEffort:
    vi.fn<ResumePoolRouterDependencies["enqueueCandidateQuestionGenerationForRecordBestEffort"]>(),
  findSemanticResumeDuplicates:
    vi.fn<ResumePoolRouterDependencies["findSemanticResumeDuplicates"]>(),
  getObjectBytes: vi.fn<ResumePoolRouterDependencies["getObjectBytes"]>(),
  getObjectStream: vi.fn<ResumePoolRouterDependencies["getObjectStream"]>(),
  importPoolItemToResumeLibrary:
    vi.fn<ResumePoolRouterDependencies["importPoolItemToResumeLibrary"]>(),
  intersectRequestedCreatorIds: vi.fn<ResumePoolRouterDependencies["intersectRequestedCreatorIds"]>(
    (requestedCreatorIds, scope) => {
      if (scope.kind === "all") {
        return requestedCreatorIds?.length ? requestedCreatorIds : null;
      }
      if (scope.kind === "none") {
        return [];
      }
      if (!requestedCreatorIds?.length) {
        return scope.userIds ?? [];
      }
      const visible = new Set(scope.userIds);
      return requestedCreatorIds.filter((id) => visible.has(id));
    },
  ),
  listDuplicateMatchesForSource:
    vi.fn<ResumePoolRouterDependencies["listDuplicateMatchesForSource"]>(),
  listResumePoolUploaders: vi.fn<ResumePoolRouterDependencies["listResumePoolUploaders"]>(),
  loadResumePoolItem: vi.fn<ResumePoolRouterDependencies["loadResumePoolItem"]>(),
  normalizeResumeFile: (value: FormDataEntryValue | null) => (value instanceof File ? value : null),
  queryResumePoolItems: vi.fn<ResumePoolRouterDependencies["queryResumePoolItems"]>(),
  recruitingJobDescriptionIdsExist:
    vi.fn<ResumePoolRouterDependencies["recruitingJobDescriptionIdsExist"]>(),
  requirePermission: vi.fn<ResumePoolRouterDependencies["requirePermission"]>(
    () => async (_c, next) => {
      await next();
    },
  ),
  resolveRecruitingVisibilityScope:
    vi.fn<ResumePoolRouterDependencies["resolveRecruitingVisibilityScope"]>(),
  retryFailedResumeParse: vi.fn<ResumePoolRouterDependencies["retryFailedResumeParse"]>(),
  storeInterviewResume: vi.fn<ResumePoolRouterDependencies["storeInterviewResume"]>(),
  toBadRequest: vi.fn<ResumePoolRouterDependencies["toBadRequest"]>(),
  validateResumeFile: vi.fn<ResumePoolRouterDependencies["validateResumeFile"]>(),
} satisfies Partial<ResumePoolRouterDependencies>;

const ORGANIZATION_ID = "org_resume_pool_route";
const USER_ID = "user_resume_pool_route";

const resumeProfile: ResumeProfile = {
  age: null,
  educationExperiences: [],
  email: "candidate@example.com",
  gender: "未发现信息",
  name: "候选人",
  personalStrengths: [],
  phone: "13800138000",
  projectExperiences: [],
  schools: [],
  skills: [],
  targetRoles: [],
  workExperiences: [],
  workYears: null,
};

function makePoolItem(overrides: Partial<ResumePoolDetail>): ResumePoolDetail {
  return {
    candidateEmail: null,
    candidateName: "候选人",
    candidatePhone: null,
    createdAt: "2026-08-18T00:00:00.000Z",
    createdBy: USER_ID,
    duplicateMatch: null,
    id: "pool-item",
    importedAt: null,
    importedRecords: [],
    importedResumeRecordId: null,
    jobBindingMode: null,
    jobDescriptionId: null,
    jobDescriptionName: null,
    masteredSkills: [],
    notes: null,
    organizationId: ORGANIZATION_ID,
    profileHighlights: {
      educationItems: [],
      educationLines: [],
      latestCompany: null,
      latestCompanyDetail: null,
      latestProject: null,
      latestProjectDetail: null,
      schools: [],
    },
    publishedAt: null,
    publishedBy: null,
    resumeContentHash: null,
    resumeFileName: null,
    resumeParseError: null,
    resumeParseRetryable: false,
    resumeParseStatus: "ready",
    resumeParsedAt: null,
    resumeProfile,
    resumeProfileSnapshot: {
      education: [],
      educationHasMore: false,
      projects: [],
      projectsHasMore: false,
      work: [],
      workHasMore: false,
    },
    resumeStorageKey: null,
    scope: "private",
    skillsNormalized: [],
    sourceChannel: null,
    sourceOrganizationId: null,
    sourcePoolItemId: null,
    sourceUserId: null,
    status: "active",
    targetRole: null,
    updatedAt: "2026-08-18T00:00:00.000Z",
    uploaderEmail: null,
    uploaderImage: null,
    uploaderName: null,
    uploaderOrganizationName: null,
    workYears: null,
    ...overrides,
  };
}

const duplicateMatch = {
  candidateEmail: "dup@example.com",
  candidateName: "重复候选人",
  candidatePhone: "13800138000",
  createdAt: "2026-06-30T00:00:00.000Z",
  id: "duplicate-1",
  jobDescriptionName: null,
  status: "active",
  targetRole: null,
} satisfies DedupMatchRecord;

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("activeOrg", { id: ORGANIZATION_ID } as never);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("member", { role: "member" } as never);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("user", { id: USER_ID } as never);
      await next();
    })
    .route("/resume-pool", createResumePoolRouter(mocks));
}

describe("resume pool private uploader visibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queryResumePoolItems.mockResolvedValue({ records: [], total: 0 });
    mocks.resolveRecruitingVisibilityScope.mockResolvedValue({
      kind: "restricted",
      userIds: [USER_ID, "subordinate-user"],
    });
    mocks.retryFailedResumeParse.mockResolvedValue({ status: "queued" });
  });

  it("defaults private listings to the current uploader", async () => {
    const response = await makeApp().request("/resume-pool?scope=private");

    expect(response.status).toBe(200);
    expect(mocks.queryResumePoolItems).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorIds: [USER_ID],
        organizationId: ORGANIZATION_ID,
        scope: "private",
      }),
    );
  });

  it("allows selecting a visible subordinate uploader", async () => {
    const response = await makeApp().request(
      "/resume-pool?scope=private&uploaderId=subordinate-user",
    );

    expect(response.status).toBe(200);
    expect(mocks.queryResumePoolItems).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorIds: ["subordinate-user"],
        organizationId: ORGANIZATION_ID,
        scope: "private",
      }),
    );
  });

  it("returns no records for an uploader outside the visibility scope", async () => {
    const response = await makeApp().request("/resume-pool?scope=private&uploaderId=other-user");

    expect(response.status).toBe(200);
    expect(mocks.queryResumePoolItems).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorIds: [],
        organizationId: ORGANIZATION_ID,
        scope: "private",
      }),
    );
  });

  it("expands all uploaders only within the visibility scope", async () => {
    const response = await makeApp().request("/resume-pool?scope=private&uploaderId=all");

    expect(response.status).toBe(200);
    expect(mocks.queryResumePoolItems).toHaveBeenCalledWith(
      expect.objectContaining({
        creatorIds: [USER_ID, "subordinate-user"],
        organizationId: ORGANIZATION_ID,
        scope: "private",
      }),
    );
  });

  it("forwards public filters and a bounded page to the DAO", async () => {
    const response = await makeApp().request(
      "/resume-pool?scope=public&createdFrom=2026-08-01&createdTo=2026-08-07&importStatus=not_imported&limit=100&offset=100&search=候选人&sourceType=referral&uploaderIds=referrer-1,referrer-2&sortBy=updatedAt&sortOrder=asc",
    );

    expect(response.status).toBe(200);
    expect(mocks.queryResumePoolItems).toHaveBeenCalledWith(
      expect.objectContaining({
        createdAtBefore: new Date("2026-08-07T16:00:00.000Z"),
        createdAtFrom: new Date("2026-07-31T16:00:00.000Z"),
        creatorIds: ["referrer-1", "referrer-2"],
        importStatus: "not_imported",
        limit: 100,
        offset: 100,
        search: "候选人",
        sortBy: "updatedAt",
        sortOrder: "asc",
        sourceType: "referral",
      }),
    );
  });

  it("loads a private detail through the same recruiting visibility scope", async () => {
    mocks.loadResumePoolItem.mockResolvedValue(makePoolItem({ id: "subordinate-item" }));

    const response = await makeApp().request("/resume-pool/subordinate-item");

    expect(response.status).toBe(200);
    expect(mocks.loadResumePoolItem).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      poolItemId: "subordinate-item",
      visibilityScope: {
        kind: "restricted",
        userIds: [USER_ID, "subordinate-user"],
      },
    });
  });

  it("queues one retry for an eligible failed resume", async () => {
    mocks.loadResumePoolItem.mockResolvedValue(
      makePoolItem({
        id: "failed-item",
        resumeParseRetryable: true,
        resumeParseStatus: "failed",
      }),
    );

    const response = await makeApp().request("/resume-pool/failed-item/retry-parse", {
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(mocks.retryFailedResumeParse).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      poolItemId: "failed-item",
      requestedBy: USER_ID,
    });
  });

  it("rejects a failed resume that already used its retry", async () => {
    mocks.loadResumePoolItem.mockResolvedValue(
      makePoolItem({
        id: "failed-item",
        resumeParseRetryable: false,
        resumeParseStatus: "failed",
      }),
    );

    const response = await makeApp().request("/resume-pool/failed-item/retry-parse", {
      method: "POST",
    });

    expect(response.status).toBe(409);
    expect(mocks.retryFailedResumeParse).not.toHaveBeenCalled();
  });

  it("reads a subordinate resume file through the recruiting visibility scope", async () => {
    mocks.loadResumePoolItem.mockResolvedValue(
      makePoolItem({
        resumeFileName: "subordinate.pdf",
        resumeStorageKey: "private/subordinate.pdf",
      }),
    );
    mocks.getObjectStream.mockResolvedValue({
      body: new Blob(["resume"]).stream(),
      contentLength: 6,
      contentType: "application/pdf",
    });

    const response = await makeApp().request("/resume-pool/subordinate-item/resume");

    expect(response.status).toBe(200);
    expect(mocks.loadResumePoolItem).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      poolItemId: "subordinate-item",
      visibilityScope: {
        kind: "restricted",
        userIds: [USER_ID, "subordinate-user"],
      },
    });
  });

  it("reads a subordinate resume preview through the recruiting visibility scope", async () => {
    mocks.loadResumePoolItem.mockResolvedValue(
      makePoolItem({
        resumeFileName: "subordinate.pptx",
        resumeStorageKey: "private/subordinate.pptx",
      }),
    );
    mocks.getObjectBytes.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    mocks.createPptxPreviewPdfResponse.mockResolvedValue(new Response("preview", { status: 200 }));

    const response = await makeApp().request("/resume-pool/subordinate-item/resume-preview.pdf");

    expect(response.status).toBe(200);
    expect(mocks.loadResumePoolItem).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      poolItemId: "subordinate-item",
      visibilityScope: {
        kind: "restricted",
        userIds: [USER_ID, "subordinate-user"],
      },
    });
  });

  it.each(["resume", "resume-preview.pdf"])(
    "does not read an out-of-scope private %s",
    async (suffix) => {
      mocks.loadResumePoolItem.mockResolvedValue(null);

      const response = await makeApp().request(`/resume-pool/other-item/${suffix}`);

      expect(response.status).toBe(404);
      expect(mocks.getObjectStream).not.toHaveBeenCalled();
      expect(mocks.getObjectBytes).not.toHaveBeenCalled();
    },
  );

  it("keeps private deletion restricted to the current owner", async () => {
    mocks.deleteOwnPoolItem.mockRejectedValue(new Error("记录不存在或无权删除。"));

    const response = await makeApp().request("/resume-pool/subordinate-item", {
      method: "DELETE",
    });

    expect(response.status).toBe(404);
    expect(mocks.deleteOwnPoolItem).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      poolItemId: "subordinate-item",
      userId: USER_ID,
    });
  });

  it("lists only uploader options inside the recruiting visibility scope", async () => {
    mocks.listResumePoolUploaders.mockResolvedValue([
      { email: "self@example.com", id: USER_ID, image: null, name: "自己" },
      {
        email: "subordinate@example.com",
        id: "subordinate-user",
        image: null,
        name: "下级成员",
      },
    ]);

    const response = await makeApp().request("/resume-pool/uploaders");

    expect(response.status).toBe(200);
    expect(mocks.listResumePoolUploaders).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      visibilityScope: {
        kind: "restricted",
        userIds: [USER_ID, "subordinate-user"],
      },
    });
    expect(await response.json()).toEqual({
      records: [
        { email: "self@example.com", id: USER_ID, image: null, name: "自己" },
        {
          email: "subordinate@example.com",
          id: "subordinate-user",
          image: null,
          name: "下级成员",
        },
      ],
    });
  });
});

describe("resumePoolImportInputSchema", () => {
  it("requires a job description id in bind mode", () => {
    const result = resumePoolImportInputSchema.safeParse({
      dedupPolicy: "check",
      jobDescriptionId: null,
      jobDescriptionMode: "bind",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("绑定岗位时必须选择岗位。");
  });

  it("normalizes jobDescriptionId to null in none mode", () => {
    const result = resumePoolImportInputSchema.parse({
      dedupPolicy: "force",
      jobDescriptionId: "jd_should_be_ignored",
      jobDescriptionMode: "none",
    });

    expect(result.jobDescriptionId).toBeNull();
  });

  it("preserves an explicit reimport request", () => {
    const result = resumePoolImportInputSchema.parse({
      dedupPolicy: "force",
      jobDescriptionId: null,
      jobDescriptionMode: "none",
      reimport: true,
    });

    expect(result.reimport).toBe(true);
  });
});

describe("resume pool import route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enqueueCandidateQuestionGenerationForRecordBestEffort.mockResolvedValue(true);
  });

  it("forwards an explicit reimport request to the DAO", async () => {
    mocks.importPoolItemToResumeLibrary.mockResolvedValue({
      resumeRecordId: "resume-record-2",
      status: "imported",
    });

    const response = await makeApp().request("/resume-pool/pool-item-1/import", {
      body: JSON.stringify({
        dedupPolicy: "force",
        jobDescriptionMode: "none",
        reimport: true,
      }),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    expect(response.status).toBe(201);
    expect(mocks.importPoolItemToResumeLibrary).toHaveBeenCalledWith({
      dedupPolicy: "force",
      importedBy: USER_ID,
      jobDescriptionId: null,
      organizationId: ORGANIZATION_ID,
      poolItemId: "pool-item-1",
      reimport: true,
    });
    expect(mocks.enqueueCandidateQuestionGenerationForRecordBestEffort).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      resumeRecordId: "resume-record-2",
    });
  });
});

describe("resume pool duplicate handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records duplicate matches after creating a private pool item", async () => {
    const matches = [duplicateMatch];
    mocks.storeInterviewResume.mockResolvedValue({
      cachedResumeProfile: resumeProfile,
      contentHash: "hash-1",
      resumeText: "简历原文",
      storageKey: "resume/hash-1.pdf",
    });
    mocks.findSemanticResumeDuplicates.mockResolvedValue(matches);
    mocks.createResumePoolItem.mockResolvedValue("pool-item-1");
    mocks.loadResumePoolItem.mockResolvedValue(makePoolItem({ id: "pool-item-1" }));

    const formData = new FormData();
    formData.set("candidateName", "候选人");
    formData.set("resume", new File(["pdf"], "resume.pdf", { type: "application/pdf" }));
    formData.set("scope", "private");

    const response = await makeApp().request("/resume-pool", {
      body: formData,
      method: "POST",
    });

    expect(response.status).toBe(201);
    expect(mocks.findSemanticResumeDuplicates).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: ORGANIZATION_ID,
        poolOwnerUserId: USER_ID,
        poolScope: "private",
        sourceTypes: ["studio_interview", "resume_pool_item"],
      }),
    );
    expect(mocks.completeResumePoolReadinessWithDefaultAdapters).toHaveBeenCalledWith({
      duplicateMatches: matches,
      organizationId: ORGANIZATION_ID,
      poolItemId: "pool-item-1",
    });
  });

  it("returns duplicate match details for an accessible pool item", async () => {
    const matches = [duplicateMatch];
    mocks.loadResumePoolItem.mockResolvedValue(makePoolItem({ id: "pool-item-1" }));
    mocks.listDuplicateMatchesForSource.mockResolvedValue(matches);

    const response = await makeApp().request("/resume-pool/pool-item-1/duplicate-matches");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ matches });
    expect(mocks.listDuplicateMatchesForSource).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      sourceId: "pool-item-1",
      sourceType: "resume_pool_item",
    });
  });
});

describe("resume pool review routes (permission-free dedup comparison reads)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads a pool item detail ignoring the visibility scope", async () => {
    mocks.loadResumePoolItem.mockResolvedValue(makePoolItem({ id: "pool-item-1" }));

    const response = await makeApp().request("/resume-pool/pool-item-1/review");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ id: "pool-item-1" });
    expect(mocks.loadResumePoolItem).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      poolItemId: "pool-item-1",
      visibilityScope: { kind: "all" },
    });
  });

  it("returns 404 for a pool item outside the workspace", async () => {
    mocks.loadResumePoolItem.mockResolvedValue(null);

    const response = await makeApp().request("/resume-pool/missing-item/review");

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "记录不存在。" });
  });

  it("streams the original resume file from the review endpoint", async () => {
    mocks.loadResumePoolItem.mockResolvedValue(
      makePoolItem({
        resumeFileName: "candidate.pdf",
        resumeStorageKey: "keys/candidate.pdf",
      }),
    );
    mocks.getObjectStream.mockResolvedValue({
      body: new Blob(["resume"]).stream(),
      contentLength: 6,
      contentType: "application/pdf",
    });

    const response = await makeApp().request("/resume-pool/pool-item-1/review/resume");

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(mocks.loadResumePoolItem).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      poolItemId: "pool-item-1",
      visibilityScope: { kind: "all" },
    });
    expect(mocks.getObjectStream).toHaveBeenCalledWith("keys/candidate.pdf");
  });

  it("serves the converted preview PDF for PPTX sources", async () => {
    mocks.loadResumePoolItem.mockResolvedValue(
      makePoolItem({
        resumeFileName: "deck.pptx",
        resumeStorageKey: "keys/deck.pptx",
      }),
    );
    mocks.getObjectBytes.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
    mocks.createPptxPreviewPdfResponse.mockResolvedValue(new Response("preview", { status: 200 }));

    const response = await makeApp().request("/resume-pool/pool-item-1/review/resume-preview.pdf");

    expect(response.status).toBe(200);
    expect(mocks.getObjectBytes).toHaveBeenCalledWith("keys/deck.pptx");
    expect(mocks.createPptxPreviewPdfResponse).toHaveBeenCalledWith({
      bytes: expect.any(Uint8Array),
      cacheKey: "keys/deck.pptx",
      fileName: "deck.pptx",
      mediaType: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    });
  });
});
