/* oxlint-disable typescript/consistent-type-imports -- Nest reads the constructor service class from emitted decorator metadata. */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
  SerializeOptions,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { z } from "zod";
import { WorkspaceAccessGuard, getWorkspaceContext } from "../workspace-access.js";
import { MeetingCollaborationService } from "./meeting-collaboration.service.js";
import {
  createMeetingNoteSchema,
  meetingNestedPathSchema,
  meetingNoteSchema,
  meetingNotesResponseSchema,
  meetingPathSchema,
  meetingShareResponseSchema,
  reassignMeetingOwnerSchema,
  updateMeetingNoteSchema,
  updateMeetingShareSchema,
  updatedResponseSchema,
} from "./meeting.schemas.js";

type MeetingPath = z.infer<typeof meetingPathSchema>;
type NestedPath = z.infer<typeof meetingNestedPathSchema>;
type CreateNote = z.infer<typeof createMeetingNoteSchema>;
type UpdateNote = z.infer<typeof updateMeetingNoteSchema>;
type UpdateShare = z.infer<typeof updateMeetingShareSchema>;
type ReassignOwner = z.infer<typeof reassignMeetingOwnerSchema>;

@ApiTags("workspace-meeting-collaboration")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/meetings/:id")
export class MeetingCollaborationController {
  constructor(private readonly collaboration: MeetingCollaborationService) {}

  @Get("notes")
  @ApiOperation({ operationId: "listWorkspaceMeetingNotes" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: meetingNotesResponseSchema })
  async listNotes(
    @Req() request: Request,
    @Param({ schema: meetingPathSchema }) path: MeetingPath,
  ) {
    const context = getWorkspaceContext(request);
    return {
      records: await this.collaboration.listNotes(
        context.workspace.id,
        context.actor.id,
        context.member.role,
        path.id,
      ),
    };
  }

  @Post("notes")
  @ApiOperation({ operationId: "createWorkspaceMeetingNote" })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: meetingNoteSchema })
  createNote(
    @Req() request: Request,
    @Param({ schema: meetingPathSchema }) path: MeetingPath,
    @Body({ schema: createMeetingNoteSchema }) body: CreateNote,
  ) {
    const context = getWorkspaceContext(request);
    return this.collaboration.createNote(
      context.workspace.id,
      context.actor.id,
      context.actor.name ?? "Unknown",
      context.member.role,
      path.id,
      body,
    );
  }

  @Patch("notes/:noteId")
  @ApiOperation({ operationId: "updateWorkspaceMeetingNote" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: meetingNoteSchema })
  updateNote(
    @Req() request: Request,
    @Param({ schema: meetingNestedPathSchema }) path: NestedPath,
    @Body({ schema: updateMeetingNoteSchema }) body: UpdateNote,
  ) {
    const context = getWorkspaceContext(request);
    return this.collaboration.updateNote(
      context.workspace.id,
      context.actor.id,
      context.member.role,
      path.id,
      path.noteId ?? "",
      body,
    );
  }

  @Delete("notes/:noteId")
  @HttpCode(204)
  @ApiOperation({ operationId: "deleteWorkspaceMeetingNote" })
  @ApiResponse({ status: 204 })
  async deleteNote(
    @Req() request: Request,
    @Param({ schema: meetingNestedPathSchema }) path: NestedPath,
  ): Promise<void> {
    const context = getWorkspaceContext(request);
    await this.collaboration.deleteNote(
      context.workspace.id,
      context.actor.id,
      context.member.role,
      path.id,
      path.noteId ?? "",
    );
  }

  @Get("share")
  @ApiOperation({ operationId: "getWorkspaceMeetingShare" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: meetingShareResponseSchema })
  getShare(@Req() request: Request, @Param({ schema: meetingPathSchema }) path: MeetingPath) {
    const context = getWorkspaceContext(request);
    return this.collaboration.getShare(
      context.workspace.id,
      context.actor.id,
      context.member.role,
      path.id,
    );
  }

  @Put("share")
  @ApiOperation({ operationId: "updateWorkspaceMeetingShare" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: updatedResponseSchema })
  updateShare(
    @Req() request: Request,
    @Param({ schema: meetingPathSchema }) path: MeetingPath,
    @Body({ schema: updateMeetingShareSchema }) body: UpdateShare,
  ) {
    const context = getWorkspaceContext(request);
    return this.collaboration.updateShare(
      context.workspace.id,
      context.actor.id,
      context.member.role,
      path.id,
      body,
    );
  }

  @Post("share/owner")
  @HttpCode(200)
  @ApiOperation({ operationId: "reassignWorkspaceMeetingOwner" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: updatedResponseSchema })
  reassignOwner(
    @Req() request: Request,
    @Param({ schema: meetingPathSchema }) path: MeetingPath,
    @Body({ schema: reassignMeetingOwnerSchema }) body: ReassignOwner,
  ) {
    const context = getWorkspaceContext(request);
    return this.collaboration.reassignOwner(
      context.workspace.id,
      context.actor.id,
      context.member.role,
      path.id,
      body,
    );
  }
}
