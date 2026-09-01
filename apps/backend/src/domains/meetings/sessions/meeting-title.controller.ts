/* oxlint-disable typescript/consistent-type-imports -- Nest reads the constructor service class from emitted decorator metadata. */
import { Body, Controller, Param, Post, Req, SerializeOptions, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { z } from "zod";
import { WorkspaceAccessGuard } from "../../../infrastructure/http/workspace-access/index.js";
import { MeetingTitleService } from "./meeting-title.service.js";
import {
  recordingTitleRequestSchema,
  recordingTitleResponseSchema,
  workspaceMeetingPathSchema,
} from "./meeting.schemas.js";

type Path = z.infer<typeof workspaceMeetingPathSchema>;
type BodyInput = z.infer<typeof recordingTitleRequestSchema>;

@ApiTags("workspace-meeting-title")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/meetings/title")
export class MeetingTitleController {
  constructor(private readonly titleService: MeetingTitleService) {}
  @Post()
  @ApiOperation({ operationId: "generateWorkspaceMeetingTitle" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: recordingTitleResponseSchema })
  generate(
    @Req() _request: Request,
    @Param({ schema: workspaceMeetingPathSchema }) _path: Path,
    @Body({ schema: recordingTitleRequestSchema }) body: BodyInput,
  ) {
    return this.titleService.generate(body.transcript);
  }
}
