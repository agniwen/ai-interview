import { testClient } from "hono/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { createResumePoolRecommendationsRouter } from "./route";
import type { ResumePoolRecommendationsDependencies } from "./route";

const mocks = {
  loadResumePoolItem: vi.fn<ResumePoolRecommendationsDependencies["loadResumePoolItem"]>(),
  recommendJobDescriptionsForResume:
    vi.fn<ResumePoolRecommendationsDependencies["recommendJobDescriptionsForResume"]>(),
};

const dependencies: ResumePoolRecommendationsDependencies = {
  ...mocks,
  permissionMiddlewares: [
    async (_c, next) => {
      await next();
    },
    async (_c, next) => {
      await next();
    },
  ],
};

const ORGANIZATION_ID = "org_recommendations_route";
const USER_ID = "user_recommendations_route";
const POOL_ITEM_ID = "pool-item-recommendations";

const STUB_RESULT = {
  diagnostics: { aboveThresholdCount: 2, eligibleCount: 2, vectorHitCount: 3 },
  recommendations: [],
  resume: { id: POOL_ITEM_ID },
  status: "ready" as const,
};

const RESUME_PROFILE: ResumeProfile = {
  age: null,
  email: null,
  gender: null,
  name: "候选人",
  personalStrengths: [],
  phone: null,
  projectExperiences: [],
  schools: [],
  skills: ["TypeScript"],
  targetRoles: [],
  workExperiences: [],
  workYears: null,
};

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("activeOrg", { id: ORGANIZATION_ID } as never);
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      c.set("user", { id: USER_ID } as never);
      await next();
    })
    .route("/:id/recommendations", createResumePoolRecommendationsRouter(dependencies));
}

const client = testClient(makeApp());

describe("POST /:id/recommendations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recommends with default topN and passes through pool item fields", async () => {
    mocks.loadResumePoolItem.mockResolvedValue({
      id: POOL_ITEM_ID,
      jobDescriptionId: null,
      resumeProfile: RESUME_PROFILE,
    });
    mocks.recommendJobDescriptionsForResume.mockResolvedValue(STUB_RESULT);

    const response = await client[":id"].recommendations.$post({
      json: {},
      param: { id: POOL_ITEM_ID },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(STUB_RESULT);
    expect(mocks.recommendJobDescriptionsForResume).toHaveBeenCalledWith({
      organizationId: ORGANIZATION_ID,
      resume: {
        id: POOL_ITEM_ID,
        jobDescriptionId: null,
        profile: RESUME_PROFILE,
      },
      topN: 10,
    });
  });

  it("passes through an explicit topN", async () => {
    mocks.loadResumePoolItem.mockResolvedValue({
      id: POOL_ITEM_ID,
      jobDescriptionId: "jd-1",
      resumeProfile: RESUME_PROFILE,
    });
    mocks.recommendJobDescriptionsForResume.mockResolvedValue(STUB_RESULT);

    const response = await client[":id"].recommendations.$post({
      json: { topN: 5 },
      param: { id: POOL_ITEM_ID },
    });

    expect(response.status).toBe(200);
    expect(mocks.recommendJobDescriptionsForResume).toHaveBeenCalledWith(
      expect.objectContaining({ topN: 5 }),
    );
  });

  it("returns 404 and does not call the kernel when the pool item is missing", async () => {
    mocks.loadResumePoolItem.mockResolvedValue(null);

    const response = await client[":id"].recommendations.$post({
      json: {},
      param: { id: "missing-item" },
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "记录不存在。" });
    expect(mocks.recommendJobDescriptionsForResume).not.toHaveBeenCalled();
  });

  it("passes through the kernel's status unchanged", async () => {
    mocks.loadResumePoolItem.mockResolvedValue({
      id: POOL_ITEM_ID,
      jobDescriptionId: "jd-1",
      resumeProfile: null,
    });
    mocks.recommendJobDescriptionsForResume.mockResolvedValue({
      ...STUB_RESULT,
      status: "already_matched",
    });

    const response = await client[":id"].recommendations.$post({
      json: {},
      param: { id: POOL_ITEM_ID },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "already_matched" });
  });
});
