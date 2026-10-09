import { z } from "zod";
import { factory } from "../../../../../../factory";
import { resolveRecruitingVisibilityScope } from "../../../../../../access/recruiting-visibility";
import { requirePermission } from "../../../../../../middlewares/permission";
import { loadHumanInterviewMeetingDetail } from "./dao";

const defaultDependencies = {
  load: loadHumanInterviewMeetingDetail,
  requireInterviewRead: requirePermission("humanInterview", "read"),
  requireResumeRead: requirePermission("resumeLibrary", "read"),
  visibility: resolveRecruitingVisibilityScope,
};

export function createHumanInterviewMeetingDetailRouter(
  overrides: Partial<typeof defaultDependencies> = {},
) {
  const dependencies = { ...defaultDependencies, ...overrides };
  return factory
    .createApp()
    .use("*", dependencies.requireResumeRead, dependencies.requireInterviewRead)
    .get("/:meetingId", async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg || !user) {
        return c.json({ error: "请先登录后查看会议详情。" }, 401);
      }
      const parsed = z
        .object({ id: z.uuid(), meetingId: z.uuid(), roundId: z.uuid() })
        .safeParse(c.req.param());
      if (!parsed.success) {
        return c.json({ error: "会议不存在或无权查看。" }, 404);
      }
      const visibility = await dependencies.visibility({
        currentRole: c.var.member?.role,
        organizationId: activeOrg.id,
        userId: user.id,
      });
      const detail = await dependencies.load({
        candidateId: parsed.data.id,
        meetingId: parsed.data.meetingId,
        organizationId: activeOrg.id,
        roundId: parsed.data.roundId,
        visibility,
      });
      if (!detail) {
        return c.json({ error: "会议尚未结束、不存在或无权查看。" }, 404);
      }
      c.header("Cache-Control", "no-store");
      return c.json(detail, 200);
    });
}

export const humanInterviewMeetingDetailRouter = createHumanInterviewMeetingDetailRouter();
