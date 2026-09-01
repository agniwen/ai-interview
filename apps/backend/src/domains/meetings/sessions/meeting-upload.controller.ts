/* oxlint-disable typescript/consistent-type-imports -- Nest reads the constructor service class from emitted decorator metadata. */
import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  Res,
  SerializeOptions,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import type { z } from "zod";
import {
  WorkspaceAccessGuard,
  getWorkspaceContext,
} from "../../../infrastructure/http/workspace-access/index.js";
import { MeetingUploadService } from "./meeting-upload.service.js";
import {
  completeMeetingResponseSchema,
  completeSmallSavedMeetingSchema,
  createMultipartSavedMeetingSchema,
  createSmallSavedMeetingSchema,
  meetingPathSchema,
  multipartMeetingUploadResponseSchema,
  smallMeetingUploadResponseSchema,
  workspaceMeetingPathSchema,
} from "./meeting.schemas.js";

type Path = z.infer<typeof meetingPathSchema>;
type WorkspacePath = z.infer<typeof workspaceMeetingPathSchema>;
type SmallInput = z.infer<typeof createSmallSavedMeetingSchema>;
type MultipartInput = z.infer<typeof createMultipartSavedMeetingSchema>;
type CompleteInput = z.infer<typeof completeSmallSavedMeetingSchema>;

@ApiTags("workspace-meeting-upload")
@UseGuards(WorkspaceAccessGuard)
@Controller("workspaces/:workspaceSlug/meetings")
export class MeetingUploadController {
  constructor(private readonly upload: MeetingUploadService) {}
  @Post()
  @ApiOperation({ operationId: "createWorkspaceMeetingUpload" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: smallMeetingUploadResponseSchema })
  async create(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param({ schema: workspaceMeetingPathSchema }) _path: WorkspacePath,
    @Body({ schema: createSmallSavedMeetingSchema }) body: SmallInput,
  ) {
    const context = getWorkspaceContext(request);
    const result = await this.upload.create(context.workspace.id, context.actor.id, body);
    response.status(result.created ? 201 : 200);
    const { created: _created, ...payload } = result;
    return payload;
  }
  @Post("multipart")
  @ApiOperation({ operationId: "createWorkspaceMeetingMultipartUpload" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: multipartMeetingUploadResponseSchema })
  async multipart(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param({ schema: workspaceMeetingPathSchema }) _path: WorkspacePath,
    @Body({ schema: createMultipartSavedMeetingSchema }) body: MultipartInput,
  ) {
    const context = getWorkspaceContext(request);
    const result = await this.upload.createMultipart(context.workspace.id, context.actor.id, body);
    response.status(result.created ? 201 : 200);
    const { created: _created, ...payload } = result;
    return payload;
  }
  @Post(":id/upload-heartbeat")
  @HttpCode(204)
  @ApiOperation({ operationId: "heartbeatWorkspaceMeetingUpload" })
  @ApiResponse({ status: 204 })
  async heartbeat(@Req() request: Request, @Param({ schema: meetingPathSchema }) path: Path) {
    const context = getWorkspaceContext(request);
    await this.upload.heartbeat(context.workspace.id, context.actor.id, path.id);
  }
  @Post(":id/complete")
  @HttpCode(200)
  @ApiOperation({ operationId: "completeWorkspaceMeetingUpload" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: completeMeetingResponseSchema })
  complete(
    @Req() request: Request,
    @Param({ schema: meetingPathSchema }) path: Path,
    @Body({ schema: completeSmallSavedMeetingSchema }) body: CompleteInput,
  ) {
    const context = getWorkspaceContext(request);
    return this.upload.complete(context.workspace.id, context.actor.id, path.id, body);
  }
}
