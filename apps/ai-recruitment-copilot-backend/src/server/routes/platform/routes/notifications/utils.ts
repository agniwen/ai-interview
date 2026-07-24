import { and, desc, eq } from "drizzle-orm";
import { account, interviewNotification, studioInterview } from "@arc/db-schema/schema";
import { db } from "@arc/ai-recruitment-copilot-backend/lib/server/db";
import { generateFeishuHrEvaluationWithPromptForInterview } from "@arc/ai-recruitment-copilot-backend/server/routes/agent/utils/feishu-hr-evaluation";
import { buildHrInterviewEvaluationBlock } from "@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/interview-evaluation-doc";
import type { HrInterviewEvaluationPreview } from "@arc/ai-recruitment-copilot-backend/server/routes/feishu/utils/interview-evaluation-doc";
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
  | "PREVIEW_NOT_AVAILABLE"
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

export async function previewPlatformFeishuNotification(
  notificationId: string,
): Promise<HrInterviewEvaluationPreview & { prompt: string }> {
  const [notification] = await db
    .select({
      candidateName: studioInterview.candidateName,
      conversationId: interviewNotification.conversationId,
      interviewRecordId: interviewNotification.interviewRecordId,
      type: interviewNotification.type,
    })
    .from(interviewNotification)
    .innerJoin(studioInterview, eq(studioInterview.id, interviewNotification.interviewRecordId))
    .where(eq(interviewNotification.id, notificationId))
    .limit(1);

  if (!notification) {
    throw new NotificationDocumentAccessError("NOTIFICATION_NOT_FOUND", "通知记录不存在", 404);
  }
  if (notification.type !== "summary_ready" || !notification.conversationId) {
    throw new NotificationDocumentAccessError(
      "PREVIEW_NOT_AVAILABLE",
      "该通知没有可供 AI 调试的面试会话",
      409,
    );
  }

  const generated = await generateFeishuHrEvaluationWithPromptForInterview({
    conversationId: notification.conversationId,
    interviewRecordId: notification.interviewRecordId,
  });

  const preview = buildHrInterviewEvaluationBlock({
    candidateName: notification.candidateName,
    evaluation: { hrEvaluation: generated.evaluation },
  });
  return { ...preview, prompt: generated.prompt };
}
