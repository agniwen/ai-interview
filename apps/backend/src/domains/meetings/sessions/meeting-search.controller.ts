/* oxlint-disable typescript/consistent-type-imports -- Nest reads the constructor service class from emitted decorator metadata. */
import { Controller, Get, Param, Query, Req, SerializeOptions, UseGuards } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { z } from "zod";
import {
  WorkspaceAccessGuard,
  getWorkspaceContext,
} from "../../../infrastructure/http/workspace-access/index.js";
import { MeetingSearchService } from "./meeting-search.service.js";
import {
  meetingLibrarySearchQuerySchema,
  meetingSearchResponseSchema,
  workspaceMeetingPathSchema,
} from "./meeting.schemas.js";

type Path = z.infer<typeof workspaceMeetingPathSchema>;
type SearchQuery = z.infer<typeof meetingLibrarySearchQuerySchema>;

@ApiTags("workspace-meeting-search")
@UseGuards(WorkspaceAccessGuard)
@Controller("workspaces/:workspaceSlug/meetings/search")
export class MeetingSearchController {
  constructor(private readonly searchService: MeetingSearchService) {}
  @Get()
  @ApiOperation({ operationId: "searchWorkspaceMeetings" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: meetingSearchResponseSchema })
  async search(
    @Req() request: Request,
    @Param({ schema: workspaceMeetingPathSchema }) _path: Path,
    @Query({ schema: meetingLibrarySearchQuerySchema }) query: SearchQuery,
  ) {
    const context = getWorkspaceContext(request);
    return {
      records: await this.searchService.search(context.workspace.id, context.actor.id, query),
    };
  }
}
