/* oxlint-disable typescript/consistent-type-imports -- Nest reads the constructor service class from emitted decorator metadata. */
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
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
  WorkspaceAccessGuard,
  getWorkspaceContext,
} from "../../../infrastructure/http/workspace-access/index.js";
import { MeetingLifecycleService } from "./meeting-lifecycle.service.js";
import {
  meetingPathSchema,
  meetingRestoreResponseSchema,
  meetingTrashActionResponseSchema,
  purgeMeetingQuerySchema,
  trashedMeetingListQuerySchema,
  trashedMeetingListResponseSchema,
  workspaceMeetingPathSchema,
} from "./meeting.schemas.js";

type Path = z.infer<typeof meetingPathSchema>;
type WorkspacePath = z.infer<typeof workspaceMeetingPathSchema>;
type TrashQuery = z.infer<typeof trashedMeetingListQuerySchema>;
type PurgeQuery = z.infer<typeof purgeMeetingQuerySchema>;

@ApiTags("workspace-meeting-lifecycle")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/meetings")
export class MeetingLifecycleController {
  constructor(private readonly lifecycle: MeetingLifecycleService) {}

  @Get("trash")
  @ApiOperation({ operationId: "listWorkspaceMeetingTrash" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: trashedMeetingListResponseSchema })
  listTrash(
    @Req() request: Request,
    @Param({ schema: workspaceMeetingPathSchema }) _path: WorkspacePath,
    @Query({ schema: trashedMeetingListQuerySchema }) query: TrashQuery,
  ) {
    const context = getWorkspaceContext(request);
    return this.lifecycle.listTrash(context.workspace.id, context.actor.id, query);
  }

  @Post(":id/trash")
  @HttpCode(200)
  @ApiOperation({ operationId: "trashWorkspaceMeeting" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: meetingTrashActionResponseSchema })
  trash(@Req() request: Request, @Param({ schema: meetingPathSchema }) path: Path) {
    const context = getWorkspaceContext(request);
    return this.lifecycle.trash(context.workspace.id, context.actor.id, path.id);
  }

  @Post(":id/restore")
  @HttpCode(200)
  @ApiOperation({ operationId: "restoreWorkspaceMeeting" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: meetingRestoreResponseSchema })
  restore(@Req() request: Request, @Param({ schema: meetingPathSchema }) path: Path) {
    const context = getWorkspaceContext(request);
    return this.lifecycle.restore(context.workspace.id, context.actor.id, path.id);
  }

  @Delete(":id")
  @HttpCode(202)
  @ApiOperation({ operationId: "purgeWorkspaceMeeting" })
  @ApiResponse({
    content: { "application/json": { schema: { nullable: true, type: "object" } } },
    status: 202,
  })
  async purge(
    @Req() request: Request,
    @Param({ schema: meetingPathSchema }) path: Path,
    @Query({ schema: purgeMeetingQuerySchema }) query: PurgeQuery,
  ) {
    const context = getWorkspaceContext(request);
    await this.lifecycle.purge(context.workspace.id, context.actor.id, path.id, query);
  }
}
