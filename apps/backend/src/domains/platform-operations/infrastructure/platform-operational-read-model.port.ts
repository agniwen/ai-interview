import type { z } from "zod";
import type { HttpResponse } from "../../../infrastructure/http/http.ports.js";
import type {
  platformMailAccountsQuerySchema,
  platformNotificationsQuerySchema,
  platformResumeParseCacheQuerySchema,
} from "../http/platform.schemas.js";

export const PLATFORM_OPERATIONAL_READ_MODEL = Symbol("PLATFORM_OPERATIONAL_READ_MODEL");

export interface ResumeQueueJobDetail {
  attemptCount: number;
  batch: {
    failedCount: number;
    processedCount: number;
    status: string;
    succeededCount: number;
    target: string;
    totalCount: number;
  };
  batchId: string;
  candidateEmail: string | null;
  candidateName: string | null;
  errorMessage: string | null;
  fileSize: number;
  finishedAt: string | null;
  itemId: string;
  itemStatus: string;
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  originalFileName: string;
  poolItemId: string | null;
  poolScope: string | null;
  poolStatus: string | null;
  queuedAt: string | null;
  resumeParseError: string | null;
  resumeParseStatus: string | null;
  resumeRecordId: string | null;
  startedAt: string | null;
  targetRole: string | null;
  userEmail: string;
  userId: string;
  userImage: string | null;
  userName: string;
}

export interface NotificationDocumentStructureRead {
  documentId: string | null;
  documentUrl: string | null;
  interviewQuestions: unknown;
  providerId: string;
  qualitativeResumeEvaluation: unknown;
  resumeEvaluationArtifactMode: string | null;
  type: string;
}

export interface NotificationPreviewRead {
  candidateName: string;
  conversationId: string | null;
  transcript: { message: string; role: string }[] | null;
  type: string;
}

export interface NotificationDocumentAccessRead {
  documentId: string | null;
  documentUrl: string | null;
  id: string;
  providerId: string;
  recipientOpenId: string | null;
}

export interface PlatformOperationalReadModel {
  getLatestProviderAccountOpenId(userId: string, providerId: string): Promise<string | null>;
  getNotificationDocumentAccess(id: string): Promise<NotificationDocumentAccessRead | null>;
  getNotificationDocumentStructure(id: string): Promise<NotificationDocumentStructureRead | null>;
  getNotificationPreview(id: string): Promise<NotificationPreviewRead | null>;
  getResumeParseCache(hash: string): Promise<HttpResponse | null>;
  getResumeQueueJobDetails(itemIds: string[]): Promise<ResumeQueueJobDetail[]>;
  listMailAccounts(query: z.infer<typeof platformMailAccountsQuerySchema>): Promise<HttpResponse>;
  listNotifications(query: z.infer<typeof platformNotificationsQuerySchema>): Promise<HttpResponse>;
  listResumeParseCache(
    query: z.infer<typeof platformResumeParseCacheQuerySchema>,
  ): Promise<HttpResponse>;
}
