import { testClient } from "hono/testing";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import type * as JobEvaluationLifecycle from "../application/job-evaluation-lifecycle";

const mocks = vi.hoisted(() => ({
  generateStructuredJobBlueprintPreview: vi.fn(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/server/middlewares/permission", () => ({
  requirePermission: () => (_c: unknown, next: () => Promise<void>) => next(),
}));

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/db", () => ({ db: {} }));

vi.mock("../application/job-evaluation-lifecycle", async (importOriginal) => {
  const actual = await importOriginal<typeof JobEvaluationLifecycle>();
  return {
    ...actual,
    generateStructuredJobBlueprintPreview: mocks.generateStructuredJobBlueprintPreview,
  };
});

// oxlint-disable-next-line import/first -- route must load after the hoisted dependency mocks.
import { BlueprintCompilationError } from "../utils/evaluation-blueprint-compiler";
// oxlint-disable-next-line import/first -- route must load after the hoisted dependency mocks.
import { JobEvaluationLifecycleError } from "../application/job-evaluation-lifecycle";
// oxlint-disable-next-line import/first -- route must load after the hoisted dependency mocks.
import { jobDescriptionsRouter } from "../route";

function makeApp() {
  return factory
    .createApp()
    .use("*", async (c, next) => {
      c.set("activeOrg", { id: "org-1" } as never);
      c.set("user", { id: "user-1" } as never);
      await next();
    })
    .route("/job-descriptions", jobDescriptionsRouter);
}

const client = testClient(makeApp());

describe("job evaluation blueprint preview errors", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an actionable 422 response for compilation errors", async () => {
    mocks.generateStructuredJobBlueprintPreview.mockRejectedValue(
      new BlueprintCompilationError(
        "JOB_BLUEPRINT_EXPERIENCE_CONFLICT",
        "岗位包含不兼容的经验要求。",
      ),
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
    mocks.generateStructuredJobBlueprintPreview.mockRejectedValue(
      new JobEvaluationLifecycleError(
        "JOB_BLUEPRINT_GENERATION_FAILED",
        "AI 评估蓝图生成暂时不可用，请稍后重试。",
      ),
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
});
