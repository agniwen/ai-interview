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
  Req,
  SerializeOptions,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { z } from "zod";
import { workspaceSlugSchema } from "../departments/department.schemas.js";
import {
  RequireWorkspacePermission,
  WorkspaceAccessGuard,
  getWorkspaceContext,
} from "../workspace-access.js";
import { WorkspaceSettingsService } from "./workspace-settings.service.js";
import {
  activityResponseSchema,
  createdGroupResponseSchema,
  deprecatedResponseSchema,
  groupMemberPathSchema,
  groupPathSchema,
  groupsResponseSchema,
  lastActivesResponseSchema,
  memberPathSchema,
  mutationResponseSchema,
  recruitingGroupInputSchema,
  recruitingGroupMemberInputSchema,
  recruitingGroupMemberRoleInputSchema,
  workspaceResponseSchema,
  workspaceUpdateSchema,
} from "./workspace-settings.schemas.js";

type WorkspacePath = z.infer<typeof workspaceSlugSchema>;
type GroupPath = z.infer<typeof groupPathSchema>;
type GroupMemberPath = z.infer<typeof groupMemberPathSchema>;
type MemberPath = z.infer<typeof memberPathSchema>;
type GroupInput = z.infer<typeof recruitingGroupInputSchema>;
type GroupMemberInput = z.infer<typeof recruitingGroupMemberInputSchema>;
type GroupMemberRoleInput = z.infer<typeof recruitingGroupMemberRoleInputSchema>;
type WorkspaceUpdate = z.infer<typeof workspaceUpdateSchema>;

@ApiTags("workspace-settings")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/studio/workspace")
export class WorkspaceSettingsController {
  constructor(
    @Inject(WorkspaceSettingsService) private readonly settings: WorkspaceSettingsService,
  ) {}

  @Get("my-activity")
  @ApiOperation({ operationId: "getMyWorkspaceResumeActivity" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: activityResponseSchema })
  getMyActivity(
    @Req() request: Request,
    @Param({ schema: workspaceSlugSchema }) _path: WorkspacePath,
  ) {
    const context = getWorkspaceContext(request);
    return this.settings.getMyActivity(context.workspace.id, context.actor.id);
  }

  @Get("member-last-actives")
  @ApiOperation({ operationId: "listWorkspaceMemberLastActives" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: lastActivesResponseSchema })
  listLastActives(
    @Req() request: Request,
    @Param({ schema: workspaceSlugSchema }) _path: WorkspacePath,
  ) {
    return this.settings.listLastActives(getWorkspaceContext(request).workspace.id);
  }

  @Get("groups")
  @ApiOperation({ operationId: "listWorkspaceRecruitingGroups" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: groupsResponseSchema })
  listGroups(
    @Req() request: Request,
    @Param({ schema: workspaceSlugSchema }) _path: WorkspacePath,
  ) {
    const context = getWorkspaceContext(request);
    return this.settings.listGroups(context.workspace.id, context.actor.id);
  }

  @Post("groups")
  @HttpCode(200)
  @ApiOperation({ operationId: "createWorkspaceRecruitingGroup" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: createdGroupResponseSchema })
  @RequireWorkspacePermission("member", "update")
  createGroup(
    @Req() request: Request,
    @Param({ schema: workspaceSlugSchema }) _path: WorkspacePath,
    @Body({ schema: recruitingGroupInputSchema }) body: GroupInput,
  ) {
    const context = getWorkspaceContext(request);
    return this.settings.createGroup(context.workspace.id, context.actor.id, body.name);
  }

  @Patch("groups/:id")
  @ApiOperation({ operationId: "updateWorkspaceRecruitingGroup" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: createdGroupResponseSchema })
  @RequireWorkspacePermission("member", "update")
  updateGroup(
    @Req() request: Request,
    @Param({ schema: groupPathSchema }) path: GroupPath,
    @Body({ schema: recruitingGroupInputSchema }) body: GroupInput,
  ) {
    return this.settings.updateGroup(getWorkspaceContext(request).workspace.id, path.id, body.name);
  }

  @Delete("groups/:id")
  @ApiOperation({ operationId: "deleteWorkspaceRecruitingGroup" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: mutationResponseSchema })
  @RequireWorkspacePermission("member", "update")
  removeGroup(@Req() request: Request, @Param({ schema: groupPathSchema }) path: GroupPath) {
    return this.settings.removeGroup(getWorkspaceContext(request).workspace.id, path.id);
  }

  @Post("groups/:id/members")
  @ApiOperation({ operationId: "addWorkspaceRecruitingGroupMember" })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: mutationResponseSchema })
  @RequireWorkspacePermission("member", "update")
  addMember(
    @Req() request: Request,
    @Param({ schema: groupPathSchema }) path: GroupPath,
    @Body({ schema: recruitingGroupMemberInputSchema }) body: GroupMemberInput,
  ) {
    const context = getWorkspaceContext(request);
    return this.settings.addMember(
      context.workspace.id,
      path.id,
      context.actor.id,
      body.userId,
      body.role,
    );
  }

  @Patch("groups/:id/members/:userId")
  @ApiOperation({ operationId: "updateWorkspaceRecruitingGroupMemberRole" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: mutationResponseSchema })
  @RequireWorkspacePermission("member", "update")
  updateMemberRole(
    @Req() request: Request,
    @Param({ schema: groupMemberPathSchema }) path: GroupMemberPath,
    @Body({ schema: recruitingGroupMemberRoleInputSchema }) body: GroupMemberRoleInput,
  ) {
    return this.settings.updateMemberRole(
      getWorkspaceContext(request).workspace.id,
      path.id,
      path.userId,
      body.role,
    );
  }

  @Delete("groups/:id/members/:userId")
  @ApiOperation({ operationId: "deleteWorkspaceRecruitingGroupMember" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: mutationResponseSchema })
  @RequireWorkspacePermission("member", "update")
  removeMember(
    @Req() request: Request,
    @Param({ schema: groupMemberPathSchema }) path: GroupMemberPath,
  ) {
    return this.settings.removeMember(
      getWorkspaceContext(request).workspace.id,
      path.id,
      path.userId,
    );
  }

  @Patch("members/:userId/group")
  @ApiOperation({ operationId: "updateLegacyWorkspaceMemberGroup" })
  @ApiResponse({ status: 410 })
  @SerializeOptions({ schema: deprecatedResponseSchema })
  @RequireWorkspacePermission("member", "update")
  deprecatedMemberGroup(@Param({ schema: memberPathSchema }) _path: MemberPath) {
    return this.settings.deprecatedMemberGroup();
  }

  @Patch()
  @ApiOperation({ operationId: "updateWorkspaceSettings" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: workspaceResponseSchema })
  @RequireWorkspacePermission("organization", "update")
  updateWorkspace(
    @Req() request: Request,
    @Param({ schema: workspaceSlugSchema }) _path: WorkspacePath,
    @Body({ schema: workspaceUpdateSchema }) body: WorkspaceUpdate,
  ) {
    return this.settings.updateWorkspace(getWorkspaceContext(request).workspace.id, body.name);
  }
}
