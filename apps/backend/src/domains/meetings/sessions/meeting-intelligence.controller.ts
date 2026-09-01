/* oxlint-disable typescript/consistent-type-imports -- Nest reads the constructor service class from emitted decorator metadata. */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
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
import { MeetingIntelligenceService } from "./meeting-intelligence.service.js";
import {
  meetingIntelligenceResponseSchema,
  meetingPathSchema,
  meetingProcessingResponseSchema,
  requestMeetingIntelligenceSchema,
} from "./meeting.schemas.js";

type MeetingPath = z.infer<typeof meetingPathSchema>;
type IntelligenceRequest = z.infer<typeof requestMeetingIntelligenceSchema>;

@ApiTags("workspace-meeting-intelligence")
@UseGuards(WorkspaceAccessGuard)
@Controller("workspaces/:workspaceSlug/meetings/:id/intelligence")
export class MeetingIntelligenceController {
  constructor(private readonly intelligence: MeetingIntelligenceService) {}

  @Get()
  @ApiOperation({ operationId: "getWorkspaceMeetingIntelligence" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: meetingIntelligenceResponseSchema })
  get(@Req() request: Request, @Param({ schema: meetingPathSchema }) path: MeetingPath) {
    const context = getWorkspaceContext(request);
    return this.intelligence.get(
      context.workspace.id,
      context.actor.id,
      context.member.role,
      path.id,
    );
  }

  @Post()
  @HttpCode(202)
  @ApiOperation({ operationId: "regenerateWorkspaceMeetingIntelligence" })
  @ApiResponse({ status: 202 })
  @SerializeOptions({ schema: meetingProcessingResponseSchema })
  regenerate(
    @Req() request: Request,
    @Param({ schema: meetingPathSchema }) path: MeetingPath,
    @Body({ schema: requestMeetingIntelligenceSchema }) body: IntelligenceRequest,
  ) {
    const context = getWorkspaceContext(request);
    return this.intelligence.regenerate(
      context.workspace.id,
      context.actor.id,
      context.member.role,
      path.id,
      body.template,
    );
  }
}
