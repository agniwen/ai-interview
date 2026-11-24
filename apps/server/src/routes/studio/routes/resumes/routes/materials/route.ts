import { resolveRecruitingVisibilityScope } from "@app/resume-processing/review/support/access-recruiting-visibility";
import { loadResumeDetail } from "../../dao/resumes";
import { createCandidateMaterialsRouter } from "../../../../utils/candidate-materials-router";

export const resumeMaterialsRouter = createCandidateMaterialsRouter({
  ownerType: "recruiting_record",
  readPermission: ["resumeLibrary", "read"],
  resolveOwnerAccess: async ({ memberRole, organizationId, ownerId, userId }) => {
    const visibilityScope = await resolveRecruitingVisibilityScope({
      currentRole: memberRole,
      organizationId,
      userId,
    });
    const detail = await loadResumeDetail(ownerId, organizationId, visibilityScope);
    return Boolean(detail);
  },
  writePermission: ["resumeLibrary", "update"],
});
