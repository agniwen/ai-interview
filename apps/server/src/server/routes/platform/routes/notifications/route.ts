import { listTextFiltersSchema } from "@app/shared/list-text-filters";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { createInternalErrorResponse } from "../../../../error-handler";
import { factory, jsonValidatorError } from "../../../../factory";
import { resendInterviewSummaryNotification } from "../../../agent/utils/feishu-interview-notifications";
import {
  platformNotificationProviderFilterValues,
  platformNotificationStatusFilterValues,
  listPlatformNotificationResendRecipients,
  queryPaginatedPlatformNotifications,
} from "./dao";
import {
  grantPlatformNotificationDocumentAccess,
  NotificationDocumentAccessError,
  previewPlatformFeishuNotification,
  updatePlatformNotificationDocumentStructure,
} from "./utils";

export interface PlatformNotificationsRouterDependencies {
  grantDocumentAccess: typeof grantPlatformNotificationDocumentAccess;
  listRecipients: typeof listPlatformNotificationResendRecipients;
  previewNotification: typeof previewPlatformFeishuNotification;
  queryNotifications: typeof queryPaginatedPlatformNotifications;
  resendNotification: typeof resendInterviewSummaryNotification;
  updateDocumentStructure: typeof updatePlatformNotificationDocumentStructure;
}

const defaultDependencies: PlatformNotificationsRouterDependencies = {
  grantDocumentAccess: grantPlatformNotificationDocumentAccess,
  listRecipients: listPlatformNotificationResendRecipients,
  previewNotification: previewPlatformFeishuNotification,
  queryNotifications: queryPaginatedPlatformNotifications,
  resendNotification: resendInterviewSummaryNotification,
  updateDocumentStructure: updatePlatformNotificationDocumentStructure,
};

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
  textFilters: listTextFiltersSchema("notifications"),
});

const resendSchema = z.object({
  recipientUserId: z.string().trim().min(1).optional(),
});

export function createPlatformNotificationsRouter(
  dependencies: PlatformNotificationsRouterDependencies = defaultDependencies,
) {
  const {
    grantDocumentAccess,
    listRecipients,
    previewNotification,
    queryNotifications,
    resendNotification,
    updateDocumentStructure,
  } = dependencies;

  return factory
    .createApp()
    .get("/", zValidator("query", querySchema, jsonValidatorError("参数校验失败")), async (c) =>
      c.json(await queryNotifications(c.req.valid("query")), 200),
    )
    .get("/:id/resend-recipients", async (c) => {
      const result = await listRecipients(c.req.param("id"));
      return result ? c.json(result, 200) : c.json({ error: "通知记录不存在" }, 404);
    })
    .post(
      "/:id/resend",
      zValidator("json", resendSchema, jsonValidatorError("接收人参数无效")),
      async (c) => {
        try {
          return c.json(
            await resendNotification(c.req.param("id"), c.req.valid("json").recipientUserId),
            200,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : "重新发送飞书通知失败";
          return c.json({ error: message }, message === "通知记录不存在" ? 404 : 400);
        }
      },
    )
    .post("/:id/update-document-structure", async (c) => {
      try {
        return c.json(await updateDocumentStructure(c.req.param("id")), 200);
      } catch (error) {
        if (error instanceof NotificationDocumentAccessError) {
          return c.json({ code: error.code, error: error.message }, error.status);
        }
        return c.json(
          createInternalErrorResponse({
            context: { notificationId: c.req.param("id") },
            error,
            operation: "platform-notification-document-structure-update",
            publicMessage: "更新飞书文档结构失败",
          }),
          500,
        );
      }
    })
    .post("/:id/debug-preview", async (c) => {
      try {
        return c.json(await previewNotification(c.req.param("id")), 200);
      } catch (error) {
        if (error instanceof NotificationDocumentAccessError) {
          const payload = { code: error.code, error: error.message };
          return c.json(payload, error.status);
        }
        const payload = { error: "生成飞书通知预览失败" };
        return c.json(payload, 500);
      }
    })
    .post("/:id/document-access", async (c) => {
      try {
        const { user } = c.var;
        if (!user) {
          return c.json({ error: "Unauthorized" }, 401);
        }
        return c.json(
          await grantDocumentAccess({
            notificationId: c.req.param("id"),
            userId: user.id,
          }),
          200,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : "获取飞书文档访问权失败";
        if (error instanceof NotificationDocumentAccessError) {
          const payload = { code: error.code, error: message };
          return c.json(payload, error.status);
        }
        return c.json({ error: message }, 400);
      }
    });
}
