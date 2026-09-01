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
import { QuestionTemplateService } from "./question-template.service.js";
import {
  interviewQuestionTemplateSchema,
  questionTemplateAiGenerateInputSchema,
  questionTemplateAiGenerateResponseSchema,
  questionTemplateAllResponseSchema,
  questionTemplateListQuerySchema,
  questionTemplateListResponseSchema,
  questionTemplateMutationResponseSchema,
  questionTemplatePathSchema,
  questionTemplateRecordSchema,
  questionTemplateRefreshResponseSchema,
  questionTemplateVersionPathSchema,
  questionTemplateVersionSchema,
  questionTemplateWorkspacePathSchema,
} from "./question-template.schemas.js";

type WorkspacePath = z.infer<typeof questionTemplateWorkspacePathSchema>;
type Path = z.infer<typeof questionTemplatePathSchema>;
type QueryInput = z.infer<typeof questionTemplateListQuerySchema>;
type Input = z.infer<typeof interviewQuestionTemplateSchema>;
type VersionPath = z.infer<typeof questionTemplateVersionPathSchema>;
type AiGenerateInput = z.infer<typeof questionTemplateAiGenerateInputSchema>;

@ApiTags("workspace-question-templates")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/studio/interview-questions")
export class QuestionTemplateController {
  constructor(
    @Inject(QuestionTemplateService) private readonly templates: QuestionTemplateService,
  ) {}

  @Get()
  @ApiOperation({ operationId: "listWorkspaceQuestionTemplates" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: questionTemplateListResponseSchema })
  @RequireWorkspacePermission("questionTemplate", "read")
  list(
    @Req() request: Request,
    @Param({ schema: questionTemplateWorkspacePathSchema }) _path: WorkspacePath,
    @Query({ schema: questionTemplateListQuerySchema }) query: QueryInput,
  ) {
    return this.templates.list(getWorkspaceContext(request).workspace.id, query);
  }

  @Get("all")
  @ApiOperation({ operationId: "listAllWorkspaceQuestionTemplates" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: questionTemplateAllResponseSchema })
  @RequireWorkspacePermission("questionTemplate", "read")
  listAll(
    @Req() request: Request,
    @Param({ schema: questionTemplateWorkspacePathSchema }) _path: WorkspacePath,
  ) {
    return this.templates.listAll(getWorkspaceContext(request).workspace.id);
  }

  @Post("ai-generate-questions")
  @HttpCode(200)
  @ApiOperation({ operationId: "generateWorkspaceQuestionTemplateQuestions" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: questionTemplateAiGenerateResponseSchema })
  @RequireWorkspacePermission("questionTemplate", "update")
  aiGenerateQuestions(
    @Req() request: Request,
    @Param({ schema: questionTemplateWorkspacePathSchema }) _path: WorkspacePath,
    @Body({ schema: questionTemplateAiGenerateInputSchema }) body: AiGenerateInput,
  ) {
    return this.templates.aiGenerateQuestions(getWorkspaceContext(request).workspace.id, body);
  }

  @Post()
  @ApiOperation({ operationId: "createWorkspaceQuestionTemplate" })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: questionTemplateRecordSchema })
  @RequireWorkspacePermission("questionTemplate", "create")
  create(
    @Req() request: Request,
    @Param({ schema: questionTemplateWorkspacePathSchema }) _path: WorkspacePath,
    @Body({ schema: interviewQuestionTemplateSchema }) body: Input,
  ) {
    const context = getWorkspaceContext(request);
    return this.templates.create(context.workspace.id, context.actor.id, body);
  }

  @Get(":id")
  @ApiOperation({ operationId: "getWorkspaceQuestionTemplate" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: questionTemplateRecordSchema })
  @RequireWorkspacePermission("questionTemplate", "read")
  get(@Req() request: Request, @Param({ schema: questionTemplatePathSchema }) path: Path) {
    return this.templates.get(getWorkspaceContext(request).workspace.id, path.id);
  }

  @Patch(":id")
  @ApiOperation({ operationId: "updateWorkspaceQuestionTemplate" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: questionTemplateRecordSchema })
  @RequireWorkspacePermission("questionTemplate", "update")
  update(
    @Req() request: Request,
    @Param({ schema: questionTemplatePathSchema }) path: Path,
    @Body({ schema: interviewQuestionTemplateSchema }) body: Input,
  ) {
    return this.templates.update(getWorkspaceContext(request).workspace.id, path.id, body);
  }

  @Delete(":id")
  @HttpCode(200)
  @ApiOperation({ operationId: "archiveWorkspaceQuestionTemplate" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: questionTemplateMutationResponseSchema })
  @RequireWorkspacePermission("questionTemplate", "delete")
  archive(@Req() request: Request, @Param({ schema: questionTemplatePathSchema }) path: Path) {
    return this.templates.archive(getWorkspaceContext(request).workspace.id, path.id);
  }

  @Post(":id/unarchive")
  @HttpCode(200)
  @ApiOperation({ operationId: "unarchiveWorkspaceQuestionTemplate" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: questionTemplateMutationResponseSchema })
  @RequireWorkspacePermission("questionTemplate", "update")
  unarchive(@Req() request: Request, @Param({ schema: questionTemplatePathSchema }) path: Path) {
    return this.templates.unarchive(getWorkspaceContext(request).workspace.id, path.id);
  }

  @Post(":id/refresh-eligible-candidates")
  @HttpCode(200)
  @ApiOperation({ operationId: "refreshWorkspaceQuestionTemplateEligibleCandidates" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: questionTemplateRefreshResponseSchema })
  @RequireWorkspacePermission("questionTemplate", "update")
  refreshEligibleCandidates(
    @Req() request: Request,
    @Param({ schema: questionTemplatePathSchema }) path: Path,
  ) {
    const context = getWorkspaceContext(request);
    return this.templates.refreshEligibleCandidates(
      context.workspace.id,
      context.actor.id,
      path.id,
    );
  }

  @Get(":id/versions/:versionId")
  @ApiOperation({ operationId: "getWorkspaceQuestionTemplateVersion" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: questionTemplateVersionSchema })
  @RequireWorkspacePermission("questionTemplate", "read")
  version(
    @Req() request: Request,
    @Param({ schema: questionTemplateVersionPathSchema }) path: VersionPath,
  ) {
    return this.templates.version(
      getWorkspaceContext(request).workspace.id,
      path.id,
      path.versionId,
    );
  }
}
