import { Controller, Get, Param, Query, Req, Res, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { z } from "zod";
/* oxlint-disable typescript/consistent-type-imports -- Nest reads the constructor service class from emitted decorator metadata. */
import {
  meetingAudioExportTrackSchema,
  meetingExportFormatSchema,
} from "@arc/shared/meeting-export";
import {
  WorkspaceAccessGuard,
  getWorkspaceContext,
} from "../../../infrastructure/http/workspace-access/index.js";
import { MeetingExportService } from "./meeting-export.service.js";
import { meetingPathSchema } from "./meeting.schemas.js";

const exportPathSchema = meetingPathSchema.extend({ format: meetingExportFormatSchema });
const exportQuerySchema = z.object({ track: meetingAudioExportTrackSchema.optional() });
type Path = z.infer<typeof exportPathSchema>;
type QueryInput = z.infer<typeof exportQuerySchema>;

@ApiTags("workspace-meeting-exports")
@UseGuards(WorkspaceAccessGuard)
@Controller("workspaces/:workspaceSlug/meetings/:id/exports")
export class MeetingExportController {
  constructor(private readonly exportsService: MeetingExportService) {}
  @Get(":format")
  @ApiOperation({ operationId: "exportWorkspaceMeeting" })
  @ApiProduces("audio/mpeg", "audio/wav", "application/octet-stream", "text/markdown", "text/plain")
  @ApiResponse({
    content: {
      "application/octet-stream": { schema: { format: "binary", type: "string" } },
      "text/markdown": { schema: { type: "string" } },
      "text/plain": { schema: { type: "string" } },
    },
    status: 200,
  })
  @ApiResponse({ status: 302 })
  async export(
    @Req() request: Request,
    @Res() response: Response,
    @Param({ schema: exportPathSchema }) path: Path,
    @Query({ schema: exportQuerySchema }) query: QueryInput,
  ) {
    const context = getWorkspaceContext(request);
    const result = await this.exportsService.prepare(
      context.workspace.id,
      context.actor.id,
      context.member.role,
      path.id,
      path.format,
      query.track,
    );
    if (result.kind === "audio") {
      return response.redirect(302, result.url);
    }
    response.setHeader("content-type", result.contentType);
    response.setHeader(
      "content-disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
    );
    response.status(200);
    response.write(result.body);
    response.end();
  }
}
