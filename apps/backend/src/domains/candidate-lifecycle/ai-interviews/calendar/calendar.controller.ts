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
import {
  RequireWorkspacePermission,
  WorkspaceAccessGuard,
  getWorkspaceContext,
} from "../../../../infrastructure/http/workspace-access/index.js";
import { CalendarService } from "./calendar.service.js";
import {
  calendarPreviewPathSchema,
  calendarPreviewQuerySchema,
  calendarPreviewResponseSchema,
  calendarQuerySchema,
  calendarResponseSchema,
  calendarWorkspacePathSchema,
} from "./calendar.schemas.js";

type WorkspacePath = z.infer<typeof calendarWorkspacePathSchema>;
type PreviewPath = z.infer<typeof calendarPreviewPathSchema>;
type CalendarQuery = z.infer<typeof calendarQuerySchema>;
type PreviewQuery = z.infer<typeof calendarPreviewQuerySchema>;

@ApiTags("workspace-calendar")
@UseGuards(WorkspaceAccessGuard)
@RequireWorkspacePermission("interview", "read")
@Controller("api/w/:slug/studio/calendar")
export class CalendarController {
  constructor(@Inject(CalendarService) private readonly calendar: CalendarService) {}

  @Get("ai-events/:roundId/preview")
  @ApiOperation({ operationId: "getWorkspaceAiCalendarPreview" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: calendarPreviewResponseSchema })
  preview(
    @Req() request: Request,
    @Param({ schema: calendarPreviewPathSchema }) path: PreviewPath,
    @Query({ schema: calendarPreviewQuerySchema }) query: PreviewQuery,
  ) {
    const context = getWorkspaceContext(request);
    return this.calendar.preview(
      context.workspace.id,
      context.actor.id,
      context.member.role,
      path.roundId,
      query.conversationId,
    );
  }

  @Get()
  @ApiOperation({ operationId: "listWorkspaceCalendarEvents" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: calendarResponseSchema })
  list(
    @Req() request: Request,
    @Param({ schema: calendarWorkspacePathSchema }) _path: WorkspacePath,
    @Query({ schema: calendarQuerySchema }) query: CalendarQuery,
  ) {
    const context = getWorkspaceContext(request);
    return this.calendar.list(
      context.workspace.id,
      context.actor.id,
      context.member.role,
      new Date(query.start),
      new Date(query.end),
    );
  }
}
