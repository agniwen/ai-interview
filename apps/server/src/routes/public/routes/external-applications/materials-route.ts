import { CandidateMaterialError } from "@app/recruiting/candidate-materials";
import { z } from "zod";
import { createScopedCandidateMaterialsRouter } from "../../../studio/utils/candidate-materials-router";
import { resolveExternalApplicationSubmission } from "./dao";
import { scheduleExternalApplicationFeishuSync } from "./feishu-sync";

const requestIdSchema = z.uuid();

export const externalApplicationMaterialsRouter = createScopedCandidateMaterialsRouter({
  onMaterialCreated: (scope) => scheduleExternalApplicationFeishuSync(scope.ownerId),
  resolveScope: async (c) => {
    const token = c.req.param("token");
    const parsedRequestId = requestIdSchema.safeParse(c.req.param("requestId"));
    if (!token || !parsedRequestId.success) {
      throw new CandidateMaterialError("投递记录不存在或链接不可用", 404);
    }
    const submission = await resolveExternalApplicationSubmission(token, parsedRequestId.data);
    if (!submission) {
      throw new CandidateMaterialError("投递记录不存在或链接不可用", 404);
    }
    return {
      actorId: submission.actorId,
      scope: {
        organizationId: submission.organizationId,
        ownerId: submission.poolItemId,
        ownerType: "resume_pool_item",
      },
    };
  },
});
