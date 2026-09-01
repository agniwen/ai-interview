import {
  Controller,
  Get,
  Inject,
  Param,
  Query,
  Req,
  SerializeOptions,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { z } from "zod";
import { workspaceSlugSchema } from "../departments/department.schemas.js";
import { WorkspaceAccessGuard, getWorkspaceContext } from "../workspace-access.js";
import { WorkspaceMembersService } from "./workspace-members.service.js";
import {
  workspaceMemberListQuerySchema,
  workspaceMemberListResponseSchema,
  workspaceMemberOptionsResponseSchema,
} from "./workspace-members.schemas.js";

type WorkspacePath = z.infer<typeof workspaceSlugSchema>;
type MemberListQuery = z.infer<typeof workspaceMemberListQuerySchema>;

@ApiTags("workspace-members")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/studio/workspace/members")
export class WorkspaceMembersController {
  constructor(@Inject(WorkspaceMembersService) private readonly members: WorkspaceMembersService) {}

  @Get("options")
  @ApiOperation({ operationId: "listWorkspaceMemberOptions" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: workspaceMemberOptionsResponseSchema })
  options(@Req() request: Request, @Param({ schema: workspaceSlugSchema }) _path: WorkspacePath) {
    return this.members.options(getWorkspaceContext(request).workspace.id);
  }

  @Get()
  @ApiOperation({ operationId: "listWorkspaceMembers" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: workspaceMemberListResponseSchema })
  list(
    @Req() request: Request,
    @Param({ schema: workspaceSlugSchema }) _path: WorkspacePath,
    @Query({ schema: workspaceMemberListQuerySchema }) query: MemberListQuery,
  ) {
    return this.members.list(getWorkspaceContext(request).workspace.id, query);
  }
}
