import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
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
import {
  RequireWorkspacePermission,
  WorkspaceAccessGuard,
  getWorkspaceContext,
} from "../../../../infrastructure/http/workspace-access/index.js";
import { ResumeUploadBatchService } from "./resume-upload-batch.service.js";
import type { UploadedResumeFile } from "./resume-upload-batch.service.js";
import {
  createResumeUploadBatchSchema,
  resumeUploadBatchActiveSchema,
  resumeUploadBatchDeleteSchema,
  resumeUploadBatchDetailSchema,
  resumeUploadBatchInboxQuerySchema,
  resumeUploadBatchInboxSchema,
  resumeUploadBatchListSchema,
  resumeUploadBatchPathSchema,
  resumeUploadBatchProcessNextSchema,
  resumeUploadBatchWorkspacePathSchema,
  resumeUploadDescriptorSchema,
} from "./resume-upload-batch.schemas.js";

type WorkspacePath = z.infer<typeof resumeUploadBatchWorkspacePathSchema>;
type BatchPath = z.infer<typeof resumeUploadBatchPathSchema>;
type CreateInput = z.infer<typeof createResumeUploadBatchSchema>;
type InboxQuery = z.infer<typeof resumeUploadBatchInboxQuerySchema>;

@ApiTags("workspace-resume-upload-batches")
@UseGuards(WorkspaceAccessGuard)
@Controller("workspaces/:workspaceSlug/candidates/intake/upload-batches")
export class ResumeUploadBatchController {
  constructor(
    @Inject(ResumeUploadBatchService) private readonly batches: ResumeUploadBatchService,
  ) {}

  @Post("uploads")
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  @ApiMultipartBody({ fileField: "file" })
  @ApiOperation({ operationId: "uploadWorkspaceResumeBatchFile" })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: resumeUploadDescriptorSchema })
  @RequireWorkspacePermission("resumeUploadBatch", "create")
  upload(
    @Req() request: Request,
    @Param({ schema: resumeUploadBatchWorkspacePathSchema }) _path: WorkspacePath,
    @UploadedFile() file?: UploadedResumeFile,
  ) {
    const context = getWorkspaceContext(request);
    return this.batches.upload(context.workspace.id, context.actor.id, file);
  }

  @Post()
  @ApiOperation({ operationId: "createWorkspaceResumeUploadBatch" })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: resumeUploadBatchDetailSchema })
  @RequireWorkspacePermission("resumeUploadBatch", "create")
  create(
    @Req() request: Request,
    @Param({ schema: resumeUploadBatchWorkspacePathSchema }) _path: WorkspacePath,
    @Body({ schema: createResumeUploadBatchSchema }) body: CreateInput,
  ) {
    const context = getWorkspaceContext(request);
    return this.batches.create(context.workspace.id, context.actor.id, body);
  }

  @Get()
  @ApiOperation({ operationId: "listWorkspaceResumeUploadBatches" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeUploadBatchListSchema })
  @RequireWorkspacePermission("resumeUploadBatch", "read")
  list(
    @Req() request: Request,
    @Param({ schema: resumeUploadBatchWorkspacePathSchema }) _path: WorkspacePath,
  ) {
    const context = getWorkspaceContext(request);
    return this.batches.list(context.workspace.id, context.actor.id);
  }

  @Get("inbox")
  @ApiOperation({ operationId: "listWorkspaceResumeUploadTaskInbox" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeUploadBatchInboxSchema })
  @RequireWorkspacePermission("resumeUploadBatch", "read")
  inbox(
    @Req() request: Request,
    @Param({ schema: resumeUploadBatchWorkspacePathSchema }) _path: WorkspacePath,
    @Query({ schema: resumeUploadBatchInboxQuerySchema }) query: InboxQuery,
  ) {
    const context = getWorkspaceContext(request);
    return this.batches.inbox(context.workspace.id, context.actor.id, query.cursor ?? null);
  }

  @Get("active")
  @ApiOperation({ operationId: "listActiveWorkspaceResumeUploadBatches" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeUploadBatchActiveSchema })
  @RequireWorkspacePermission("resumeUploadBatch", "read")
  active(
    @Req() request: Request,
    @Param({ schema: resumeUploadBatchWorkspacePathSchema }) _path: WorkspacePath,
  ) {
    const context = getWorkspaceContext(request);
    return this.batches.active(context.workspace.id, context.actor.id);
  }

  @Get(":id")
  @ApiOperation({ operationId: "getWorkspaceResumeUploadBatch" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeUploadBatchDetailSchema })
  @RequireWorkspacePermission("resumeUploadBatch", "read")
  get(@Req() request: Request, @Param({ schema: resumeUploadBatchPathSchema }) path: BatchPath) {
    const context = getWorkspaceContext(request);
    return this.batches.get(context.workspace.id, context.actor.id, path.id);
  }

  @Post(":id/process-next")
  @HttpCode(200)
  @ApiOperation({ operationId: "processNextWorkspaceResumeUploadBatchItem" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeUploadBatchProcessNextSchema })
  @RequireWorkspacePermission("resumeUploadBatch", "process")
  processNext(
    @Req() request: Request,
    @Param({ schema: resumeUploadBatchPathSchema }) path: BatchPath,
  ) {
    const context = getWorkspaceContext(request);
    return this.batches.processNext(context.workspace.id, context.actor.id, path.id);
  }

  @Post(":id/resume")
  @HttpCode(200)
  @ApiOperation({ operationId: "resumeWorkspaceResumeUploadBatch" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeUploadBatchDetailSchema })
  @RequireWorkspacePermission("resumeUploadBatch", "process")
  resume(@Req() request: Request, @Param({ schema: resumeUploadBatchPathSchema }) path: BatchPath) {
    const context = getWorkspaceContext(request);
    return this.batches.resume(context.workspace.id, context.actor.id, path.id);
  }

  @Post(":id/cancel")
  @HttpCode(200)
  @ApiOperation({ operationId: "cancelWorkspaceResumeUploadBatch" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeUploadBatchDetailSchema })
  @RequireWorkspacePermission("resumeUploadBatch", "cancel")
  cancel(@Req() request: Request, @Param({ schema: resumeUploadBatchPathSchema }) path: BatchPath) {
    const context = getWorkspaceContext(request);
    return this.batches.cancel(context.workspace.id, context.actor.id, path.id);
  }

  @Delete(":id")
  @HttpCode(200)
  @ApiOperation({ operationId: "deleteWorkspaceResumeUploadBatch" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeUploadBatchDeleteSchema })
  @RequireWorkspacePermission("resumeUploadBatch", "delete")
  remove(@Req() request: Request, @Param({ schema: resumeUploadBatchPathSchema }) path: BatchPath) {
    const context = getWorkspaceContext(request);
    return this.batches.remove(context.workspace.id, context.actor.id, path.id);
  }
}
