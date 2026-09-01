import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
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
} from "../../../infrastructure/http/workspace-access/index.js";
import { InviteLinkService } from "./invite-link.service.js";
import {
  inviteLinkCreateSchema,
  inviteLinkCreatedSchema,
  inviteLinkInitialRoleSchema,
  inviteLinkListSchema,
  inviteLinkMembersSchema,
  inviteLinkPathSchema,
  inviteLinkSchema,
  inviteLinkWorkspacePathSchema,
} from "./invite-link.schemas.js";

type WorkspacePath = z.infer<typeof inviteLinkWorkspacePathSchema>;
type LinkPath = z.infer<typeof inviteLinkPathSchema>;
type RoleInput = z.infer<typeof inviteLinkInitialRoleSchema>;
type CreateInput = z.infer<typeof inviteLinkCreateSchema>;

@ApiTags("workspace-invite-links")
@UseGuards(WorkspaceAccessGuard)
@RequireWorkspacePermission("invitation", "create")
@Controller("api/w/:slug/studio/workspace/invite-links")
export class InviteLinkController {
  constructor(@Inject(InviteLinkService) private readonly links: InviteLinkService) {}

  @Get()
  @ApiOperation({ operationId: "listWorkspaceInviteLinks" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: inviteLinkListSchema })
  list(
    @Req() request: Request,
    @Param({ schema: inviteLinkWorkspacePathSchema }) _path: WorkspacePath,
  ) {
    return this.links.list(getWorkspaceContext(request).workspace.id);
  }

  @Post()
  @HttpCode(200)
  @ApiOperation({ operationId: "createWorkspaceInviteLink" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: inviteLinkCreatedSchema })
  create(
    @Req() request: Request,
    @Param({ schema: inviteLinkWorkspacePathSchema }) _path: WorkspacePath,
    @Body({ schema: inviteLinkCreateSchema }) body: CreateInput,
  ) {
    const context = getWorkspaceContext(request);
    return this.links.create({
      actorId: context.actor.id,
      actorName: context.actor.name ?? "工作区管理员",
      email: body.email,
      initialRole: body.initialRole,
      invokerRole: context.member.role,
      organizationId: context.workspace.id,
      workspaceName: context.workspace.name,
    });
  }

  @Patch(":id")
  @ApiOperation({ operationId: "updateWorkspaceInviteLinkRole" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: inviteLinkSchema })
  updateRole(
    @Req() request: Request,
    @Param({ schema: inviteLinkPathSchema }) path: LinkPath,
    @Body({ schema: inviteLinkInitialRoleSchema }) body: RoleInput,
  ) {
    const context = getWorkspaceContext(request);
    return this.links.updateRole(
      context.workspace.id,
      context.member.role,
      path.id,
      body.initialRole,
    );
  }

  @Patch(":id/disable")
  @HttpCode(200)
  @ApiOperation({ operationId: "disableWorkspaceInviteLink" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: inviteLinkSchema })
  disable(@Req() request: Request, @Param({ schema: inviteLinkPathSchema }) path: LinkPath) {
    const context = getWorkspaceContext(request);
    return this.links.disable(context.workspace.id, context.actor.id, path.id);
  }

  @Patch(":id/enable")
  @HttpCode(200)
  @ApiOperation({ operationId: "enableWorkspaceInviteLink" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: inviteLinkSchema })
  enable(@Req() request: Request, @Param({ schema: inviteLinkPathSchema }) path: LinkPath) {
    return this.links.enable(getWorkspaceContext(request).workspace.id, path.id);
  }

  @Get(":id/members")
  @ApiOperation({ operationId: "listWorkspaceInviteLinkMembers" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: inviteLinkMembersSchema })
  members(@Req() request: Request, @Param({ schema: inviteLinkPathSchema }) path: LinkPath) {
    return this.links.members(getWorkspaceContext(request).workspace.id, path.id);
  }
}
