/* oxlint-disable typescript/consistent-type-imports -- Nest reads the constructor service class from emitted decorator metadata. */
import {
  BadGatewayException,
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  SerializeOptions,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { z } from "zod";
import { createMeetingLiveTranscriptAuthorizationSchema } from "@arc/shared/meeting-transcription";
import { WorkspaceAccessGuard, getWorkspaceContext } from "../workspace-access.js";
import { workspaceMeetingPathSchema } from "./meeting.schemas.js";
import {
  LiveTranscriptRateLimitError,
  MeetingLiveTranscriptService,
} from "./meeting-live-transcript.service.js";

const leasePathSchema = workspaceMeetingPathSchema.extend({ captureId: z.uuid() });
const authorizationResponseSchema = z.object({
  baseUrl: z.string().optional(),
  clientSecret: z.string(),
  context: z.array(z.string()).optional(),
  expiresAt: z.string().datetime(),
  language: z.string().optional(),
  model: z.string(),
  provider: z.string(),
  speechNoiseThreshold: z.number().optional(),
  track: z.enum(["microphone", "system"]),
  vocabulary: z.record(z.string(), z.number()).optional(),
});
type WorkspacePath = z.infer<typeof workspaceMeetingPathSchema>;
type LeasePath = z.infer<typeof leasePathSchema>;
type AuthorizationInput = z.infer<typeof createMeetingLiveTranscriptAuthorizationSchema>;

@ApiTags("workspace-meeting-live-transcript")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/meetings/live-transcript")
export class MeetingLiveTranscriptController {
  constructor(private readonly liveTranscript: MeetingLiveTranscriptService) {}

  @Post()
  @ApiOperation({ operationId: "authorizeWorkspaceMeetingLiveTranscript" })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: authorizationResponseSchema })
  async authorize(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param({ schema: workspaceMeetingPathSchema }) _path: WorkspacePath,
    @Body({ schema: createMeetingLiveTranscriptAuthorizationSchema }) input: AuthorizationInput,
  ) {
    const context = getWorkspaceContext(request);
    try {
      const result = await this.liveTranscript.authorize({
        captureId: input.captureId,
        organizationId: context.workspace.id,
        track: input.track,
        userId: context.actor.id,
      });
      if (result === "unavailable") {
        throw new ServiceUnavailableException("当前 Workspace 未启用实时字幕 provider");
      }
      if (result === "capacity") {
        response.setHeader("Retry-After", "30");
        throw new HttpException(
          "实时字幕容量已满，Meeting Recording 仍在本地继续",
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      response.setHeader("Cache-Control", "no-store");
      return result;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      if (error instanceof LiveTranscriptRateLimitError) {
        response.setHeader("Retry-After", String(error.retryAfterSeconds));
        throw new HttpException("实时字幕授权请求过于频繁", HttpStatus.TOO_MANY_REQUESTS);
      }
      throw new BadGatewayException("实时字幕 provider 暂时不可用", { cause: error });
    }
  }

  @Post(":captureId/heartbeat")
  @HttpCode(204)
  @ApiOperation({ operationId: "heartbeatWorkspaceMeetingLiveTranscript" })
  @ApiResponse({ status: 204 })
  async heartbeat(@Req() request: Request, @Param({ schema: leasePathSchema }) path: LeasePath) {
    const context = getWorkspaceContext(request);
    const renewed = await this.liveTranscript.heartbeat({
      captureId: path.captureId,
      organizationId: context.workspace.id,
      userId: context.actor.id,
    });
    if (!renewed) {
      throw new HttpException(
        "实时字幕租约已失效，Meeting Recording 仍在本地继续",
        HttpStatus.CONFLICT,
      );
    }
  }

  @Delete(":captureId")
  @HttpCode(204)
  @ApiOperation({ operationId: "releaseWorkspaceMeetingLiveTranscript" })
  @ApiResponse({ status: 204 })
  async release(@Req() request: Request, @Param({ schema: leasePathSchema }) path: LeasePath) {
    const context = getWorkspaceContext(request);
    await this.liveTranscript.release({
      captureId: path.captureId,
      organizationId: context.workspace.id,
      userId: context.actor.id,
    });
  }
}
