import type { z } from "zod";
import type { TopLevelResponse } from "../top-level.ports.js";
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

export const TOP_LEVEL_PLATFORM_PORT = Symbol("TOP_LEVEL_PLATFORM_PORT");
export const TOP_LEVEL_PLATFORM_OPERATIONS_PORT = Symbol("TOP_LEVEL_PLATFORM_OPERATIONS_PORT");

export interface TopLevelPlatformOperationsPort {
  createMailAccount(
    input: z.infer<typeof platformCreateMailAccountSchema>,
  ): Promise<TopLevelResponse>;
  deleteResumeParseCache(hash: string): Promise<TopLevelResponse>;
  getLiveKitMetrics(
    input: z.infer<typeof platformLiveKitMetricsQuerySchema>,
  ): Promise<TopLevelResponse>;
  getLiveKitOverview(): Promise<TopLevelResponse>;
  getLiveKitRoom(roomName: string): Promise<TopLevelResponse>;
  getNotificationPreview(id: string): Promise<TopLevelResponse>;
  getQueueJobs(
    queueName: string,
    query: z.infer<typeof platformQueueJobsQuerySchema>,
  ): Promise<TopLevelResponse>;
  getResumeParseCache(hash: string): Promise<TopLevelResponse>;
  grantNotificationDocumentAccess(input: { id: string; userId: string }): Promise<TopLevelResponse>;
  listLiveKitRooms(
    input: z.infer<typeof platformLiveKitRoomsQuerySchema>,
  ): Promise<TopLevelResponse>;
  listMailAccounts(
    input: z.infer<typeof platformMailAccountsQuerySchema>,
  ): Promise<TopLevelResponse>;
  listNotifications(
    input: z.infer<typeof platformNotificationsQuerySchema>,
  ): Promise<TopLevelResponse>;
  listQueues(): Promise<TopLevelResponse>;
  listResumeParseCache(
    input: z.infer<typeof platformResumeParseCacheQuerySchema>,
  ): Promise<TopLevelResponse>;
  resendNotification(id: string): Promise<TopLevelResponse>;
  updateMailAccount(
    id: string,
    input: z.infer<typeof platformUpdateMailAccountSchema>,
  ): Promise<TopLevelResponse>;
  updateNotificationDocumentStructure(id: string): Promise<TopLevelResponse>;
}

export interface TopLevelPlatformPort {
  createMailAccount(
    input: z.infer<typeof platformCreateMailAccountSchema>,
  ): Promise<TopLevelResponse>;
  deleteResumeParseCache(hash: string): Promise<TopLevelResponse>;
  getLiveKitMetrics(
    input: z.infer<typeof platformLiveKitMetricsQuerySchema>,
  ): Promise<TopLevelResponse>;
  getLiveKitOverview(): Promise<TopLevelResponse>;
  getLiveKitRoom(roomName: string): Promise<TopLevelResponse>;
  getNotificationPreview(id: string): Promise<TopLevelResponse>;
  getOrganization(
    organizationId: string,
    query: z.infer<typeof platformOrganizationMembersQuerySchema>,
  ): Promise<TopLevelResponse>;
  getQueueJobs(
    queueName: string,
    query: z.infer<typeof platformQueueJobsQuerySchema>,
  ): Promise<TopLevelResponse>;
  getResumeParseCache(hash: string): Promise<TopLevelResponse>;
  getUserWorkspaces(userId: string): Promise<TopLevelResponse>;
  grantNotificationDocumentAccess(input: { id: string; userId: string }): Promise<TopLevelResponse>;
  listLiveKitRooms(
    input: z.infer<typeof platformLiveKitRoomsQuerySchema>,
  ): Promise<TopLevelResponse>;
  listMailAccounts(
    input: z.infer<typeof platformMailAccountsQuerySchema>,
  ): Promise<TopLevelResponse>;
  listNotifications(
    input: z.infer<typeof platformNotificationsQuerySchema>,
  ): Promise<TopLevelResponse>;
  listOrganizations(
    input: z.infer<typeof platformOrganizationQuerySchema>,
  ): Promise<TopLevelResponse>;
  listQueues(): Promise<TopLevelResponse>;
  listResumeParseCache(
    input: z.infer<typeof platformResumeParseCacheQuerySchema>,
  ): Promise<TopLevelResponse>;
  listUsers(input: z.infer<typeof platformUsersQuerySchema>): Promise<TopLevelResponse>;
  resendNotification(id: string): Promise<TopLevelResponse>;
  updateMailAccount(
    id: string,
    input: z.infer<typeof platformUpdateMailAccountSchema>,
  ): Promise<TopLevelResponse>;
  updateNotificationDocumentStructure(id: string): Promise<TopLevelResponse>;
  updateUserRemark(
    userId: string,
    input: z.infer<typeof platformUserRemarkSchema>,
  ): Promise<TopLevelResponse>;
}
