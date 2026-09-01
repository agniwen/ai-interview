import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  SerializeOptions,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { z } from "zod";
import { identifierSchema, jsonResponseSchema } from "../shared.schemas.js";
import { TOP_LEVEL_AUTH_PORT } from "../top-level.ports.js";
import type { TopLevelAuthPort } from "../top-level.ports.js";
import { TOP_LEVEL_PLATFORM_PORT } from "./platform.port.js";
import type { TopLevelPlatformPort } from "./platform.port.js";
import {
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

@ApiTags("platform")
@Controller("api/platform")
@SerializeOptions({ schema: jsonResponseSchema })
export class PlatformController {
  constructor(
    @Inject(TOP_LEVEL_PLATFORM_PORT)
    private readonly platform: TopLevelPlatformPort,
    @Inject(TOP_LEVEL_AUTH_PORT)
    private readonly auth: TopLevelAuthPort,
  ) {}

  private authorize(request: Request) {
    return this.auth.requirePlatformAdministrator(request);
  }

  @Get("organizations")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "listPlatformOrganizations" })
  @ApiResponse({ status: 200 })
  organizations(
    @Query({ schema: platformOrganizationQuerySchema })
    query: z.infer<typeof platformOrganizationQuerySchema>,
    @Req() request: Request,
  ) {
    this.authorize(request);
    return this.platform.listOrganizations(query);
  }

  @Get("organizations/:orgId")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "getPlatformOrganization" })
  @ApiResponse({ status: 200 })
  organization(
    @Param("orgId", { schema: identifierSchema }) organizationId: string,
    @Query({ schema: platformOrganizationMembersQuerySchema })
    query: z.infer<typeof platformOrganizationMembersQuerySchema>,
    @Req() request: Request,
  ) {
    this.authorize(request);
    return this.platform.getOrganization(organizationId, query);
  }

  @Get("users")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "listPlatformUsers" })
  @ApiResponse({ status: 200 })
  users(
    @Query({ schema: platformUsersQuerySchema })
    query: z.infer<typeof platformUsersQuerySchema>,
    @Req() request: Request,
  ) {
    this.authorize(request);
    return this.platform.listUsers(query);
  }

  @Patch("users/:userId/remark")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "updatePlatformUserRemark" })
  @ApiResponse({ status: 200 })
  userRemark(
    @Param("userId", { schema: identifierSchema }) userId: string,
    @Body({ schema: platformUserRemarkSchema })
    body: z.infer<typeof platformUserRemarkSchema>,
    @Req() request: Request,
  ) {
    this.authorize(request);
    return this.platform.updateUserRemark(userId, body);
  }

  @Get("users/:userId/workspaces")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "listPlatformUserWorkspaces" })
  @ApiResponse({ status: 200 })
  userWorkspaces(
    @Param("userId", { schema: identifierSchema }) userId: string,
    @Req() request: Request,
  ) {
    this.authorize(request);
    return this.platform.getUserWorkspaces(userId);
  }

  @Get("mail-ingest-accounts")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "listPlatformMailIngestAccounts" })
  @ApiResponse({ status: 200 })
  mailAccounts(
    @Query({ schema: platformMailAccountsQuerySchema })
    query: z.infer<typeof platformMailAccountsQuerySchema>,
    @Req() request: Request,
  ) {
    this.authorize(request);
    return this.platform.listMailAccounts(query);
  }

  @Post("mail-ingest-accounts")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "createPlatformMailIngestAccount" })
  @ApiResponse({ status: 201 })
  createMailAccount(
    @Body({ schema: platformCreateMailAccountSchema })
    body: z.infer<typeof platformCreateMailAccountSchema>,
    @Req() request: Request,
  ) {
    this.authorize(request);
    return this.platform.createMailAccount(body);
  }

  @Patch("mail-ingest-accounts/:id")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "updatePlatformMailIngestAccount" })
  @ApiResponse({ status: 200 })
  updateMailAccount(
    @Param("id", { schema: identifierSchema }) id: string,
    @Body({ schema: platformUpdateMailAccountSchema })
    body: z.infer<typeof platformUpdateMailAccountSchema>,
    @Req() request: Request,
  ) {
    this.authorize(request);
    return this.platform.updateMailAccount(id, body);
  }

  @Get("queues")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "listPlatformQueues" })
  @ApiResponse({ status: 200 })
  queues(@Req() request: Request) {
    this.authorize(request);
    return this.platform.listQueues();
  }

  @Get("queues/:queueName/jobs")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "listPlatformQueueJobs" })
  @ApiResponse({ status: 200 })
  queueJobs(
    @Param("queueName", { schema: identifierSchema }) queueName: string,
    @Query({ schema: platformQueueJobsQuerySchema })
    query: z.infer<typeof platformQueueJobsQuerySchema>,
    @Req() request: Request,
  ) {
    this.authorize(request);
    return this.platform.getQueueJobs(queueName, query);
  }

  @Get("resume-parse-cache")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "listPlatformResumeParseCache" })
  @ApiResponse({ status: 200 })
  resumeParseCache(
    @Query({ schema: platformResumeParseCacheQuerySchema })
    query: z.infer<typeof platformResumeParseCacheQuerySchema>,
    @Req() request: Request,
  ) {
    this.authorize(request);
    return this.platform.listResumeParseCache(query);
  }

  @Get("resume-parse-cache/:hash")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "getPlatformResumeParseCache" })
  @ApiResponse({ status: 200 })
  resumeParseCacheEntry(
    @Param("hash", { schema: identifierSchema }) hash: string,
    @Req() request: Request,
  ) {
    this.authorize(request);
    return this.platform.getResumeParseCache(hash);
  }

  @Delete("resume-parse-cache/:hash")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "deletePlatformResumeParseCache" })
  @ApiResponse({ status: 200 })
  deleteResumeParseCache(
    @Param("hash", { schema: identifierSchema }) hash: string,
    @Req() request: Request,
  ) {
    this.authorize(request);
    return this.platform.deleteResumeParseCache(hash);
  }

  @Get("notifications")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "listPlatformNotifications" })
  @ApiResponse({ status: 200 })
  notifications(
    @Query({ schema: platformNotificationsQuerySchema })
    query: z.infer<typeof platformNotificationsQuerySchema>,
    @Req() request: Request,
  ) {
    this.authorize(request);
    return this.platform.listNotifications(query);
  }

  @Post("notifications/:id/resend")
  @HttpCode(200)
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "resendPlatformNotification" })
  @ApiResponse({ status: 200 })
  resendNotification(
    @Param("id", { schema: identifierSchema }) id: string,
    @Req() request: Request,
  ) {
    this.authorize(request);
    return this.platform.resendNotification(id);
  }

  @Post("notifications/:id/update-document-structure")
  @HttpCode(200)
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "updatePlatformNotificationDocumentStructure" })
  @ApiResponse({ status: 200 })
  updateNotificationDocumentStructure(
    @Param("id", { schema: identifierSchema }) id: string,
    @Req() request: Request,
  ) {
    this.authorize(request);
    return this.platform.updateNotificationDocumentStructure(id);
  }

  @Post("notifications/:id/debug-preview")
  @HttpCode(200)
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "previewPlatformNotification" })
  @ApiResponse({ status: 200 })
  notificationPreview(
    @Param("id", { schema: identifierSchema }) id: string,
    @Req() request: Request,
  ) {
    this.authorize(request);
    return this.platform.getNotificationPreview(id);
  }

  @Post("notifications/:id/document-access")
  @HttpCode(200)
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "grantPlatformNotificationDocumentAccess" })
  @ApiResponse({ status: 200 })
  notificationDocumentAccess(
    @Param("id", { schema: identifierSchema }) id: string,
    @Req() request: Request,
  ) {
    const actor = this.authorize(request);
    return this.platform.grantNotificationDocumentAccess({ id, userId: actor.id });
  }

  @Get("livekit/overview")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "getPlatformLiveKitOverview" })
  @ApiResponse({ status: 200 })
  liveKitOverview(@Req() request: Request) {
    this.authorize(request);
    return this.platform.getLiveKitOverview();
  }

  @Get("livekit/rooms")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "listPlatformLiveKitRooms" })
  @ApiResponse({ status: 200 })
  liveKitRooms(
    @Query({ schema: platformLiveKitRoomsQuerySchema })
    query: z.infer<typeof platformLiveKitRoomsQuerySchema>,
    @Req() request: Request,
  ) {
    this.authorize(request);
    return this.platform.listLiveKitRooms(query);
  }

  @Get("livekit/rooms/:roomName")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "getPlatformLiveKitRoom" })
  @ApiResponse({ status: 200 })
  liveKitRoom(
    @Param("roomName", { schema: identifierSchema }) roomName: string,
    @Req() request: Request,
  ) {
    this.authorize(request);
    return this.platform.getLiveKitRoom(roomName);
  }

  @Get("livekit/metrics")
  @SerializeOptions({ schema: jsonResponseSchema })
  @ApiOperation({ operationId: "listPlatformLiveKitMetrics" })
  @ApiResponse({ status: 200 })
  liveKitMetrics(
    @Query({ schema: platformLiveKitMetricsQuerySchema })
    query: z.infer<typeof platformLiveKitMetricsQuerySchema>,
    @Req() request: Request,
  ) {
    this.authorize(request);
    return this.platform.getLiveKitMetrics(query);
  }
}
