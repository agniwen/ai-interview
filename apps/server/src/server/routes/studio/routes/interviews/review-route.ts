import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { factory } from "../../../../factory";
import { requirePermission } from "../../../../middlewares/permission";
import { resolveRecruitingVisibilityScope } from "../../../../access/recruiting-visibility";
import { loadStudioHumanInterviewReviewScope } from "./dao/human-interview-review-access";
import { createHumanInterviewReviewActionsRouter } from "./review-actions-route";

const defaultDependencies = {
  load: loadStudioHumanInterviewReviewScope,
  visibility: resolveRecruitingVisibilityScope,
};

export function createStudioHumanInterviewReviewRouter(dependencies = defaultDependencies) {
  return factory
    .createApp()
    .use(
      "*",
      requirePermission("resumeLibrary", "read"),
      requirePermission("humanInterview", "read"),
    )
    .use("*", (c, next) => {
      if (c.req.method !== "GET") {
        return requirePermission("humanInterview", "update")(c, next);
      }
      return next();
    })
    .route(
      "/",
      createHumanInterviewReviewActionsRouter(async (c) => {
        const { activeOrg, user } = c.var;
        if (!activeOrg || !user) {
          throw new HTTPException(401, {
            res: Response.json({ error: "请先登录后评价。" }, { status: 401 }),
          });
        }
        const candidateId = z.uuid().safeParse(c.req.param("id"));
        const roundId = z.uuid().safeParse(c.req.param("inviteToken"));
        if (!candidateId.success || !roundId.success) {
          return null;
        }
        const visibility = await dependencies.visibility({
          currentRole: c.var.member?.role,
          organizationId: activeOrg.id,
          userId: user.id,
        });
        const scope = await dependencies.load({
          candidateId: candidateId.data,
          organizationId: activeOrg.id,
          roundId: roundId.data,
          userId: user.id,
          visibility,
        });
        if (!scope) {
          return null;
        }
        if (
          scope.role === "observer" ||
          (c.req.method !== "GET" && scope.pipelineStage === "closed")
        ) {
          throw new HTTPException(403, {
            res: Response.json(
              { error: "当前账号或候选人状态不允许修改本轮评价。" },
              { status: 403 },
            ),
          });
        }
        return scope;
      }),
    );
}

export const studioHumanInterviewReviewRouter = createStudioHumanInterviewReviewRouter();
