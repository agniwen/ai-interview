import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import type {
  QualitativeResumeEvaluation,
  ResumeEvaluationContractMode,
} from "@arc/db-schema/qualitative-resume-evaluation";
import type { InterviewQuestion } from "@arc/db-schema/interview/types";
import { account, interviewNotification, studioInterview } from "@arc/db-schema/schema";
import { generateFeishuHrEvaluationWithPromptForInterview } from "@app/server/server/routes/agent/utils/feishu-hr-evaluation";
import {
  buildHrInterviewEvaluationBlock,
  buildInterviewEvaluationStructureSections,
} from "@app/server/server/routes/feishu/utils/interview-evaluation-doc";
import type { HrInterviewEvaluationPreview } from "@app/server/server/routes/feishu/utils/interview-evaluation-doc";
import {
  grantFeishuInterviewEvaluationDocxAccess,
  resolveFeishuDocxDocumentId,
  updateFeishuInterviewEvaluationDocxStructure,
} from "@app/server/server/routes/feishu/utils/feishu-docx";
import type { InterviewEvaluationStructureSection } from "@app/server/server/routes/feishu/utils/feishu-docx";
import type { FeishuProviderId } from "@app/server/server/routes/feishu/utils/provider";
import { FEISHU_PROVIDER_IDS } from "@app/server/server/routes/feishu/utils/provider";

const feishuProviderIdSchema = z.enum(FEISHU_PROVIDER_IDS);

interface NotificationDocumentRow {
  documentId: string | null;
  documentUrl: string | null;
  providerId: string;
  recipientOpenId: string;
}

interface NotificationPreviewRow {
  candidateName: string;
  conversationId: string | null;
  interviewRecordId: string;
  type: string;
}

interface NotificationStructureRow {
  documentId: string | null;
  documentUrl: string | null;
  interviewQuestions: InterviewQuestion[];
  providerId: string;
  qualitativeResumeEvaluation: QualitativeResumeEvaluation | null;
  resumeEvaluationArtifactMode: ResumeEvaluationContractMode | null;
  type: string;
}

export interface PlatformNotificationStructureDependencies {
  loadStructure: (notificationId: string) => Promise<NotificationStructureRow | null>;
  updateDocumentStructure: typeof updateFeishuInterviewEvaluationDocxStructure;
}

export interface PlatformNotificationDependencies {
  generateHrEvaluation: typeof generateFeishuHrEvaluationWithPromptForInterview;
  grantDocumentAccess: typeof grantFeishuInterviewEvaluationDocxAccess;
  loadCurrentUserAccount: (userId: string, providerId: string) => Promise<string | null>;
  loadDocument: (notificationId: string) => Promise<NotificationDocumentRow | null>;
  loadPreview: (notificationId: string) => Promise<NotificationPreviewRow | null>;
}

const defaultDependencies: PlatformNotificationDependencies = {
  generateHrEvaluation: generateFeishuHrEvaluationWithPromptForInterview,
  grantDocumentAccess: grantFeishuInterviewEvaluationDocxAccess,
  loadCurrentUserAccount: async (userId, providerId) => {
    const { db } = await import("@app/server/lib/server/db");
    const [currentUserAccount] = await db
      .select({ accountId: account.accountId })
      .from(account)
      .where(and(eq(account.userId, userId), eq(account.providerId, providerId)))
      .orderBy(desc(account.updatedAt))
      .limit(1);
    return currentUserAccount?.accountId ?? null;
  },
  loadDocument: async (notificationId) => {
    const { db } = await import("@app/server/lib/server/db");
    const [notification] = await db
      .select({
        documentId: interviewNotification.feishuDocumentId,
        documentUrl: interviewNotification.feishuDocumentUrl,
        providerId: interviewNotification.providerId,
        recipientOpenId: interviewNotification.recipientOpenId,
      })
      .from(interviewNotification)
      .where(eq(interviewNotification.id, notificationId))
      .limit(1);
    return notification ?? null;
  },
  loadPreview: async (notificationId) => {
    const { db } = await import("@app/server/lib/server/db");
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
    return notification ?? null;
  },
};

const defaultStructureDependencies: PlatformNotificationStructureDependencies = {
  loadStructure: async (notificationId) => {
    const { db } = await import("@app/server/lib/server/db");
    const [notification] = await db
      .select({
        documentId: interviewNotification.feishuDocumentId,
        documentUrl: interviewNotification.feishuDocumentUrl,
        interviewQuestions: studioInterview.interviewQuestions,
        providerId: interviewNotification.providerId,
        qualitativeResumeEvaluation: studioInterview.qualitativeResumeEvaluation,
        resumeEvaluationArtifactMode: studioInterview.resumeEvaluationArtifactMode,
        type: interviewNotification.type,
      })
      .from(interviewNotification)
      .innerJoin(studioInterview, eq(studioInterview.id, interviewNotification.interviewRecordId))
      .where(eq(interviewNotification.id, notificationId))
      .limit(1);
    return notification ?? null;
  },
  updateDocumentStructure: updateFeishuInterviewEvaluationDocxStructure,
};

function isFeishuProviderId(value: string): value is FeishuProviderId {
  return feishuProviderIdSchema.safeParse(value).success;
}

type NotificationDocumentAccessErrorCode =
  | "DOCUMENT_NOT_GENERATED"
  | "FEISHU_ACCOUNT_NOT_LINKED"
  | "NOTIFICATION_NOT_FOUND"
  | "PREVIEW_NOT_AVAILABLE"
  | "STRUCTURE_UPDATE_NOT_AVAILABLE"
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

export async function grantPlatformNotificationDocumentAccess(
  options: {
    notificationId: string;
    userId: string;
  },
  dependencies: PlatformNotificationDependencies = defaultDependencies,
): Promise<{ documentUrl: string }> {
  const notification = await dependencies.loadDocument(options.notificationId);

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

  const currentUserAccount = await dependencies.loadCurrentUserAccount(
    options.userId,
    notification.providerId,
  );
  if (!currentUserAccount) {
    throw new NotificationDocumentAccessError(
      "FEISHU_ACCOUNT_NOT_LINKED",
      "当前管理员未绑定此通知对应的飞书账号",
      409,
    );
  }

  if (currentUserAccount !== notification.recipientOpenId) {
    await dependencies.grantDocumentAccess(notification.providerId, {
      documentId: notification.documentId,
      recipientOpenId: currentUserAccount,
    });
  }

  return { documentUrl: notification.documentUrl };
}

export async function previewPlatformFeishuNotification(
  notificationId: string,
  dependencies: PlatformNotificationDependencies = defaultDependencies,
): Promise<HrInterviewEvaluationPreview & { prompt: string }> {
  const notification = await dependencies.loadPreview(notificationId);

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

  const generated = await dependencies.generateHrEvaluation({
    conversationId: notification.conversationId,
    interviewRecordId: notification.interviewRecordId,
  });

  const preview = buildHrInterviewEvaluationBlock({
    candidateName: notification.candidateName,
    evaluation: { hrEvaluation: generated.evaluation },
  });
  return { ...preview, prompt: generated.prompt };
}

export async function updatePlatformNotificationDocumentStructure(
  notificationId: string,
  dependencies: PlatformNotificationStructureDependencies = defaultStructureDependencies,
): Promise<{
  documentUrl: string;
  insertedSections: InterviewEvaluationStructureSection[];
  updatedSections: InterviewEvaluationStructureSection[];
}> {
  const notification = await dependencies.loadStructure(notificationId);
  if (!notification) {
    throw new NotificationDocumentAccessError("NOTIFICATION_NOT_FOUND", "通知记录不存在", 404);
  }
  if (!notification.documentUrl) {
    throw new NotificationDocumentAccessError(
      "DOCUMENT_NOT_GENERATED",
      "飞书文档尚未生成，请先重新发送通知",
      409,
    );
  }
  if (notification.type !== "summary_ready") {
    throw new NotificationDocumentAccessError(
      "STRUCTURE_UPDATE_NOT_AVAILABLE",
      "只有 AI 面试报告通知支持更新文档结构",
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
  const documentId = resolveFeishuDocxDocumentId(notification.documentId, notification.documentUrl);
  if (!documentId) {
    throw new NotificationDocumentAccessError(
      "DOCUMENT_NOT_GENERATED",
      "无法识别飞书文档 ID，请先重新发送通知",
      409,
    );
  }
  const sections = buildInterviewEvaluationStructureSections(notification);
  const result = await dependencies.updateDocumentStructure(notification.providerId, {
    documentId,
    ...sections,
  });
  return {
    documentUrl: notification.documentUrl,
    insertedSections: result.insertedSections,
    updatedSections: result.updatedSections,
  };
}
