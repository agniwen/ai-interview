import { and, desc, eq } from "drizzle-orm";
import { account, interviewNotification } from "@arc/db-schema/schema";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { grantFeishuInterviewEvaluationDocxAccess } from "@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/feishu-docx";
import type { FeishuProviderId } from "@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/provider";
import { FEISHU_PROVIDER_IDS } from "@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/provider";

function isFeishuProviderId(value: string): value is FeishuProviderId {
  return (FEISHU_PROVIDER_IDS as readonly string[]).includes(value);
}

type NotificationDocumentAccessErrorCode =
  | "DOCUMENT_NOT_GENERATED"
  | "FEISHU_ACCOUNT_NOT_LINKED"
  | "NOTIFICATION_NOT_FOUND"
  | "UNSUPPORTED_FEISHU_PROVIDER";

export class NotificationDocumentAccessError extends Error {
  readonly code: NotificationDocumentAccessErrorCode;
  readonly status: 400 | 404 | 409;

  constructor(code: NotificationDocumentAccessErrorCode, message: string, status: 400 | 404 | 409) {
    super(message);
    this.name = "NotificationDocumentAccessError";
    this.code = code;
    this.status = status;
  }
}

export async function grantPlatformNotificationDocumentAccess(options: {
  notificationId: string;
  userId: string;
}): Promise<{ documentUrl: string }> {
  const [notification] = await db
    .select({
      documentId: interviewNotification.feishuDocumentId,
      documentUrl: interviewNotification.feishuDocumentUrl,
      providerId: interviewNotification.providerId,
      recipientOpenId: interviewNotification.recipientOpenId,
    })
    .from(interviewNotification)
    .where(eq(interviewNotification.id, options.notificationId))
    .limit(1);

  if (!notification) {
    throw new NotificationDocumentAccessError("NOTIFICATION_NOT_FOUND", "通知记录不存在", 404);
  }
  if (!notification.documentId || !notification.documentUrl) {
    throw new NotificationDocumentAccessError(
      "DOCUMENT_NOT_GENERATED",
      "飞书文档尚未生成，请先重新发送通知",
      409,
    );
  }
  if (!isFeishuProviderId(notification.providerId)) {
    throw new NotificationDocumentAccessError(
      "UNSUPPORTED_FEISHU_PROVIDER",
      "通知使用了不支持的飞书应用",
      400,
    );
  }

  const [currentUserAccount] = await db
    .select({ accountId: account.accountId })
    .from(account)
    .where(and(eq(account.userId, options.userId), eq(account.providerId, notification.providerId)))
    .orderBy(desc(account.updatedAt))
    .limit(1);

  if (!currentUserAccount) {
    throw new NotificationDocumentAccessError(
      "FEISHU_ACCOUNT_NOT_LINKED",
      "当前管理员未绑定此通知对应的飞书账号",
      409,
    );
  }

  if (currentUserAccount.accountId !== notification.recipientOpenId) {
    await grantFeishuInterviewEvaluationDocxAccess(notification.providerId, {
      documentId: notification.documentId,
      recipientOpenId: currentUserAccount.accountId,
    });
  }

  return { documentUrl: notification.documentUrl };
}
