import type { MiddlewareHandler } from "hono";
import { zValidator } from "@hono/zod-validator";
import type { ResumeProfile } from "@arc/db-schema/interview/types";
import type { JobDescriptionRecommendationResult } from "@arc/shared/job-descriptions";
import { factory, jsonValidatorError } from "../../../../../../factory";
import { requirePermission } from "../../../../../../middlewares/permission";
import { loadResumePoolItem } from "../../dao";
import { recommendJobDescriptionsForResume } from "../../utils/jd-recommendations";
import { jdRecommendationBodySchema } from "./schema";

interface ResumePoolRecommendationItem {
  id: string;
  jobDescriptionId: string | null;
  resumeProfile: ResumeProfile | null;
}

export interface ResumePoolRecommendationsDependencies {
  loadResumePoolItem: (
    input: Parameters<typeof loadResumePoolItem>[0],
  ) => Promise<ResumePoolRecommendationItem | null>;
  permissionMiddlewares: [MiddlewareHandler, MiddlewareHandler];
  recommendJobDescriptionsForResume: (
    input: Parameters<typeof recommendJobDescriptionsForResume>[0],
  ) => Promise<JobDescriptionRecommendationResult>;
}

const defaultDependencies: ResumePoolRecommendationsDependencies = {
  loadResumePoolItem,
  permissionMiddlewares: [requirePermission("resumePool", "read"), requirePermission("jd", "read")],
  recommendJobDescriptionsForResume,
};

export function createResumePoolRecommendationsRouter(
  dependencies: ResumePoolRecommendationsDependencies = defaultDependencies,
) {
  return factory
    .createApp()
    .post(
      "/",
      ...dependencies.permissionMiddlewares,
      zValidator("json", jdRecommendationBodySchema, jsonValidatorError("请求参数无效。")),
      async (c) => {
        const { activeOrg, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const poolItemId = c.req.param("id");
        if (!poolItemId) {
          return c.json({ error: "记录不存在。" }, 404);
        }
        const item = await dependencies.loadResumePoolItem({
          organizationId: activeOrg.id,
          poolItemId,
          userId: user.id,
        });
        if (!item) {
          return c.json({ error: "记录不存在。" }, 404);
        }
        const { topN } = c.req.valid("json");
        const result = await dependencies.recommendJobDescriptionsForResume({
          organizationId: activeOrg.id,
          resume: {
            id: item.id,
            jobDescriptionId: item.jobDescriptionId,
            profile: item.resumeProfile ?? null,
          },
          topN: topN ?? 10,
        });
        return c.json(result, 200);
      },
    );
}

export const resumePoolRecommendationsRouter = createResumePoolRecommendationsRouter();
