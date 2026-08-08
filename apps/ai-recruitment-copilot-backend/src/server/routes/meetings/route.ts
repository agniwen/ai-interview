import { zValidator } from "@hono/zod-validator";
import {
  completeSmallSavedMeetingSchema,
  createSmallSavedMeetingSchema,
} from "@arc/shared/meeting-recording";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { completeSmallSavedMeeting, createSmallSavedMeeting } from "./service";

export const meetingsRouter = factory
  .createApp()
  .post(
    "/",
    zValidator("json", createSmallSavedMeetingSchema, jsonValidatorError("保存清单无效")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!(activeOrg && user)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const result = await createSmallSavedMeeting({
        input: c.req.valid("json"),
        organizationId: activeOrg.id,
        ownerId: user.id,
      });
      if ("conflict" in result) {
        return c.json({ error: result.message }, 409);
      }
      return c.json(
        { meetingId: result.meetingId, state: result.state, uploads: result.uploads },
        result.created ? 201 : 200,
      );
    },
  )
  .post(
    "/:id/complete",
    zValidator("json", completeSmallSavedMeetingSchema, jsonValidatorError("完成请求无效")),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!(activeOrg && user)) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const result = await completeSmallSavedMeeting({
        manifestSha256: c.req.valid("json").manifestSha256,
        meetingId: c.req.param("id"),
        organizationId: activeOrg.id,
        ownerId: user.id,
      });
      if ("error" in result) {
        return c.json({ error: result.error }, result.status);
      }
      return c.json({ meetingId: result.meetingId, state: result.state }, 200);
    },
  );
