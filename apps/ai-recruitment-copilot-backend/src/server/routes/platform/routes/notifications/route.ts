import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { factory, jsonValidatorError } from "@arc/ai-recruitment-copilot-backend/server/factory";
import { resendInterviewSummaryNotification } from "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/feishu-interview-notifications";
import {
  platformNotificationProviderFilterValues,
  platformNotificationStatusFilterValues,
  queryPaginatedPlatformNotifications,
} from "./dao";

const querySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  providerId: z.enum(platformNotificationProviderFilterValues).default("all"),
  search: z.string().optional(),
  sortBy: z
    .enum([
      "createdAt",
      "sentAt",
      "updatedAt",
      "status",
      "providerId",
      "candidateName",
      "organizationName",
    ])
    .default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  status: z.enum(platformNotificationStatusFilterValues).default("all"),
});

export const platformNotificationsRouter = factory
  .createApp()
  .get("/", zValidator("query", querySchema, jsonValidatorError("参数校验失败")), async (c) =>
    c.json(await queryPaginatedPlatformNotifications(c.req.valid("query")), 200),
  )
  .post("/:id/resend", async (c) => {
    try {
      return c.json(await resendInterviewSummaryNotification(c.req.param("id")), 200);
    } catch (error) {
      const message = error instanceof Error ? error.message : "重新发送飞书通知失败";
      return c.json({ error: message }, message === "通知记录不存在" ? 404 : 400);
    }
  });
