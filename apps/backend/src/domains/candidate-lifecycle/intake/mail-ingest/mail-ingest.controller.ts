import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  SerializeOptions,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { z } from "zod";
import {
  RequireWorkspacePermission,
  WorkspaceAccessGuard,
  getWorkspaceContext,
} from "../../../../infrastructure/http/workspace-access/index.js";
import { MailIngestService } from "./mail-ingest.service.js";
import {
  createMailAccountSchema,
  createManagedMailAccountSchema,
  mailAccountListSchema,
  mailAccountPathSchema,
  mailAccountSchema,
  mailDeleteSchema,
  mailMessagesQuerySchema,
  mailMessagesResponseSchema,
  mailPollResponseSchema,
  mailWorkspacePathSchema,
  managedMailListQuerySchema,
  managedMailListSchema,
  updateMailAccountSchema,
  workspaceMailAccountSchema,
} from "./mail-ingest.schemas.js";

type WorkspacePath = z.infer<typeof mailWorkspacePathSchema>;
type AccountPath = z.infer<typeof mailAccountPathSchema>;
type ManagedQuery = z.infer<typeof managedMailListQuerySchema>;
type CreateInput = z.infer<typeof createMailAccountSchema>;
type ManagedCreateInput = z.infer<typeof createManagedMailAccountSchema>;
type UpdateInput = z.infer<typeof updateMailAccountSchema>;
type MessagesQuery = z.infer<typeof mailMessagesQuerySchema>;

@ApiTags("workspace-mail-ingest")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/studio/mail-ingest-accounts")
export class MailIngestController {
  constructor(@Inject(MailIngestService) private readonly mail: MailIngestService) {}

  @Get("managed")
  @ApiOperation({ operationId: "listManagedWorkspaceMailIngestAccounts" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: managedMailListSchema })
  @RequireWorkspacePermission("mailIngestAccount", "manage")
  listManaged(
    @Req() request: Request,
    @Param({ schema: mailWorkspacePathSchema }) _path: WorkspacePath,
    @Query({ schema: managedMailListQuerySchema }) query: ManagedQuery,
  ) {
    return this.mail.listManaged(getWorkspaceContext(request).workspace.id, query);
  }

  @Post("managed/poll-now")
  @HttpCode(202)
  @ApiOperation({ operationId: "pollWorkspaceMailIngestNow" })
  @ApiResponse({ status: 202 })
  @SerializeOptions({ schema: mailPollResponseSchema })
  @RequireWorkspacePermission("mailIngestAccount", "manage")
  pollNow(
    @Req() request: Request,
    @Param({ schema: mailWorkspacePathSchema }) _path: WorkspacePath,
  ) {
    const context = getWorkspaceContext(request);
    if (context.member.role !== "owner" && context.member.role !== "admin") {
      throw new ForbiddenException("Forbidden", { errorCode: "MAIL_INGEST_POLL_FORBIDDEN" });
    }
    return this.mail.pollNow(context.workspace.id);
  }

  @Post("managed")
  @ApiOperation({ operationId: "createManagedWorkspaceMailIngestAccount" })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: mailAccountSchema })
  @RequireWorkspacePermission("mailIngestAccount", "manage")
  createManaged(
    @Req() request: Request,
    @Param({ schema: mailWorkspacePathSchema }) _path: WorkspacePath,
    @Body({ schema: createManagedMailAccountSchema }) body: ManagedCreateInput,
  ) {
    const { userId, ...input } = body;
    return this.mail.create(getWorkspaceContext(request).workspace.id, userId, input);
  }

  @Patch("managed/:id")
  @ApiOperation({ operationId: "updateManagedWorkspaceMailIngestAccount" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: mailAccountSchema })
  @RequireWorkspacePermission("mailIngestAccount", "manage")
  updateManaged(
    @Req() request: Request,
    @Param({ schema: mailAccountPathSchema }) path: AccountPath,
    @Body({ schema: updateMailAccountSchema }) body: UpdateInput,
  ) {
    return this.mail.update(getWorkspaceContext(request).workspace.id, path.id, body);
  }

  @Get("managed/:id")
  @ApiOperation({ operationId: "getManagedWorkspaceMailIngestAccount" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: workspaceMailAccountSchema })
  @RequireWorkspacePermission("mailIngestAccount", "manage")
  getManaged(@Req() request: Request, @Param({ schema: mailAccountPathSchema }) path: AccountPath) {
    return this.mail.getManaged(getWorkspaceContext(request).workspace.id, path.id);
  }

  @Get("managed/:id/messages")
  @ApiOperation({ operationId: "listManagedWorkspaceMailIngestMessages" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: mailMessagesResponseSchema })
  @RequireWorkspacePermission("mailIngestAccount", "manage")
  managedMessages(
    @Req() request: Request,
    @Param({ schema: mailAccountPathSchema }) path: AccountPath,
    @Query({ schema: mailMessagesQuerySchema }) query: MessagesQuery,
  ) {
    return this.mail.messages(getWorkspaceContext(request).workspace.id, path.id, query);
  }

  @Get()
  @ApiOperation({ operationId: "listOwnWorkspaceMailIngestAccounts" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: mailAccountListSchema })
  @RequireWorkspacePermission("resumeEmailIngest", "read")
  listOwn(
    @Req() request: Request,
    @Param({ schema: mailWorkspacePathSchema }) _path: WorkspacePath,
  ) {
    const context = getWorkspaceContext(request);
    return this.mail.listOwn(context.workspace.id, context.actor.id);
  }

  @Post()
  @ApiOperation({ operationId: "createOwnWorkspaceMailIngestAccount" })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: mailAccountSchema })
  @RequireWorkspacePermission("resumeEmailIngest", "create")
  createOwn(
    @Req() request: Request,
    @Param({ schema: mailWorkspacePathSchema }) _path: WorkspacePath,
    @Body({ schema: createMailAccountSchema }) body: CreateInput,
  ) {
    const context = getWorkspaceContext(request);
    return this.mail.create(context.workspace.id, context.actor.id, body);
  }

  @Patch(":id")
  @ApiOperation({ operationId: "updateOwnWorkspaceMailIngestAccount" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: mailAccountSchema })
  @RequireWorkspacePermission("resumeEmailIngest", "update")
  updateOwn(
    @Req() request: Request,
    @Param({ schema: mailAccountPathSchema }) path: AccountPath,
    @Body({ schema: updateMailAccountSchema }) body: UpdateInput,
  ) {
    const context = getWorkspaceContext(request);
    return this.mail.update(context.workspace.id, path.id, body, context.actor.id);
  }

  @Delete(":id")
  @HttpCode(200)
  @ApiOperation({ operationId: "deleteOwnWorkspaceMailIngestAccount" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: mailDeleteSchema })
  @RequireWorkspacePermission("resumeEmailIngest", "delete")
  removeOwn(@Req() request: Request, @Param({ schema: mailAccountPathSchema }) path: AccountPath) {
    const context = getWorkspaceContext(request);
    return this.mail.removeOwn(context.workspace.id, context.actor.id, path.id);
  }

  @Get(":id/messages")
  @ApiOperation({ operationId: "listOwnWorkspaceMailIngestMessages" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: mailMessagesResponseSchema })
  @RequireWorkspacePermission("resumeEmailIngest", "read")
  ownMessages(
    @Req() request: Request,
    @Param({ schema: mailAccountPathSchema }) path: AccountPath,
    @Query({ schema: mailMessagesQuerySchema }) query: MessagesQuery,
  ) {
    const context = getWorkspaceContext(request);
    return this.mail.messages(context.workspace.id, path.id, query, context.actor.id);
  }
}
