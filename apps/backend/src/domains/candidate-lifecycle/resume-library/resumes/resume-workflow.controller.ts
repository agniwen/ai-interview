/* oxlint-disable typescript/consistent-type-imports -- Injected service classes must remain runtime imports so Nest can emit and resolve constructor metadata. */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Req,
  SerializeOptions,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiMultipartBody } from "../../../../openapi/api-multipart-body.js";
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import type { z } from "zod";
import { InterviewCoreService } from "../../recruiting-records/interviews/interview-core.service.js";
import type { UploadedResumeFile } from "../../intake/upload-batches/resume-upload-batch.service.js";
import {
  RequireWorkspacePermission,
  WorkspaceAccessGuard,
  getWorkspaceContext,
} from "../../../../infrastructure/http/workspace-access/index.js";
import { ResumeWorkflowService } from "./resume-workflow.service.js";
import {
  resumeBulkDeleteResponseSchema,
  resumeBulkDeleteSchema,
  resumeCreateSchema,
  resumeDeleteSchema,
  resumeDetailSchema,
  resumeDuplicateMatchesSchema,
  resumeEditSchema,
  resumeEvaluationPatchSchema,
  resumeEvaluationSubmitSchema,
  resumeGateCorrectionResponseSchema,
  resumeGateCorrectionSchema,
  resumeGatePathSchema,
  resumeHistorySchema,
  resumeIdentitySchema,
  resumeLaunchSchema,
  resumeListQuerySchema,
  resumeListSchema,
  resumeMeetingsSchema,
  resumeReviewFilePathSchema,
  resumeRoundsSchema,
  resumeTimelineSchema,
} from "./resume-core.schemas.js";

type Path = z.infer<typeof resumeReviewFilePathSchema>;
type GatePath = z.infer<typeof resumeGatePathSchema>;
type ListQuery = z.infer<typeof resumeListQuerySchema>;
type CreateInput = z.infer<typeof resumeCreateSchema>;
type EditInput = z.infer<typeof resumeEditSchema>;
type IdentityInput = z.infer<typeof resumeIdentitySchema>;
type EvalInput = z.infer<typeof resumeEvaluationPatchSchema>;
type SubmitInput = z.infer<typeof resumeEvaluationSubmitSchema>;
type LaunchInput = z.infer<typeof resumeLaunchSchema>;
type GateInput = z.infer<typeof resumeGateCorrectionSchema>;
type BulkInput = z.infer<typeof resumeBulkDeleteSchema>;

@ApiTags("workspace-resumes")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/studio/resumes")
export class ResumeWorkflowController {
  constructor(
    private readonly interviews: InterviewCoreService,
    private readonly workflows: ResumeWorkflowService,
  ) {}
  private async context(request: Request) {
    const context = getWorkspaceContext(request);
    const visible = await this.interviews.visibleCreatorIds(
      context.workspace.id,
      context.actor.id,
      context.member.role,
    );
    return { context, visible };
  }

  @Get()
  @ApiOperation({ operationId: "listWorkspaceResumes" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeListSchema })
  @RequireWorkspacePermission("resumeLibrary", "read")
  async list(@Req() request: Request, @Query({ schema: resumeListQuerySchema }) query: ListQuery) {
    const { context, visible } = await this.context(request);
    return this.workflows.list(context.workspace.id, visible, query);
  }
  @Get(":id")
  @ApiOperation({ operationId: "getWorkspaceResume" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeDetailSchema })
  @RequireWorkspacePermission("resumeLibrary", "read")
  async get(@Req() request: Request, @Param({ schema: resumeReviewFilePathSchema }) path: Path) {
    const { context, visible } = await this.context(request);
    return this.workflows.get(context.workspace.id, path.id, visible);
  }
  @Get(":id/duplicate-matches")
  @ApiOperation({ operationId: "listWorkspaceResumeDuplicateMatches" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeDuplicateMatchesSchema })
  @RequireWorkspacePermission("resumeLibrary", "read")
  async duplicates(
    @Req() request: Request,
    @Param({ schema: resumeReviewFilePathSchema }) path: Path,
  ) {
    const { context, visible } = await this.context(request);
    return this.workflows.duplicates(context.workspace.id, path.id, visible);
  }
  @Get(":id/timeline")
  @ApiOperation({ operationId: "getWorkspaceResumeTimeline" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeTimelineSchema })
  @RequireWorkspacePermission("resumeLibrary", "read")
  async timeline(
    @Req() request: Request,
    @Param({ schema: resumeReviewFilePathSchema }) path: Path,
  ) {
    const { context, visible } = await this.context(request);
    return this.workflows.timeline(context.workspace.id, path.id, visible);
  }
  @Get(":id/review")
  @ApiOperation({ operationId: "getWorkspaceResumeReview" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeDetailSchema })
  review(@Req() request: Request, @Param({ schema: resumeReviewFilePathSchema }) path: Path) {
    const context = getWorkspaceContext(request);
    return this.workflows.get(context.workspace.id, path.id, null, true);
  }
  @Post(":id/reassess")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ operationId: "reassessWorkspaceResume" })
  @ApiResponse({ status: 202 })
  @SerializeOptions({ schema: resumeDetailSchema })
  @RequireWorkspacePermission("resumeLibrary", "update")
  async reassess(
    @Req() request: Request,
    @Param({ schema: resumeReviewFilePathSchema }) path: Path,
  ) {
    const { context, visible } = await this.context(request);
    return this.workflows.reassess(context.workspace.id, path.id, visible);
  }
  @Get(":id/review/timeline")
  @ApiOperation({ operationId: "getWorkspaceResumeReviewTimeline" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeTimelineSchema })
  reviewTimeline(
    @Req() request: Request,
    @Param({ schema: resumeReviewFilePathSchema }) path: Path,
  ) {
    const context = getWorkspaceContext(request);
    return this.workflows.timeline(context.workspace.id, path.id, null, true);
  }
  @Get(":id/review/rounds")
  @ApiOperation({ operationId: "listWorkspaceResumeReviewRounds" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeRoundsSchema })
  reviewRounds(@Req() request: Request, @Param({ schema: resumeReviewFilePathSchema }) path: Path) {
    const context = getWorkspaceContext(request);
    return this.workflows.rounds(context.workspace.id, path.id, null, true);
  }
  @Post(":id/review/evaluation")
  @HttpCode(200)
  @ApiOperation({ operationId: "submitWorkspaceResumeReviewEvaluation" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeDetailSchema })
  reviewEvaluation(
    @Req() request: Request,
    @Param({ schema: resumeReviewFilePathSchema }) path: Path,
    @Body({ schema: resumeEvaluationSubmitSchema }) body: SubmitInput,
  ) {
    const context = getWorkspaceContext(request);
    return this.workflows.submitEvaluation(
      context.workspace.id,
      context.actor.id,
      path.id,
      body,
      true,
    );
  }
  @Get(":id/rounds")
  @ApiOperation({ operationId: "listWorkspaceResumeRounds" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeRoundsSchema })
  @RequireWorkspacePermission("resumeLibrary", "read")
  async rounds(@Req() request: Request, @Param({ schema: resumeReviewFilePathSchema }) path: Path) {
    const { context, visible } = await this.context(request);
    return this.workflows.rounds(context.workspace.id, path.id, visible);
  }
  @Post(":id/launch-interview")
  @ApiOperation({ operationId: "launchWorkspaceResumeInterview" })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: resumeDetailSchema })
  @RequireWorkspacePermission("resumeLibrary", "update")
  async launch(
    @Req() request: Request,
    @Param({ schema: resumeReviewFilePathSchema }) path: Path,
    @Body({ schema: resumeLaunchSchema }) body: LaunchInput,
  ) {
    const { context, visible } = await this.context(request);
    return this.workflows.launch(context.workspace.id, context.actor.id, path.id, visible, body);
  }
  @Get(":id/evaluation-history")
  @ApiOperation({ operationId: "getWorkspaceResumeEvaluationHistory" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeHistorySchema })
  @RequireWorkspacePermission("resumeLibrary", "read")
  async history(
    @Req() request: Request,
    @Param({ schema: resumeReviewFilePathSchema }) path: Path,
  ) {
    const { context, visible } = await this.context(request);
    return this.workflows.history(context.workspace.id, path.id, visible);
  }
  @Get(":id/meetings")
  @ApiOperation({ operationId: "listWorkspaceResumeMeetings" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeMeetingsSchema })
  @RequireWorkspacePermission("resumeLibrary", "read")
  async meetings(
    @Req() request: Request,
    @Param({ schema: resumeReviewFilePathSchema }) path: Path,
  ) {
    const { context, visible } = await this.context(request);
    return this.workflows.meetings(context.workspace.id, path.id, visible);
  }
  @Patch(":id/structured-evaluation/gates/:requirementId")
  @ApiOperation({ operationId: "correctWorkspaceResumeStructuredGate" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeGateCorrectionResponseSchema })
  @RequireWorkspacePermission("resumeLibrary", "update")
  async correctGate(
    @Req() request: Request,
    @Param({ schema: resumeGatePathSchema }) path: GatePath,
    @Body({ schema: resumeGateCorrectionSchema }) body: GateInput,
  ) {
    const { context, visible } = await this.context(request);
    return this.workflows.correctGate(
      context.workspace.id,
      context.actor.id,
      path.id,
      path.requirementId,
      visible,
      body,
    );
  }
  @Post()
  @UseInterceptors(FileInterceptor("resume"))
  @ApiConsumes("multipart/form-data")
  @ApiMultipartBody({ fileField: "resume", schema: resumeCreateSchema })
  @ApiOperation({ operationId: "createWorkspaceResume" })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: resumeDetailSchema })
  @RequireWorkspacePermission("resumeLibrary", "create")
  create(
    @Req() request: Request,
    @Body({ schema: resumeCreateSchema }) body: CreateInput,
    @UploadedFile() file?: UploadedResumeFile,
  ) {
    const context = getWorkspaceContext(request);
    return this.workflows.create(context.workspace.id, context.actor.id, body, file);
  }
  @Patch(":id/evaluation")
  @ApiOperation({ operationId: "updateWorkspaceResumeEvaluation" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeDetailSchema })
  @RequireWorkspacePermission("resumeLibrary", "update")
  async evaluation(
    @Req() request: Request,
    @Param({ schema: resumeReviewFilePathSchema }) path: Path,
    @Body({ schema: resumeEvaluationPatchSchema }) body: EvalInput,
  ) {
    const { context, visible } = await this.context(request);
    return this.workflows.patchEvaluation(
      context.workspace.id,
      context.actor.id,
      path.id,
      visible,
      body,
    );
  }
  @Patch(":id/identity")
  @ApiOperation({ operationId: "updateWorkspaceResumeIdentity" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeDetailSchema })
  @RequireWorkspacePermission("resumeLibrary", "update")
  async identity(
    @Req() request: Request,
    @Param({ schema: resumeReviewFilePathSchema }) path: Path,
    @Body({ schema: resumeIdentitySchema }) body: IdentityInput,
  ) {
    const { context, visible } = await this.context(request);
    return this.workflows.identity(context.workspace.id, context.actor.id, path.id, visible, body);
  }
  @Patch(":id")
  @ApiConsumes("multipart/form-data")
  @ApiMultipartBody({ schema: resumeEditSchema })
  @ApiOperation({ operationId: "updateWorkspaceResume" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeDetailSchema })
  @RequireWorkspacePermission("resumeLibrary", "update")
  async edit(
    @Req() request: Request,
    @Param({ schema: resumeReviewFilePathSchema }) path: Path,
    @Body({ schema: resumeEditSchema }) body: EditInput,
  ) {
    const { context, visible } = await this.context(request);
    return this.workflows.edit(context.workspace.id, context.actor.id, path.id, visible, body);
  }
  @Delete(":id")
  @HttpCode(200)
  @ApiOperation({ operationId: "deleteWorkspaceResume" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeDeleteSchema })
  @RequireWorkspacePermission("resumeLibrary", "delete")
  async remove(@Req() request: Request, @Param({ schema: resumeReviewFilePathSchema }) path: Path) {
    const { context, visible } = await this.context(request);
    return this.workflows.remove(context.workspace.id, path.id, visible);
  }
  @Post("bulk-delete")
  @HttpCode(200)
  @ApiOperation({ operationId: "bulkDeleteWorkspaceResumes" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeBulkDeleteResponseSchema })
  @RequireWorkspacePermission("resumeLibrary", "delete")
  async bulkDelete(
    @Req() request: Request,
    @Body({ schema: resumeBulkDeleteSchema }) body: BulkInput,
  ) {
    const { context, visible } = await this.context(request);
    return this.workflows.bulkRemove(context.workspace.id, body, visible);
  }
}
