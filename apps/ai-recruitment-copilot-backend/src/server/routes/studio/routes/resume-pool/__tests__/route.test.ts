import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { resumePoolImportInputSchema } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-pool/schema";

const mocks = vi.hoisted(() => ({
  createPptxPreviewPdfResponse: vi.fn(),
  createResumePoolItem: vi.fn(),
  deleteOwnPoolItem: vi.fn(),
  findSemanticResumeDuplicates: vi.fn(),
  getObjectBytes: vi.fn(),
  getObjectStream: vi.fn(),
  intersectRequestedCreatorIds: vi.fn(
    (
      requestedCreatorIds: string[] | null | undefined,
      scope: { kind: string; userIds?: string[] },
    ) => {
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
  listDuplicateMatchesForSource: vi.fn(),
  listResumePoolUploaders: vi.fn(),
  loadResumePoolItem: vi.fn(),
  markResumePoolItemParseFailed: vi.fn(),
  markResumePoolItemSemanticIndexed: vi.fn(),
  queryResumePoolItems: vi.fn(),
  replaceDuplicateMatchesForSource: vi.fn(),
  resolveRecruitingVisibilityScope: vi.fn(),
  retryFailedResumeParse: vi.fn(),
  runResumeSemanticIndexJob: vi.fn(),
  storeInterviewResume: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({ db: {} }));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/s3", () => ({
  getObjectBytes: mocks.getObjectBytes,
  getObjectStream: mocks.getObjectStream,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent", () => ({
  parseResumeFastToProfile: vi.fn(),
  validateResumeFile: vi.fn(),
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/middlewares/permission", () => ({
  requirePermission: () => (_c: unknown, next: () => Promise<void>) => next(),
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility", () => ({
  intersectRequestedCreatorIds: mocks.intersectRequestedCreatorIds,
  resolveRecruitingVisibilityScope: mocks.resolveRecruitingVisibilityScope,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/interview/utils", () => ({
  normalizeResumeFile: (value: FormDataEntryValue | null) => value,
  storeInterviewResume: mocks.storeInterviewResume,
  toBadRequest: (error: unknown) => ({
    error: error instanceof Error ? error.message : String(error),
    status: 400,
  }),
}));
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/job-descriptions/dao",
  () => ({ jobDescriptionIdsExist: vi.fn() }),
);
vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/studio/utils/pptx-preview", () => ({
  createPptxPreviewPdfResponse: mocks.createPptxPreviewPdfResponse,
}));
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/review-queue",
  () => ({ enqueueResumeReviewGenerationForRecordBestEffort: vi.fn() }),
);
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-upload-batches/utils/retry",
  () => ({ retryFailedResumeParse: mocks.retryFailedResumeParse }),
);
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/dedup-service", () => ({
  findSemanticResumeDuplicates: mocks.findSemanticResumeDuplicates,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/indexer", () => ({
  runResumeSemanticIndexJob: mocks.runResumeSemanticIndexJob,
}));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/resume-semantic/duplicate-matches", () => ({
  listDuplicateMatchesForSource: mocks.listDuplicateMatchesForSource,
  replaceDuplicateMatchesForSource: mocks.replaceDuplicateMatchesForSource,
}));
vi.mock("../dao", () => ({
  createResumePoolItem: mocks.createResumePoolItem,
  deleteOwnPoolItem: mocks.deleteOwnPoolItem,
  importPoolItemToResumeLibrary: vi.fn(),
  listResumePoolUploaders: mocks.listResumePoolUploaders,
  loadResumePoolItem: mocks.loadResumePoolItem,
  markResumePoolItemParseFailed: mocks.markResumePoolItemParseFailed,
  markResumePoolItemSemanticIndexed: mocks.markResumePoolItemSemanticIndexed,
  publishPrivatePoolItem: vi.fn(),
  queryResumePoolItems: mocks.queryResumePoolItems,
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() calls for correct hoisting.
import { resumePoolRouter } from "../route";

const ORGANIZATION_ID = "org_resume_pool_route";
const USER_ID = "user_resume_pool_route";

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      c.set("activeOrg", { id: ORGANIZATION_ID } as never);
      c.set("member", { role: "member" } as never);
      c.set("user", { id: USER_ID } as never);
      await next();
    })
    .route("/resume-pool", resumePoolRouter);
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
    expect(mocks.queryResumePoolItems).toHaveBeenCalledWith({
      creatorIds: [USER_ID],
      organizationId: ORGANIZATION_ID,
      scope: "private",
    });
  });

  it("allows selecting a visible subordinate uploader", async () => {
    const response = await makeApp().request(
      "/resume-pool?scope=private&uploaderId=subordinate-user",
    );

    expect(response.status).toBe(200);
    expect(mocks.queryResumePoolItems).toHaveBeenCalledWith({
      creatorIds: ["subordinate-user"],
      organizationId: ORGANIZATION_ID,
      scope: "private",
    });
  });

  it("returns no records for an uploader outside the visibility scope", async () => {
    const response = await makeApp().request("/resume-pool?scope=private&uploaderId=other-user");

    expect(response.status).toBe(200);
    expect(mocks.queryResumePoolItems).toHaveBeenCalledWith({
      creatorIds: [],
      organizationId: ORGANIZATION_ID,
      scope: "private",
    });
  });

  it("expands all uploaders only within the visibility scope", async () => {
    const response = await makeApp().request("/resume-pool?scope=private&uploaderId=all");

    expect(response.status).toBe(200);
    expect(mocks.queryResumePoolItems).toHaveBeenCalledWith({
      creatorIds: [USER_ID, "subordinate-user"],
      organizationId: ORGANIZATION_ID,
      scope: "private",
    });
  });

  it("loads a private detail through the same recruiting visibility scope", async () => {
    mocks.loadResumePoolItem.mockResolvedValue({ id: "subordinate-item" });

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
    mocks.loadResumePoolItem.mockResolvedValue({
      id: "failed-item",
      resumeParseRetryable: true,
      resumeParseStatus: "failed",
    });

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
    mocks.loadResumePoolItem.mockResolvedValue({
      id: "failed-item",
      resumeParseRetryable: false,
      resumeParseStatus: "failed",
    });

    const response = await makeApp().request("/resume-pool/failed-item/retry-parse", {
      method: "POST",
    });

    expect(response.status).toBe(409);
    expect(mocks.retryFailedResumeParse).not.toHaveBeenCalled();
  });

  it("reads a subordinate resume file through the recruiting visibility scope", async () => {
    mocks.loadResumePoolItem.mockResolvedValue({
      resumeFileName: "subordinate.pdf",
      resumeStorageKey: "private/subordinate.pdf",
    });
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
    mocks.loadResumePoolItem.mockResolvedValue({
      resumeFileName: "subordinate.pptx",
      resumeStorageKey: "private/subordinate.pptx",
    });
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
});

describe("resume pool duplicate handling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records duplicate matches after creating a private pool item", async () => {
    const resumeProfile = {
      email: "candidate@example.com",
      name: "候选人",
      phone: "13800138000",
    };
    const matches = [{ id: "duplicate-1" }];
    mocks.storeInterviewResume.mockResolvedValue({
      cachedResumeProfile: resumeProfile,
      contentHash: "hash-1",
      resumeText: "简历原文",
      storageKey: "resume/hash-1.pdf",
    });
    mocks.findSemanticResumeDuplicates.mockResolvedValue(matches);
    mocks.createResumePoolItem.mockResolvedValue("pool-item-1");
    mocks.loadResumePoolItem.mockResolvedValue({ id: "pool-item-1" });

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
    expect(mocks.replaceDuplicateMatchesForSource).toHaveBeenCalledWith({
      matches,
      organizationId: ORGANIZATION_ID,
      sourceId: "pool-item-1",
      sourceType: "resume_pool_item",
    });
  });

  it("returns duplicate match details for an accessible pool item", async () => {
    const matches = [{ id: "duplicate-1" }];
    mocks.loadResumePoolItem.mockResolvedValue({ id: "pool-item-1" });
    mocks.listDuplicateMatchesForSource.mockResolvedValue(matches);

    const response = await makeApp().request("/resume-pool/pool-item-1/duplicate-matches");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ matches });
    expect(mocks.listDuplicateMatchesForSource).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      poolOwnerUserId: USER_ID,
      sourceId: "pool-item-1",
      sourceType: "resume_pool_item",
      visibilityScope: {
        kind: "restricted",
        userIds: [USER_ID, "subordinate-user"],
      },
    });
  });
});
