import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
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
} from "../../../infrastructure/http/workspace-access/index.js";
import { InterviewerService } from "./interviewer.service.js";
import {
  interviewerAllResponseSchema,
  interviewerDeleteResponseSchema,
  interviewerFormSchema,
  interviewerListQuerySchema,
  interviewerListResponseSchema,
  interviewerPathSchema,
  interviewerSchema,
  interviewerUpdateSchema,
  interviewerVoicePreviewInputSchema,
  interviewerVoicePreviewResponseSchema,
  interviewerWorkspacePathSchema,
} from "./interviewer.schemas.js";

type WorkspacePath = z.infer<typeof interviewerWorkspacePathSchema>;
type InterviewerPath = z.infer<typeof interviewerPathSchema>;
type ListQuery = z.infer<typeof interviewerListQuerySchema>;
type InterviewerInput = z.infer<typeof interviewerFormSchema>;
type InterviewerUpdate = z.infer<typeof interviewerUpdateSchema>;
type VoicePreviewInput = z.infer<typeof interviewerVoicePreviewInputSchema>;

@ApiTags("workspace-interviewers")
@UseGuards(WorkspaceAccessGuard)
@Controller("workspaces/:workspaceSlug/setup/interviewers")
export class InterviewerController {
  constructor(@Inject(InterviewerService) private readonly interviewers: InterviewerService) {}

  @Get()
  @ApiOperation({ operationId: "listWorkspaceInterviewers" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: interviewerListResponseSchema })
  @RequireWorkspacePermission("interviewer", "read")
  list(
    @Req() request: Request,
    @Param({ schema: interviewerWorkspacePathSchema }) _path: WorkspacePath,
    @Query({ schema: interviewerListQuerySchema }) query: ListQuery,
  ) {
    return this.interviewers.list(getWorkspaceContext(request).workspace.id, query);
  }

  @Get("all")
  @ApiOperation({ operationId: "listAllWorkspaceInterviewers" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: interviewerAllResponseSchema })
  @RequireWorkspacePermission("interviewer", "read")
  listAll(
    @Req() request: Request,
    @Param({ schema: interviewerWorkspacePathSchema }) _path: WorkspacePath,
  ) {
    return this.interviewers.listAll(getWorkspaceContext(request).workspace.id);
  }

  @Post()
  @ApiOperation({ operationId: "createWorkspaceInterviewer" })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: interviewerSchema })
  @RequireWorkspacePermission("interviewer", "create")
  create(
    @Req() request: Request,
    @Param({ schema: interviewerWorkspacePathSchema }) _path: WorkspacePath,
    @Body({ schema: interviewerFormSchema }) body: InterviewerInput,
  ) {
    const context = getWorkspaceContext(request);
    return this.interviewers.create(context.workspace.id, context.actor.id, body);
  }

  @Post("voice-previews")
  @HttpCode(200)
  @ApiOperation({ operationId: "createWorkspaceInterviewerVoicePreview" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: interviewerVoicePreviewResponseSchema })
  @RequireWorkspacePermission("interviewer", "read")
  voicePreview(
    @Param({ schema: interviewerWorkspacePathSchema }) _path: WorkspacePath,
    @Body({ schema: interviewerVoicePreviewInputSchema }) body: VoicePreviewInput,
  ) {
    return this.interviewers.voicePreview(body.voice);
  }

  @Get(":id")
  @ApiOperation({ operationId: "getWorkspaceInterviewer" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: interviewerSchema })
  @RequireWorkspacePermission("interviewer", "read")
  get(@Req() request: Request, @Param({ schema: interviewerPathSchema }) path: InterviewerPath) {
    return this.interviewers.get(getWorkspaceContext(request).workspace.id, path.id);
  }

  @Patch(":id")
  @ApiOperation({ operationId: "updateWorkspaceInterviewer" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: interviewerSchema })
  @RequireWorkspacePermission("interviewer", "update")
  update(
    @Req() request: Request,
    @Param({ schema: interviewerPathSchema }) path: InterviewerPath,
    @Body({ schema: interviewerUpdateSchema }) body: InterviewerUpdate,
  ) {
    return this.interviewers.update(getWorkspaceContext(request).workspace.id, path.id, body);
  }

  @Delete(":id")
  @HttpCode(200)
  @ApiOperation({ operationId: "deleteWorkspaceInterviewer" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: interviewerDeleteResponseSchema })
  @RequireWorkspacePermission("interviewer", "delete")
  remove(@Req() request: Request, @Param({ schema: interviewerPathSchema }) path: InterviewerPath) {
    return this.interviewers.remove(getWorkspaceContext(request).workspace.id, path.id);
  }
}
