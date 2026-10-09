import { zValidator } from "@hono/zod-validator";
import { reassignMeetingOwnerSchema } from "@app/shared/meeting-recording";
import { factory, jsonValidatorError } from "../../../../../../factory";
import { reassignSavedMeetingOwner } from "../../../../collaboration-service";

export const meetingShareOwnerRouter = factory
  .createApp()
  .post(
    "/",
    zValidator("json", reassignMeetingOwnerSchema, jsonValidatorError("新 Owner 无效")),
    async (c) => {
      const { activeOrg, member, user } = c.var;
      if (!(activeOrg && member && user)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const meetingId = c.req.param("id");
      if (!meetingId) {
        return c.json({ error: "Meeting Session 不存在" }, 404);
      }
      const result = await reassignSavedMeetingOwner({
        meetingId,
        memberRole: member.role,
        organizationId: activeOrg.id,
        targetUserId: c.req.valid("json").userId,
        userId: user.id,
      });
      if (result === null) {
        return c.json({ error: "Meeting Session 不存在" }, 404);
      }
      if (result === "forbidden") {
        return c.json({ error: "只有 Workspace Administrator 可以重新分配会议" }, 403);
      }
      if (result === "not-custodied") {
        return c.json({ error: "当前会议仍由 Workspace 成员持有，不能重新分配" }, 409);
      }
      return result === "invalid-member"
        ? c.json({ error: "新 Owner 必须属于当前 Workspace" }, 400)
        : c.json({ updated: true }, 200);
    },
  );
