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
} from "../workspace-access.js";
import { CandidateFormService } from "./candidate-form.service.js";
import {
  candidateFormAllResponseSchema,
  candidateFormAiGenerateInputSchema,
  candidateFormAiGenerateResponseSchema,
  candidateFormCandidateSearchQuerySchema,
  candidateFormCandidateSearchResponseSchema,
  candidateFormListQuerySchema,
  candidateFormListResponseSchema,
  candidateFormMutationResponseSchema,
  candidateFormPathSchema,
  candidateFormRecordSchema,
  candidateFormRefreshResponseSchema,
  candidateFormSubmissionsQuerySchema,
  candidateFormSubmissionsResponseSchema,
  candidateFormTemplateSchema,
  candidateFormVersionPathSchema,
  candidateFormVersionSchema,
  candidateFormWorkspacePathSchema,
} from "./candidate-form.schemas.js";

type WorkspacePath = z.infer<typeof candidateFormWorkspacePathSchema>;
type FormPath = z.infer<typeof candidateFormPathSchema>;
type ListQuery = z.infer<typeof candidateFormListQuerySchema>;
type FormInput = z.infer<typeof candidateFormTemplateSchema>;
type SubmissionsQuery = z.infer<typeof candidateFormSubmissionsQuerySchema>;
type VersionPath = z.infer<typeof candidateFormVersionPathSchema>;
type CandidateSearchQuery = z.infer<typeof candidateFormCandidateSearchQuerySchema>;
type AiGenerateInput = z.infer<typeof candidateFormAiGenerateInputSchema>;

@ApiTags("workspace-candidate-forms")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/studio/forms")
export class CandidateFormController {
  constructor(@Inject(CandidateFormService) private readonly forms: CandidateFormService) {}

  @Get()
  @ApiOperation({ operationId: "listWorkspaceCandidateForms" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: candidateFormListResponseSchema })
  @RequireWorkspacePermission("candidateForm", "read")
  list(
    @Req() request: Request,
    @Param({ schema: candidateFormWorkspacePathSchema }) _path: WorkspacePath,
    @Query({ schema: candidateFormListQuerySchema }) query: ListQuery,
  ) {
    return this.forms.list(getWorkspaceContext(request).workspace.id, query);
  }

  @Get("all")
  @ApiOperation({ operationId: "listAllWorkspaceCandidateForms" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: candidateFormAllResponseSchema })
  @RequireWorkspacePermission("candidateForm", "read")
  listAll(
    @Req() request: Request,
    @Param({ schema: candidateFormWorkspacePathSchema }) _path: WorkspacePath,
  ) {
    return this.forms.listAll(getWorkspaceContext(request).workspace.id);
  }

  @Get("candidates/search")
  @ApiOperation({ operationId: "searchWorkspaceCandidateFormCandidates" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: candidateFormCandidateSearchResponseSchema })
  @RequireWorkspacePermission("candidateForm", "read")
  candidateSearch(
    @Req() request: Request,
    @Param({ schema: candidateFormWorkspacePathSchema }) _path: WorkspacePath,
    @Query({ schema: candidateFormCandidateSearchQuerySchema }) query: CandidateSearchQuery,
  ) {
    return this.forms.candidateSearch(getWorkspaceContext(request).workspace.id, query);
  }

  @Post("ai-generate-questions")
  @HttpCode(200)
  @ApiOperation({ operationId: "generateWorkspaceCandidateFormQuestions" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: candidateFormAiGenerateResponseSchema })
  @RequireWorkspacePermission("candidateForm", "update")
  aiGenerateQuestions(
    @Req() request: Request,
    @Param({ schema: candidateFormWorkspacePathSchema }) _path: WorkspacePath,
    @Body({ schema: candidateFormAiGenerateInputSchema }) body: AiGenerateInput,
  ) {
    return this.forms.aiGenerateQuestions(getWorkspaceContext(request).workspace.id, body);
  }

  @Post()
  @ApiOperation({ operationId: "createWorkspaceCandidateForm" })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: candidateFormRecordSchema })
  @RequireWorkspacePermission("candidateForm", "create")
  create(
    @Req() request: Request,
    @Param({ schema: candidateFormWorkspacePathSchema }) _path: WorkspacePath,
    @Body({ schema: candidateFormTemplateSchema }) body: FormInput,
  ) {
    const context = getWorkspaceContext(request);
    return this.forms.create(context.workspace.id, context.actor.id, body);
  }

  @Get(":id")
  @ApiOperation({ operationId: "getWorkspaceCandidateForm" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: candidateFormRecordSchema })
  @RequireWorkspacePermission("candidateForm", "read")
  get(@Req() request: Request, @Param({ schema: candidateFormPathSchema }) path: FormPath) {
    return this.forms.get(getWorkspaceContext(request).workspace.id, path.id);
  }

  @Patch(":id")
  @ApiOperation({ operationId: "updateWorkspaceCandidateForm" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: candidateFormRecordSchema })
  @RequireWorkspacePermission("candidateForm", "update")
  update(
    @Req() request: Request,
    @Param({ schema: candidateFormPathSchema }) path: FormPath,
    @Body({ schema: candidateFormTemplateSchema }) body: FormInput,
  ) {
    return this.forms.update(getWorkspaceContext(request).workspace.id, path.id, body);
  }

  @Delete(":id")
  @HttpCode(200)
  @ApiOperation({ operationId: "archiveWorkspaceCandidateForm" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: candidateFormMutationResponseSchema })
  @RequireWorkspacePermission("candidateForm", "delete")
  archive(@Req() request: Request, @Param({ schema: candidateFormPathSchema }) path: FormPath) {
    return this.forms.archive(getWorkspaceContext(request).workspace.id, path.id);
  }

  @Post(":id/unarchive")
  @HttpCode(200)
  @ApiOperation({ operationId: "unarchiveWorkspaceCandidateForm" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: candidateFormMutationResponseSchema })
  @RequireWorkspacePermission("candidateForm", "update")
  unarchive(@Req() request: Request, @Param({ schema: candidateFormPathSchema }) path: FormPath) {
    return this.forms.unarchive(getWorkspaceContext(request).workspace.id, path.id);
  }

  @Post(":id/refresh-eligible-candidates")
  @HttpCode(200)
  @ApiOperation({ operationId: "refreshWorkspaceCandidateFormEligibleCandidates" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: candidateFormRefreshResponseSchema })
  @RequireWorkspacePermission("candidateForm", "update")
  refreshEligibleCandidates(
    @Req() request: Request,
    @Param({ schema: candidateFormPathSchema }) path: FormPath,
  ) {
    const context = getWorkspaceContext(request);
    return this.forms.refreshEligibleCandidates(context.workspace.id, context.actor.id, path.id);
  }

  @Get(":id/submissions")
  @ApiOperation({ operationId: "listWorkspaceCandidateFormSubmissions" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: candidateFormSubmissionsResponseSchema })
  @RequireWorkspacePermission("candidateForm", "read")
  submissions(
    @Req() request: Request,
    @Param({ schema: candidateFormPathSchema }) path: FormPath,
    @Query({ schema: candidateFormSubmissionsQuerySchema }) query: SubmissionsQuery,
  ) {
    return this.forms.submissions(getWorkspaceContext(request).workspace.id, path.id, query);
  }

  @Get(":id/versions/:versionId")
  @ApiOperation({ operationId: "getWorkspaceCandidateFormVersion" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: candidateFormVersionSchema })
  @RequireWorkspacePermission("candidateForm", "read")
  version(
    @Req() request: Request,
    @Param({ schema: candidateFormVersionPathSchema }) path: VersionPath,
  ) {
    return this.forms.version(getWorkspaceContext(request).workspace.id, path.id, path.versionId);
  }
}
