import type { MiddlewareHandler } from "hono";
import { zValidator } from "@hono/zod-validator";
import { applyResumeProfileEdit, resumeProfileEditSchema } from "@app/shared/resume-profile-edit";
import { z } from "zod";
import {
  loadResumePoolItem,
  updateOwnPoolItemProfile,
} from "@app/resume-processing/review/support/resume-pool-dao";
import { enqueueResumePoolReviewGenerationBestEffort } from "@app/resume-processing/review/resumes/utils/review-queue";
import { enqueueResumeSemanticIndexJobBestEffort } from "../../../../../../infrastructure/resume-semantic/enqueue";
import { factory, jsonValidatorError } from "../../../../../../factory";
import { requirePermission } from "../../../../../../middlewares/permission";

export const resumePoolProfileUpdateSchema = z.object({
  resumeProfile: resumeProfileEditSchema,
});

export interface ResumePoolProfileDependencies {
  enqueueResumePoolReviewGenerationBestEffort: typeof enqueueResumePoolReviewGenerationBestEffort;
  enqueueResumeSemanticIndexJobBestEffort: typeof enqueueResumeSemanticIndexJobBestEffort;
  loadResumePoolItem: typeof loadResumePoolItem;
  // 上传者才能修正；沿用上传权限而非新增权限位。Uploader-only, gated by the upload permission.
  permissionMiddleware: MiddlewareHandler;
  updateOwnPoolItemProfile: typeof updateOwnPoolItemProfile;
}

const defaultDependencies: ResumePoolProfileDependencies = {
  enqueueResumePoolReviewGenerationBestEffort,
  enqueueResumeSemanticIndexJobBestEffort,
  loadResumePoolItem,
  permissionMiddleware: requirePermission("resumePool", "create"),
  updateOwnPoolItemProfile,
};

// 人才库简历画像的人工修正：仅上传者、仅解析完成后；保存后重新生成岗位评价与语义索引。
// Manual Resume Profile correction for a pool item: uploader-only after parsing; regenerates
// the job evaluation and semantic index from the corrected facts.
export function createResumePoolProfileRouter(
  dependencies: ResumePoolProfileDependencies = defaultDependencies,
) {
  return factory
    .createApp()
    .patch(
      "/",
      dependencies.permissionMiddleware,
      zValidator("json", resumePoolProfileUpdateSchema, jsonValidatorError("请求参数无效。")),
      async (c) => {
        const { activeOrg, user } = c.var;
        if (!activeOrg || !user) {
          return c.json({ message: "Unauthorized" }, 401);
        }
        const poolItemId = c.req.param("id") ?? "";
        const existing = await dependencies.loadResumePoolItem({
          organizationId: activeOrg.id,
          poolItemId,
          userId: user.id,
        });
        if (!existing || existing.createdBy !== user.id) {
          return c.json({ error: "简历不存在或无权编辑。" }, 404);
        }
        if (existing.resumeParseStatus !== "ready" || !existing.resumeProfile) {
          return c.json({ error: "简历解析完成后才能编辑。" }, 409);
        }
        const { resumeProfile: edit } = c.req.valid("json");
        const updated = await dependencies.updateOwnPoolItemProfile({
          organizationId: activeOrg.id,
          poolItemId,
          resumeProfile: applyResumeProfileEdit(existing.resumeProfile, edit),
          userId: user.id,
        });
        if (!updated) {
          return c.json({ error: "简历不存在或无权编辑。" }, 404);
        }
        if (updated.jobDescriptionId) {
          await dependencies.enqueueResumePoolReviewGenerationBestEffort({
            jobDescriptionId: updated.jobDescriptionId,
            organizationId: activeOrg.id,
            poolItemId,
          });
        }
        await dependencies.enqueueResumeSemanticIndexJobBestEffort({
          organizationId: activeOrg.id,
          sourceId: poolItemId,
          sourceType: "resume_pool_item",
        });
        const detail = await dependencies.loadResumePoolItem({
          organizationId: activeOrg.id,
          poolItemId,
          userId: user.id,
        });
        if (!detail) {
          return c.json({ error: "更新后的简历读取失败。" }, 500);
        }
        return c.json(detail, 200);
      },
    );
}

export const resumePoolProfileRouter = createResumePoolProfileRouter();
