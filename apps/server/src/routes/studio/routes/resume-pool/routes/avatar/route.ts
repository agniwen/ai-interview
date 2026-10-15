import type { MiddlewareHandler } from "hono";
import { openCandidateAvatarObject } from "@app/resume-processing/review/support/candidate-avatars-dao";
import { resolveRecruitingVisibilityScope } from "@app/resume-processing/review/support/access-recruiting-visibility";
import { loadVisibleResumePoolContentHash } from "@app/resume-processing/review/support/resume-pool-dao";
import { factory } from "../../../../../../factory";
import { requirePermission } from "../../../../../../middlewares/permission";

export interface ResumePoolAvatarDependencies {
  loadVisibleResumePoolContentHash: typeof loadVisibleResumePoolContentHash;
  openCandidateAvatarObject: typeof openCandidateAvatarObject;
  permissionMiddleware: MiddlewareHandler;
  resolveRecruitingVisibilityScope: typeof resolveRecruitingVisibilityScope;
}

const defaultDependencies: ResumePoolAvatarDependencies = {
  loadVisibleResumePoolContentHash,
  openCandidateAvatarObject,
  permissionMiddleware: requirePermission("resumePool", "read"),
  resolveRecruitingVisibilityScope,
};

// 人才库记录的候选人头像（简历首页识别结果），可见范围与人才库详情一致。
// Candidate headshot for a resume-pool record, with the same visibility rules as its detail.
export function createResumePoolAvatarRouter(
  dependencies: ResumePoolAvatarDependencies = defaultDependencies,
) {
  return factory.createApp().get("/", dependencies.permissionMiddleware, async (c) => {
    const { activeOrg, user } = c.var;
    if (!activeOrg || !user) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const visibilityScope = await dependencies.resolveRecruitingVisibilityScope({
      currentRole: c.var.member?.role,
      organizationId: activeOrg.id,
      userId: user.id,
    });
    const contentHash = await dependencies.loadVisibleResumePoolContentHash({
      organizationId: activeOrg.id,
      poolItemId: c.req.param("id") ?? "",
      visibilityScope,
    });
    const object = await dependencies.openCandidateAvatarObject(contentHash);
    if (!object) {
      return c.json({ error: "候选人头像不存在。" }, 404);
    }
    return new Response(object.body, {
      headers: {
        "Cache-Control": "private, max-age=86400",
        "Content-Type": object.contentType ?? "image/jpeg",
        ...(object.contentLength !== undefined && {
          "Content-Length": String(object.contentLength),
        }),
      },
    });
  });
}

export const resumePoolAvatarRouter = createResumePoolAvatarRouter();
