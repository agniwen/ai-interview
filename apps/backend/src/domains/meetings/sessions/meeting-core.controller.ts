/* oxlint-disable typescript/consistent-type-imports -- Nest reads the constructor service class from emitted decorator metadata. */
import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Req,
  SerializeOptions,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { z } from "zod";
import {
  WorkspaceAccessGuard,
  getWorkspaceContext,
} from "../../../infrastructure/http/workspace-access/index.js";
import { MeetingCoreService } from "./meeting-core.service.js";
import {
  meetingDetailResponseSchema,
  meetingListResponseSchema,
  meetingPathSchema,
  renamedMeetingResponseSchema,
  updateMeetingMetadataSchema,
  workspaceMeetingPathSchema,
} from "./meeting.schemas.js";

type MeetingPath = z.infer<typeof meetingPathSchema>;
type WorkspacePath = z.infer<typeof workspaceMeetingPathSchema>;
type UpdateMeetingMetadata = z.infer<typeof updateMeetingMetadataSchema>;

@ApiTags("workspace-meetings")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/meetings")
export class MeetingCoreController {
  constructor(private readonly meetings: MeetingCoreService) {}

  @Get()
  @ApiOperation({ operationId: "listWorkspaceMeetings" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: meetingListResponseSchema })
  async list(
    @Req() request: Request,
    @Param({ schema: workspaceMeetingPathSchema }) _path: WorkspacePath,
  ) {
    const context = getWorkspaceContext(request);
    return {
      records: await this.meetings.list(
        context.workspace.id,
        context.actor.id,
        context.member.role,
      ),
    };
  }

  @Get(":id")
  @ApiOperation({ operationId: "getWorkspaceMeeting" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: meetingDetailResponseSchema })
  get(@Req() request: Request, @Param({ schema: meetingPathSchema }) path: MeetingPath) {
    const context = getWorkspaceContext(request);
    return this.meetings.detail(
      context.workspace.id,
      context.actor.id,
      context.member.role,
      path.id,
    );
  }

  @Patch(":id")
  @ApiOperation({ operationId: "updateWorkspaceMeetingMetadata" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: renamedMeetingResponseSchema })
  rename(
    @Req() request: Request,
    @Param({ schema: meetingPathSchema }) path: MeetingPath,
    @Body({ schema: updateMeetingMetadataSchema }) body: UpdateMeetingMetadata,
  ) {
    const context = getWorkspaceContext(request);
    return this.meetings.rename(
      context.workspace.id,
      context.actor.id,
      context.member.role,
      path.id,
      body,
    );
  }
}
