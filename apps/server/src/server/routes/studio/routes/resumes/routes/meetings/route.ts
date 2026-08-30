import type { MiddlewareHandler } from "hono";
import { resolveRecruitingVisibilityScope } from "@app/server/server/access/recruiting-visibility";
import { getWorkspaceRequestContext } from "@app/server/server/context/workspace-request-context";
import { factory } from "@app/server/server/factory";
import { requirePermission } from "@app/server/server/middlewares/permission";
import { listSavedMeetings } from "@app/server/server/routes/meetings/service";
import { loadResumeDetail } from "../../dao/resumes";

export interface RecruitingRecordMeetingsDependencies {
  listSavedMeetings: typeof listSavedMeetings;
  loadResumeDetail: (
    ...input: Parameters<typeof loadResumeDetail>
  ) => Promise<{ id: string } | null>;
  permissionMiddleware: MiddlewareHandler;
  resolveRecruitingVisibilityScope: typeof resolveRecruitingVisibilityScope;
}

const defaultDependencies: RecruitingRecordMeetingsDependencies = {
  listSavedMeetings,
  loadResumeDetail,
  permissionMiddleware: requirePermission("resumeLibrary", "read"),
  resolveRecruitingVisibilityScope,
};

export function createRecruitingRecordMeetingsRouter(
  dependencies: RecruitingRecordMeetingsDependencies = defaultDependencies,
) {
  return factory.createApp().get("/", dependencies.permissionMiddleware, async (c) => {
    const { member, organization, user } = getWorkspaceRequestContext(c);
    const recruitingRecordId = c.req.param("id");
    if (!recruitingRecordId) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const visibilityScope = await dependencies.resolveRecruitingVisibilityScope({
      currentRole: member.role,
      organizationId: organization.id,
      userId: user.id,
    });
    const record = await dependencies.loadResumeDetail(
      recruitingRecordId,
      organization.id,
      visibilityScope,
    );
    if (!record) {
      return c.json({ error: "记录不存在。" }, 404);
    }
    const records = await dependencies.listSavedMeetings({
      memberRole: member.role,
      organizationId: organization.id,
      recruitingRecordId,
      userId: user.id,
    });
    return c.json({ records }, 200);
  });
}

export const recruitingRecordMeetingsRouter = createRecruitingRecordMeetingsRouter();
