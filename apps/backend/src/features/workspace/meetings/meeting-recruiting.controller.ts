/* oxlint-disable typescript/consistent-type-imports -- Nest reads the constructor service class from emitted decorator metadata. */
import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Query,
  Req,
  SerializeOptions,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { z } from "zod";
import { WorkspaceAccessGuard, getWorkspaceContext } from "../workspace-access.js";
import { MeetingRecruitingService } from "./meeting-recruiting.service.js";
import {
  meetingPathSchema,
  meetingRecruitingCandidatesQuerySchema,
  meetingRecruitingCandidatesResponseSchema,
  meetingRecruitingContextResponseSchema,
  meetingRecruitingContextUpdateResponseSchema,
  updateMeetingRecruitingContextSchema,
} from "./meeting.schemas.js";

type Path = z.infer<typeof meetingPathSchema>;
type QueryInput = z.infer<typeof meetingRecruitingCandidatesQuerySchema>;
type UpdateInput = z.infer<typeof updateMeetingRecruitingContextSchema>;

@ApiTags("workspace-meeting-recruiting-context")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/meetings/:id/recruiting-context")
export class MeetingRecruitingController {
  constructor(private readonly recruiting: MeetingRecruitingService) {}

  @Get()
  @ApiOperation({ operationId: "getWorkspaceMeetingRecruitingContext" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: meetingRecruitingContextResponseSchema })
  get(@Req() request: Request, @Param({ schema: meetingPathSchema }) path: Path) {
    return this.recruiting.get(getWorkspaceContext(request), path.id);
  }

  @Put()
  @ApiOperation({ operationId: "updateWorkspaceMeetingRecruitingContext" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: meetingRecruitingContextUpdateResponseSchema })
  update(
    @Req() request: Request,
    @Param({ schema: meetingPathSchema }) path: Path,
    @Body({ schema: updateMeetingRecruitingContextSchema }) body: UpdateInput,
  ) {
    return this.recruiting.update(getWorkspaceContext(request), path.id, body);
  }

  @Get("candidates")
  @ApiOperation({ operationId: "listWorkspaceMeetingRecruitingCandidates" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: meetingRecruitingCandidatesResponseSchema })
  async candidates(
    @Req() request: Request,
    @Param({ schema: meetingPathSchema }) path: Path,
    @Query({ schema: meetingRecruitingCandidatesQuerySchema }) query: QueryInput,
  ) {
    return {
      records: await this.recruiting.candidates(getWorkspaceContext(request), path.id, query),
    };
  }
}
