import { zValidator } from "@hono/zod-validator";
import { factory, jsonValidatorError } from "@app/server/server/factory";
import { requestMeetingIntelligenceSchema } from "@arc/shared/meeting-intelligence";
import {
  getSavedMeetingIntelligence,
  regenerateSavedMeetingIntelligence,
} from "../../intelligence/service";

export const meetingIntelligenceRouter = factory
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
    const result = await getSavedMeetingIntelligence({
      meetingId,
      memberRole: member.role,
      organizationId: activeOrg.id,
      userId: user.id,
    });
    return result ? c.json(result, 200) : c.json({ error: "Meeting Session 不存在" }, 404);
  })
  .post(
    "/",
    zValidator(
      "json",
      requestMeetingIntelligenceSchema,
      jsonValidatorError("Meeting Intelligence 请求无效"),
    ),
    async (c) => {
      const { activeOrg, member, user } = c.var;
      if (!(activeOrg && member && user)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const meetingId = c.req.param("id");
      if (!meetingId) {
        return c.json({ error: "Meeting Session 不存在" }, 404);
      }
      const result = await regenerateSavedMeetingIntelligence({
        meetingId,
        memberRole: member.role,
        organizationId: activeOrg.id,
        template: c.req.valid("json").template,
        userId: user.id,
      });
      if (result === null) {
        return c.json({ error: "Meeting Session 不存在" }, 404);
      }
      if (result === "forbidden") {
        return c.json({ error: "无权重新生成 Meeting Intelligence" }, 403);
      }
      if (result === "not-ready") {
        return c.json({ error: "最终转录尚未就绪" }, 409);
      }
      if (result === "unavailable") {
        return c.json({ error: "Meeting Intelligence 队列暂不可用" }, 503);
      }
      return c.json(result, 202);
    },
  );
