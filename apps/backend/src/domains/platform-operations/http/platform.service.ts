import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { IDENTITY_ADMINISTRATION_COMMANDS } from "../../identity-access/public.js";
import type { IdentityAdministrationCommands } from "../../identity-access/public.js";
import { IDENTITY_OPERATIONAL_READ_MODEL } from "../infrastructure/operational-read-model.port.js";
import type { IdentityOperationalReadModel } from "../infrastructure/operational-read-model.port.js";
import { PLATFORM_OPERATIONS_PORT } from "./platform.port.js";
import type { PlatformOperationsPort, PlatformPort } from "./platform.port.js";
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
import type { z } from "zod";

@Injectable()
export class PlatformService implements PlatformPort {
  constructor(
    @Inject(IDENTITY_OPERATIONAL_READ_MODEL)
    private readonly identityReadModel: IdentityOperationalReadModel,
    @Inject(PLATFORM_OPERATIONS_PORT)
    private readonly operations: PlatformOperationsPort,
    @Inject(IDENTITY_ADMINISTRATION_COMMANDS)
    private readonly identityAdministration: IdentityAdministrationCommands,
  ) {}

  listOrganizations(query: z.infer<typeof platformOrganizationQuerySchema>) {
    return this.identityReadModel.listOrganizations(query);
  }

  async getOrganization(
    organizationId: string,
    query: z.infer<typeof platformOrganizationMembersQuerySchema>,
  ) {
    const result = await this.identityReadModel.getOrganization(organizationId, query);
    if (!result) {
      throw new NotFoundException("Workspace not found", {
        errorCode: "PLATFORM_WORKSPACE_NOT_FOUND",
      });
    }
    return result;
  }

  listUsers(query: z.infer<typeof platformUsersQuerySchema>) {
    return this.identityReadModel.listUsers(query);
  }

  async updateUserRemark(userId: string, input: z.infer<typeof platformUserRemarkSchema>) {
    const result = await this.identityAdministration.updateUserRemark(userId, input.remark);
    if (!result.ok) {
      throw new NotFoundException("User not found", {
        errorCode: "PLATFORM_USER_NOT_FOUND",
      });
    }
    return result.value;
  }

  async getUserWorkspaces(userId: string) {
    const result = await this.identityReadModel.getUserWorkspaces(userId);
    if (!result) {
      throw new NotFoundException("User not found", {
        errorCode: "PLATFORM_USER_NOT_FOUND",
      });
    }
    return result;
  }

  createMailAccount(input: z.infer<typeof platformCreateMailAccountSchema>) {
    return this.operations.createMailAccount(input);
  }
  deleteResumeParseCache(hash: string) {
    return this.operations.deleteResumeParseCache(hash);
  }
  getLiveKitMetrics(input: z.infer<typeof platformLiveKitMetricsQuerySchema>) {
    return this.operations.getLiveKitMetrics(input);
  }
  getLiveKitOverview() {
    return this.operations.getLiveKitOverview();
  }
  getLiveKitRoom(roomName: string) {
    return this.operations.getLiveKitRoom(roomName);
  }
  getNotificationPreview(id: string) {
    return this.operations.getNotificationPreview(id);
  }
  getQueueJobs(queueName: string, query: z.infer<typeof platformQueueJobsQuerySchema>) {
    return this.operations.getQueueJobs(queueName, query);
  }
  getResumeParseCache(hash: string) {
    return this.operations.getResumeParseCache(hash);
  }
  grantNotificationDocumentAccess(input: { id: string; userId: string }) {
    return this.operations.grantNotificationDocumentAccess(input);
  }
  listLiveKitRooms(input: z.infer<typeof platformLiveKitRoomsQuerySchema>) {
    return this.operations.listLiveKitRooms(input);
  }
  listMailAccounts(input: z.infer<typeof platformMailAccountsQuerySchema>) {
    return this.operations.listMailAccounts(input);
  }
  listNotifications(input: z.infer<typeof platformNotificationsQuerySchema>) {
    return this.operations.listNotifications(input);
  }
  listQueues() {
    return this.operations.listQueues();
  }
  listResumeParseCache(input: z.infer<typeof platformResumeParseCacheQuerySchema>) {
    return this.operations.listResumeParseCache(input);
  }
  resendNotification(id: string) {
    return this.operations.resendNotification(id);
  }
  updateMailAccount(id: string, input: z.infer<typeof platformUpdateMailAccountSchema>) {
    return this.operations.updateMailAccount(id, input);
  }
  updateNotificationDocumentStructure(id: string) {
    return this.operations.updateNotificationDocumentStructure(id);
  }
}
