import { zValidator } from "@hono/zod-validator";
import { factory, jsonValidatorError } from "@app/server/server/factory";
import { requirePermission } from "@app/server/server/middlewares/permission";
import {
  interviewRecordExists,
  listInterviewNotificationRecipients,
  replaceInterviewNotificationRecipients,
} from "./dao";
import { replaceInterviewNotificationRecipientsSchema } from "./schema";

export const notificationRecipientsRouter = factory
  .createApp()
  .get(
    "/:interviewRecordId/notification-recipients",
    requirePermission("interview", "read"),
    async (c) => {
      const { activeOrg } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const interviewRecordId = c.req.param("interviewRecordId");
      if (!(await interviewRecordExists(activeOrg.id, interviewRecordId))) {
        return c.json({ error: "候选人记录不存在。" }, 404);
      }
      const records = await listInterviewNotificationRecipients(activeOrg.id, interviewRecordId);
      return c.json(
        {
          fallbackToInitiator: records.length === 0,
          records,
        },
        200,
      );
    },
  )
  .put(
    "/:interviewRecordId/notification-recipients",
    requirePermission("interview", "update"),
    zValidator(
      "json",
      replaceInterviewNotificationRecipientsSchema,
      jsonValidatorError("通知人员参数无效。"),
    ),
    async (c) => {
      const { activeOrg, user } = c.var;
      if (!activeOrg) {
        return c.json({ message: "Unauthorized" }, 401);
      }
      const interviewRecordId = c.req.param("interviewRecordId");
      const result = await replaceInterviewNotificationRecipients({
        actorUserId: user?.id ?? null,
        interviewRecordId,
        organizationId: activeOrg.id,
        userIds: c.req.valid("json").userIds,
      });
      if (result === "not-found") {
        return c.json({ error: "候选人记录不存在。" }, 404);
      }
      if (result === "users-not-members") {
        return c.json({ error: "通知人员必须是当前工作区成员。" }, 400);
      }
      const records = await listInterviewNotificationRecipients(activeOrg.id, interviewRecordId);
      return c.json(
        {
          fallbackToInitiator: records.length === 0,
          records,
        },
        200,
      );
    },
  );
