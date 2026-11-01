import { factory } from "../../../../factory";
import { restoreSavedMeeting } from "../../lifecycle-service";

export function createMeetingRestoreRouter(
  restoreMeeting: typeof restoreSavedMeeting = restoreSavedMeeting,
) {
  return factory.createApp().post("/", async (c) => {
    const { activeOrg, user } = c.var;
    if (!(activeOrg && user)) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const meetingId = c.req.param("id");
    if (!meetingId) {
      return c.json({ error: "Meeting Session 不存在" }, 404);
    }
    const result = await restoreMeeting({
      actorId: user.id,
      meetingId,
      organizationId: activeOrg.id,
    });
    if (result.state === "not-found") {
      return c.json({ error: "Meeting Session 不存在" }, 404);
    }
    if (result.state === "forbidden") {
      return c.json({ error: "只有 Meeting Owner 或 Workspace 管理员可以恢复会议" }, 403);
    }
    if (result.state === "expired") {
      return c.json({ error: "Meeting Session 已超过七天恢复期限" }, 409);
    }
    if (result.state === "capacity") {
      return c.json(
        {
          code: "meeting-upload-capacity-exhausted",
          error: "录音上传容量已满，Meeting Session 仍保留在归档记录中",
        },
        429,
      );
    }
    return c.json(result, 200);
  });
}

export const meetingRestoreRouter = createMeetingRestoreRouter();
