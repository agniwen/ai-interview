import { testClient } from "hono/testing";
import { beforeEach, describe, expect, it } from "vitest";
import { jobEvaluationBlueprintSchema } from "@app/db-schema/job-description-evaluation";
import type { member, organization, user } from "@app/db-schema/schema";
import { factory } from "../../../../../factory";
import { requirePermission as defaultRequirePermission } from "../../../../../middlewares/permission";
import { createJobDescriptionsRouter } from "../route";
import type { JobDescriptionsRouterDependencies } from "../route";
import type { generateStructuredJobBlueprintPreview } from "../application/default-job-evaluation-lifecycle";
import { JobEvaluationLifecycleError } from "../application/job-evaluation-lifecycle";
import { createJobEvaluationPreviewStreamRouter } from "../routes/evaluation-blueprint-preview/route";
import { BlueprintCompilationError } from "../utils/evaluation-blueprint-compiler";

const activeOrg = {
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  id: "org-1",
  logo: null,
  metadata: null,
  name: "测试公司",
  slug: "test-org",
} satisfies typeof organization.$inferSelect;

const activeUser = {
  banExpires: null,
  banReason: null,
  banned: false,
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  email: "preview@example.com",
  emailVerified: true,
  feishuTenantKey: null,
  feishuTenantName: null,
  id: "user-1",
  image: null,
  lastActiveAt: null,
  lastActiveOrganizationId: null,
  name: "测试用户",
  remark: null,
  role: "user",
  updatedAt: new Date("2026-06-01T00:00:00.000Z"),
} satisfies typeof user.$inferSelect;

const activeMember = {
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
  id: "member-1",
  inviteLinkId: null,
  organizationId: activeOrg.id,
  role: "owner",
  userId: activeUser.id,
} satisfies typeof member.$inferSelect;

const ruleDraft = {
  auxiliarySkills: [],
  coreSkills: ["React"],
  dimensionExpectations: {
    educationBackground: [],
    experienceRelevance: [],
    potential: [],
    projectMatch: [],
    skillMatch: [],
    stability: [],
  },
  educationExpectation: null,
  requiredRelevantExperience: null,
  skillRequirementGroups: [
    { expectationType: "core" as const, satisfactionMode: "all" as const, skills: ["React"] },
  ],
};

const previewResult = {
  blueprint: jobEvaluationBlueprintSchema.parse({
    auxiliarySkills: [],
    compiler: {
      generatedAt: "2026-06-01T00:00:00.000Z",
      modelId: "test-model",
      promptVersion: "test-prompt",
    },
    coreSkills: [],
    dimensionExpectations: {
      educationBackground: [],
      experienceRelevance: [],
      potential: [],
      projectMatch: [],
      skillMatch: [],
      stability: [],
    },
    educationExpectation: null,
    exclusionConditions: [],
    hardGateRequirements: [],
    priorityConditions: [],
    requiredRelevantExperience: null,
    schemaVersion: 1,
  }),
  blueprintHash: "blueprint-hash",
  generatedAt: "2026-06-01T00:00:00.000Z",
  inputHash: "input-hash",
} satisfies Awaited<ReturnType<typeof generateStructuredJobBlueprintPreview>>;

let plannedError: Error | null = null;

const generatePreview: typeof generateStructuredJobBlueprintPreview = async (_input, options) => {
  if (plannedError) {
    throw plannedError;
  }
  await options?.onProgress?.(ruleDraft);
  return previewResult;
};

const allowPermission: typeof defaultRequirePermission = (resource, action) =>
  defaultRequirePermission(resource, action, {
    createRequestWorkspaceAuthorizer: () => () => Promise.resolve(true),
  });

const dependencies: JobDescriptionsRouterDependencies = {
  deleteJobDescriptionSemanticIndexBestEffort: () => Promise.resolve(),
  enqueueJobDescriptionIndexJobBestEffort: () => Promise.resolve(),
  generateStructuredJobBlueprintPreview: generatePreview,
  jobEvaluationPreviewStreamRouter: createJobEvaluationPreviewStreamRouter({
    generateStructuredJobBlueprintPreview: generatePreview,
    requirePermission: allowPermission,
    safeUpdateTag: () => {},
  }),
  requirePermission: allowPermission,
};

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      c.set("activeOrg", activeOrg);
      c.set("member", activeMember);
      c.set("user", activeUser);
      await next();
    })
    .route("/job-descriptions", createJobDescriptionsRouter(dependencies));
}

const client = testClient(makeApp());

describe("job evaluation blueprint preview errors", () => {
  beforeEach(() => {
    plannedError = null;
  });

  it("returns an actionable 422 response for compilation errors", async () => {
    plannedError = new BlueprintCompilationError(
      "JOB_BLUEPRINT_EXPERIENCE_CONFLICT",
      "岗位包含不兼容的经验要求。",
    );

    const response = await client["job-descriptions"][":id"]["evaluation-blueprint-preview"].$post({
      param: { id: "job-1" },
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      code: "JOB_BLUEPRINT_EXPERIENCE_CONFLICT",
      error: "岗位包含不兼容的经验要求。",
    });
  });

  it("returns an actionable 503 response when blueprint generation is unavailable", async () => {
    plannedError = new JobEvaluationLifecycleError(
      "JOB_BLUEPRINT_GENERATION_FAILED",
      "AI 评估蓝图生成暂时不可用，请稍后重试。",
    );

    const response = await client["job-descriptions"][":id"]["evaluation-blueprint-preview"].$post({
      param: { id: "job-1" },
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      code: "JOB_BLUEPRINT_GENERATION_FAILED",
      error: "AI 评估蓝图生成暂时不可用，请稍后重试。",
    });
  });

  it("streams partial rules before the completed preview", async () => {
    const response = await client["job-descriptions"][":id"][
      "evaluation-blueprint-preview-stream"
    ].$post({ param: { id: "job-1" } });
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body.indexOf('"type":"preview.partial"')).toBeLessThan(
      body.indexOf('"type":"preview.completed"'),
    );
    expect(body).toContain('"coreSkills":["React"]');
    expect(body).toContain('"blueprintHash":"blueprint-hash"');
  });
});
