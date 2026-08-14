import { factory } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { trashSavedMeeting } from "../../lifecycle-service";

export const meetingTrashActionRouter = factory.createApp().post("/", async (c) => {
  const { activeOrg, user } = c.var;
  if (!(activeOrg && user)) {
    return c.json({ message: "Unauthorized" }, 401);
  }
  const meetingId = c.req.param("id");
  if (!meetingId) {
    return c.json({ error: "Meeting Session 不存在" }, 404);
  }
  const result = await trashSavedMeeting({
    actorId: user.id,
    meetingId,
    organizationId: activeOrg.id,
  });
  if (result.state === "not-found") {
    return c.json({ error: "Meeting Session 不存在" }, 404);
  }
  if (result.state === "forbidden") {
    return c.json({ error: "只有 Meeting Owner 或 Workspace 管理员可以归档" }, 403);
  }
  if (result.state === "purging") {
    return c.json({ error: "Meeting Session 正在永久清除" }, 409);
  }
  return c.json(result, 200);
});
