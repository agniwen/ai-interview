import type { z } from "zod";
import type { HttpResponse } from "../../../infrastructure/http/http.ports.js";
import type {
  platformCreateMailAccountSchema,
  platformLiveKitMetricsQuerySchema,
  platformLiveKitRoomsQuerySchema,
  platformMailAccountsQuerySchema,
  platformNotificationsQuerySchema,
  platformOrganizationMembersQuerySchema,
  platformOrganizationQuerySchema,
  platformQueueJobsQuerySchema,
  platformResumeParseCacheQuerySchema,
  platformUpdateMailAccountSchema,
  platformUserRemarkSchema,
  platformUsersQuerySchema,
} from "./platform.schemas.js";

export const PLATFORM_PORT = Symbol("PLATFORM_PORT");
export const PLATFORM_OPERATIONS_PORT = Symbol("PLATFORM_OPERATIONS_PORT");

export interface PlatformOperationsPort {
  createMailAccount(input: z.infer<typeof platformCreateMailAccountSchema>): Promise<HttpResponse>;
  deleteResumeParseCache(hash: string): Promise<HttpResponse>;
  getLiveKitMetrics(
    input: z.infer<typeof platformLiveKitMetricsQuerySchema>,
  ): Promise<HttpResponse>;
  getLiveKitOverview(): Promise<HttpResponse>;
  getLiveKitRoom(roomName: string): Promise<HttpResponse>;
  getNotificationPreview(id: string): Promise<HttpResponse>;
  getQueueJobs(
    queueName: string,
    query: z.infer<typeof platformQueueJobsQuerySchema>,
  ): Promise<HttpResponse>;
  getResumeParseCache(hash: string): Promise<HttpResponse>;
  grantNotificationDocumentAccess(input: { id: string; userId: string }): Promise<HttpResponse>;
  listLiveKitRooms(input: z.infer<typeof platformLiveKitRoomsQuerySchema>): Promise<HttpResponse>;
  listMailAccounts(input: z.infer<typeof platformMailAccountsQuerySchema>): Promise<HttpResponse>;
  listNotifications(input: z.infer<typeof platformNotificationsQuerySchema>): Promise<HttpResponse>;
  listQueues(): Promise<HttpResponse>;
  listResumeParseCache(
    input: z.infer<typeof platformResumeParseCacheQuerySchema>,
  ): Promise<HttpResponse>;
  resendNotification(id: string): Promise<HttpResponse>;
  updateMailAccount(
    id: string,
    input: z.infer<typeof platformUpdateMailAccountSchema>,
  ): Promise<HttpResponse>;
  updateNotificationDocumentStructure(id: string): Promise<HttpResponse>;
}

export interface PlatformPort {
  createMailAccount(input: z.infer<typeof platformCreateMailAccountSchema>): Promise<HttpResponse>;
  deleteResumeParseCache(hash: string): Promise<HttpResponse>;
  getLiveKitMetrics(
    input: z.infer<typeof platformLiveKitMetricsQuerySchema>,
  ): Promise<HttpResponse>;
  getLiveKitOverview(): Promise<HttpResponse>;
  getLiveKitRoom(roomName: string): Promise<HttpResponse>;
  getNotificationPreview(id: string): Promise<HttpResponse>;
  getOrganization(
    organizationId: string,
    query: z.infer<typeof platformOrganizationMembersQuerySchema>,
  ): Promise<HttpResponse>;
  getQueueJobs(
    queueName: string,
    query: z.infer<typeof platformQueueJobsQuerySchema>,
  ): Promise<HttpResponse>;
  getResumeParseCache(hash: string): Promise<HttpResponse>;
  getUserWorkspaces(userId: string): Promise<HttpResponse>;
  grantNotificationDocumentAccess(input: { id: string; userId: string }): Promise<HttpResponse>;
  listLiveKitRooms(input: z.infer<typeof platformLiveKitRoomsQuerySchema>): Promise<HttpResponse>;
  listMailAccounts(input: z.infer<typeof platformMailAccountsQuerySchema>): Promise<HttpResponse>;
  listNotifications(input: z.infer<typeof platformNotificationsQuerySchema>): Promise<HttpResponse>;
  listOrganizations(input: z.infer<typeof platformOrganizationQuerySchema>): Promise<HttpResponse>;
  listQueues(): Promise<HttpResponse>;
  listResumeParseCache(
    input: z.infer<typeof platformResumeParseCacheQuerySchema>,
  ): Promise<HttpResponse>;
  listUsers(input: z.infer<typeof platformUsersQuerySchema>): Promise<HttpResponse>;
  resendNotification(id: string): Promise<HttpResponse>;
  updateMailAccount(
    id: string,
    input: z.infer<typeof platformUpdateMailAccountSchema>,
  ): Promise<HttpResponse>;
  updateNotificationDocumentStructure(id: string): Promise<HttpResponse>;
  updateUserRemark(
    userId: string,
    input: z.infer<typeof platformUserRemarkSchema>,
  ): Promise<HttpResponse>;
}
