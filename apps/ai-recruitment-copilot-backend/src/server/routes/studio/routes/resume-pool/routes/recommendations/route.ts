import { zValidator } from "@hono/zod-validator";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import { loadResumePoolItem } from "../../dao";
import { recommendJobDescriptionsForResume } from "../../utils/jd-recommendations";
import { jdRecommendationBodySchema } from "./schema";

export const resumePoolRecommendationsRouter = factory
  .createApp()
  .post(
    "/",
    requirePermission("resumePool", "read"),
    requirePermission("jd", "read"),
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
      const item = await loadResumePoolItem({
        organizationId: activeOrg.id,
        poolItemId,
        userId: user.id,
      });
      if (!item) {
        return c.json({ error: "记录不存在。" }, 404);
      }
      const { topN } = c.req.valid("json");
      const result = await recommendJobDescriptionsForResume({
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
