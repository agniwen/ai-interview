import { resolveRecruitingVisibilityScope } from "@arc/ai-recruitment-copilot-backend/server/access/recruiting-visibility";
import { getWorkspaceRequestContext } from "@arc/ai-recruitment-copilot-backend/server/context/workspace-request-context";
import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { requirePermission } from "@arc/ai-recruitment-copilot-backend/server/middlewares/permission";
import { listSavedMeetings } from "@arc/ai-recruitment-copilot-backend/server/routes/meetings/service";
import { loadResumeDetail } from "../../dao/resumes";

export const recruitingRecordMeetingsRouter = factory
  .createApp()
  .get("/", requirePermission("resumeLibrary", "read"), async (c) => {
    const { member, organization, user } = getWorkspaceRequestContext(c);
    const recruitingRecordId = c.req.param("id");
    if (!recruitingRecordId) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const visibilityScope = await resolveRecruitingVisibilityScope({
      currentRole: member.role,
      organizationId: organization.id,
      userId: user.id,
    });
    const record = await loadResumeDetail(recruitingRecordId, organization.id, visibilityScope);
    if (!record) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const records = await listSavedMeetings({
      memberRole: member.role,
      organizationId: organization.id,
      recruitingRecordId,
      userId: user.id,
    });
    return c.json({ records }, 200);
  });
