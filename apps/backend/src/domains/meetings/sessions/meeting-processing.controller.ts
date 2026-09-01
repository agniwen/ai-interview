/* oxlint-disable typescript/consistent-type-imports -- Nest reads the constructor service class from emitted decorator metadata. */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
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
import { MeetingProcessingService } from "./meeting-processing.service.js";
import {
  finalMeetingTranscriptRevisionSchema,
  createMeetingTranscriptCorrectionSchema,
  meetingNestedPathSchema,
  meetingPathSchema,
  meetingPlaybackResponseSchema,
  meetingProcessingResponseSchema,
  meetingTranscriptHistoryResponseSchema,
  meetingTranscriptResponseSchema,
  meetingTranscriptionPolicyResponseSchema,
  updateMeetingTranscriptionPolicySchema,
  workspaceMeetingPathSchema,
} from "./meeting.schemas.js";

type MeetingPath = z.infer<typeof meetingPathSchema>;
type NestedPath = z.infer<typeof meetingNestedPathSchema>;
type WorkspacePath = z.infer<typeof workspaceMeetingPathSchema>;
type UpdatePolicy = z.infer<typeof updateMeetingTranscriptionPolicySchema>;
type TranscriptCorrection = z.infer<typeof createMeetingTranscriptCorrectionSchema>;

@ApiTags("workspace-meeting-processing")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/meetings")
export class MeetingProcessingController {
  constructor(private readonly processing: MeetingProcessingService) {}

  @Get("transcription-policy")
  @ApiOperation({ operationId: "getWorkspaceMeetingTranscriptionPolicy" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: meetingTranscriptionPolicyResponseSchema })
  policy(
    @Req() request: Request,
    @Param({ schema: workspaceMeetingPathSchema }) _path: WorkspacePath,
  ) {
    const context = getWorkspaceContext(request);
    return this.processing.policy(context.workspace.id, context.member.role);
  }

  @Put("transcription-policy")
  @ApiOperation({ operationId: "updateWorkspaceMeetingTranscriptionPolicy" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: meetingTranscriptionPolicyResponseSchema })
  updatePolicy(
    @Req() request: Request,
    @Param({ schema: workspaceMeetingPathSchema }) _path: WorkspacePath,
    @Body({ schema: updateMeetingTranscriptionPolicySchema }) body: UpdatePolicy,
  ) {
    const context = getWorkspaceContext(request);
    return this.processing.updatePolicy(
      context.workspace.id,
      context.actor.id,
      context.member.role,
      body,
    );
  }

  @Get(":id/playback")
  @ApiOperation({ operationId: "getWorkspaceMeetingPlayback" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: meetingPlaybackResponseSchema })
  playback(@Req() request: Request, @Param({ schema: meetingPathSchema }) path: MeetingPath) {
    const context = getWorkspaceContext(request);
    return this.processing.playback(
      context.workspace.id,
      context.actor.id,
      context.member.role,
      path.id,
    );
  }

  @Post(":id/playback/retry")
  @HttpCode(200)
  @ApiOperation({ operationId: "retryWorkspaceMeetingPlayback" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: meetingProcessingResponseSchema })
  retryPlayback(@Req() request: Request, @Param({ schema: meetingPathSchema }) path: MeetingPath) {
    const context = getWorkspaceContext(request);
    return this.processing.retryPlayback(
      context.workspace.id,
      context.actor.id,
      context.member.role,
      path.id,
    );
  }

  @Get(":id/transcript")
  @ApiOperation({ operationId: "getWorkspaceMeetingTranscript" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: meetingTranscriptResponseSchema })
  transcript(@Req() request: Request, @Param({ schema: meetingPathSchema }) path: MeetingPath) {
    const context = getWorkspaceContext(request);
    return this.processing.transcript(
      context.workspace.id,
      context.actor.id,
      context.member.role,
      path.id,
    );
  }

  @Get(":id/transcript/revisions")
  @ApiOperation({ operationId: "listWorkspaceMeetingTranscriptRevisions" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: meetingTranscriptHistoryResponseSchema })
  transcriptHistory(
    @Req() request: Request,
    @Param({ schema: meetingPathSchema }) path: MeetingPath,
  ) {
    const context = getWorkspaceContext(request);
    return this.processing.transcriptHistory(
      context.workspace.id,
      context.actor.id,
      context.member.role,
      path.id,
    );
  }

  @Get(":id/transcript/revisions/:revisionId")
  @ApiOperation({ operationId: "getWorkspaceMeetingTranscriptRevision" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: finalMeetingTranscriptRevisionSchema })
  transcriptRevision(
    @Req() request: Request,
    @Param({ schema: meetingNestedPathSchema }) path: NestedPath,
  ) {
    const context = getWorkspaceContext(request);
    return this.processing.transcriptRevision(
      context.workspace.id,
      context.actor.id,
      context.member.role,
      path.id,
      path.revisionId ?? "",
    );
  }

  @Post(":id/transcript/corrections")
  @ApiOperation({ operationId: "correctWorkspaceMeetingTranscript" })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: finalMeetingTranscriptRevisionSchema })
  correctTranscript(
    @Req() request: Request,
    @Param({ schema: meetingPathSchema }) path: MeetingPath,
    @Body({ schema: createMeetingTranscriptCorrectionSchema }) body: TranscriptCorrection,
  ) {
    const context = getWorkspaceContext(request);
    return this.processing.correctTranscript(
      context.workspace.id,
      context.actor.id,
      context.member.role,
      path.id,
      body,
    );
  }

  @Post(":id/transcript/retry")
  @ApiOperation({ operationId: "retryWorkspaceMeetingTranscript" })
  @ApiResponse({ status: 200 })
  @ApiResponse({ status: 202 })
  @SerializeOptions({ schema: meetingProcessingResponseSchema })
  async retryTranscript(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param({ schema: meetingPathSchema }) path: MeetingPath,
  ) {
    const context = getWorkspaceContext(request);
    const result = await this.processing.retryTranscript(
      context.workspace.id,
      context.actor.id,
      context.member.role,
      path.id,
    );
    response.status(result.state === "processing" ? 202 : 200);
    return result;
  }
}
