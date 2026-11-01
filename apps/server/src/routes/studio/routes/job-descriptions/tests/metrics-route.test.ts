import { testClient } from "hono/testing";
import { describe, expect, it, vi } from "vitest";
import { factory } from "../../../../../factory";
import { createJobEvaluationPreviewStreamRouter } from "../routes/evaluation-blueprint-preview/route";
import { createJobDescriptionsRouter } from "../route";
import type { JobDescriptionsRouterDependencies } from "../route";

describe("job description metrics route", () => {
  it("returns workspace-scoped metrics behind JD read permission", async () => {
    const loadJobDescriptionMetrics = vi.fn().mockResolvedValue({
      candidatesByJd: [],
      completionByJd: [],
      loadByInterviewer: [],
    });
    const permissionChecks: [string, string][] = [];
    const dependencies: JobDescriptionsRouterDependencies = {
      deleteJobDescriptionSemanticIndexBestEffort: () => Promise.resolve(),
      enqueueJobDescriptionIndexJobBestEffort: () => Promise.resolve(),
      generateStructuredJobBlueprintPreview: vi.fn(),
      jobEvaluationPreviewStreamRouter: createJobEvaluationPreviewStreamRouter(),
      loadJobDescriptionMetrics,
      requirePermission: (resource, action) => (_c, next) => {
        permissionChecks.push([resource, action]);
        return next();
      },
    };
    const app = factory
      .createApp()
      .use("*", async (c, next) => {
        // SAFETY: This route only reads activeOrg.id; the focused fixture supplies that invariant.
        c.set("activeOrg", { id: "org-1" } as never);
        await next();
      })
      .route("/job-descriptions", createJobDescriptionsRouter(dependencies));
    const client = testClient(app);

    const response = await client["job-descriptions"].metrics.$get();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      candidatesByJd: [],
      completionByJd: [],
      loadByInterviewer: [],
    });
    expect(loadJobDescriptionMetrics).toHaveBeenCalledWith("org-1");
    expect(permissionChecks).toEqual([["jd", "read"]]);
  });
});
