import { resolveRecruitingVisibilityScope } from "@app/resume-processing/review/support/access-recruiting-visibility";
import { loadResumePoolItem } from "@app/resume-processing/review/support/resume-pool-dao";
import { createCandidateMaterialsRouter } from "../../../../utils/candidate-materials-router";

export const resumePoolMaterialsRouter = createCandidateMaterialsRouter({
  ownerType: "resume_pool_item",
  readPermission: ["resumePool", "read"],
  resolveOwnerAccess: async ({ memberRole, organizationId, ownerId, userId }) => {
    const visibilityScope = await resolveRecruitingVisibilityScope({
      currentRole: memberRole,
      organizationId,
      userId,
    });
    const item = await loadResumePoolItem({
      organizationId,
      poolItemId: ownerId,
      visibilityScope,
    });
    return Boolean(item);
  },
  writePermission: ["resumePool", "create"],
});
