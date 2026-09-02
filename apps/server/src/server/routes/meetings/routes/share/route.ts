import { zValidator } from "@hono/zod-validator";
import { updateMeetingShareSchema } from "@app/shared/meeting-recording";
import { factory, jsonValidatorError } from "../../../../factory";
import { getMeetingShareSettings, updateMeetingShare } from "../../collaboration-service";
import { meetingShareOwnerRouter } from "./routes/owner/route";

export const meetingShareRouter = factory
  .createApp()
  .get("/", async (c) => {
    const { activeOrg, member, user } = c.var;
    if (!(activeOrg && member && user)) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const meetingId = c.req.param("id");
    if (!meetingId) {
      return c.json({ error: "Meeting Session 不存在" }, 404);
    }
    const result = await getMeetingShareSettings({
      meetingId,
      memberRole: member.role,
      organizationId: activeOrg.id,
      userId: user.id,
    });
    if (result === null) {
      return c.json({ error: "Meeting Session 不存在" }, 404);
    }
    return result === "forbidden"
      ? c.json({ error: "无权管理会议分享" }, 403)
      : c.json(result, 200);
  })
  .put(
    "/",
    zValidator("json", updateMeetingShareSchema, jsonValidatorError("会议分享设置无效")),
    async (c) => {
      const { activeOrg, member, user } = c.var;
      if (!(activeOrg && member && user)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const meetingId = c.req.param("id");
      if (!meetingId) {
        return c.json({ error: "Meeting Session 不存在" }, 404);
      }
      const result = await updateMeetingShare({
        meetingId,
        memberRole: member.role,
        organizationId: activeOrg.id,
        share: c.req.valid("json"),
        userId: user.id,
      });
      if (result === null) {
        return c.json({ error: "Meeting Session 不存在" }, 404);
      }
      if (result === "forbidden") {
        return c.json({ error: "无权管理会议分享" }, 403);
      }
      return result === "invalid-members"
        ? c.json({ error: "分享成员必须属于当前 Workspace" }, 400)
        : c.json({ updated: true }, 200);
    },
  )
  .route("/owner", meetingShareOwnerRouter);
