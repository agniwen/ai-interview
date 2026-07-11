import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { resumePoolImportInputSchema } from "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resume-pool/schema";

const mocks = vi.hoisted(() => ({
  createResumePoolItem: vi.fn(),
  findSemanticResumeDuplicates: vi.fn(),
  listDuplicateMatchesForSource: vi.fn(),
  loadResumePoolItem: vi.fn(),
  markResumePoolItemParseFailed: vi.fn(),
  markResumePoolItemSemanticIndexed: vi.fn(),
  replaceDuplicateMatchesForSource: vi.fn(),
  runResumeSemanticIndexJob: vi.fn(),
  storeInterviewResume: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({ db: {} }));
vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/s3", () => ({
  getObjectBytes: vi.fn(),
  getObjectStream: vi.fn(),
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/agents/resume-analysis-agent", () => ({
  parseResumeFastToProfile: vi.fn(),
  validateResumeFile: vi.fn(),
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/middlewares/permission", () => ({
  requirePermission: () => (_c: unknown, next: () => Promise<void>) => next(),
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
  createPptxPreviewPdfResponse: vi.fn(),
}));
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/studio/routes/resumes/utils/review-queue",
  () => ({ enqueueResumeReviewGenerationForRecordBestEffort: vi.fn() }),
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
  deleteOwnPoolItem: vi.fn(),
  importPoolItemToResumeLibrary: vi.fn(),
  loadResumePoolItem: mocks.loadResumePoolItem,
  markResumePoolItemParseFailed: mocks.markResumePoolItemParseFailed,
  markResumePoolItemSemanticIndexed: mocks.markResumePoolItemSemanticIndexed,
  publishPrivatePoolItem: vi.fn(),
  queryResumePoolItems: vi.fn(),
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
      c.set("user", { id: USER_ID } as never);
      await next();
    })
    .route("/resume-pool", resumePoolRouter);
}

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
    });
  });
});
