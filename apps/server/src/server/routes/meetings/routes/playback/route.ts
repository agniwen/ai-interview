import { factory } from "../../../../factory";
import { createMeetingPlaybackAuthorization, retryMeetingPlayback } from "../../service";

export const meetingPlaybackRouter = factory
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
    const result = await createMeetingPlaybackAuthorization({
      meetingId,
      memberRole: member.role,
      organizationId: activeOrg.id,
      userId: user.id,
    });
    if (!result) {
      return c.json({ error: "Meeting Session 不存在" }, 404);
    }
    return c.json(result, 200);
  })
  .post("/retry", async (c) => {
    const { activeOrg, member, user } = c.var;
    if (!(activeOrg && member && user)) {
      return c.json({ message: "Unauthorized" }, 401);
    }
    const meetingId = c.req.param("id");
    if (!meetingId) {
      return c.json({ error: "Meeting Session 不存在" }, 404);
    }
    const result = await retryMeetingPlayback({
      meetingId,
      memberRole: member.role,
      organizationId: activeOrg.id,
      userId: user.id,
    });
    if (!result) {
      return c.json({ error: "Meeting Session 不存在" }, 404);
    }
    if (result === "forbidden") {
      return c.json({ error: "无权重试会议处理" }, 403);
    }
    if (result.state === "unavailable") {
      return c.json({ error: "会议处理队列暂不可用" }, 503);
    }
    return c.json(result, result.state === "processing" ? 202 : 200);
  });
