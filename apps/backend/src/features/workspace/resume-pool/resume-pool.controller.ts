/* oxlint-disable require-await, typescript/consistent-type-imports -- The streaming controller preserves its async iterable boundary; Nest needs injected service classes at runtime. */
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  Res,
  SerializeOptions,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiMultipartBody } from "../../../openapi/api-multipart-body.js";
import { ApiConsumes, ApiOperation, ApiProduces, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import type { z } from "zod";
import { InterviewCoreService } from "../interviews/interview-core.service.js";
import {
  RequireWorkspacePermission,
  RequireWorkspacePermissions,
  WorkspaceAccessGuard,
  getWorkspaceContext,
} from "../workspace-access.js";
import type { UploadedResumeFile } from "../resume-upload-batches/resume-upload-batch.service.js";
import { ResumePoolService } from "./resume-pool.service.js";
import {
  duplicateMatchesSchema,
  importResultSchema,
  jobMatchSchema,
  queuedSchema,
  recommendationsResponseSchema,
  resumePoolBindSchema,
  resumePoolCreateInputSchema,
  resumePoolImportInputSchema,
  resumePoolItemSchema,
  resumePoolListQuerySchema,
  resumePoolListSchema,
  resumePoolPathSchema,
  resumePoolRecommendationsSchema,
  resumePoolUploadersSchema,
  resumePoolWorkspacePathSchema,
  successSchema,
} from "./resume-pool.schemas.js";

type WorkspacePath = z.infer<typeof resumePoolWorkspacePathSchema>;
type ItemPath = z.infer<typeof resumePoolPathSchema>;
type ListQuery = z.infer<typeof resumePoolListQuerySchema>;
type CreateInput = z.infer<typeof resumePoolCreateInputSchema>;
type ImportInput = z.infer<typeof resumePoolImportInputSchema>;
type BindInput = z.infer<typeof resumePoolBindSchema>;
type RecommendationInput = z.infer<typeof resumePoolRecommendationsSchema>;

@ApiTags("workspace-resume-pool")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/studio/resume-pool")
export class ResumePoolController {
  constructor(
    private readonly interviews: InterviewCoreService,
    private readonly pool: ResumePoolService,
  ) {}
  private async visible(request: Request) {
    const context = getWorkspaceContext(request);
    return this.interviews.visibleCreatorIds(
      context.workspace.id,
      context.actor.id,
      context.member.role,
    );
  }

  @Get()
  @ApiOperation({ operationId: "listWorkspaceResumePool" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumePoolListSchema })
  @RequireWorkspacePermission("resumePool", "read")
  async list(
    @Req() request: Request,
    @Param({ schema: resumePoolWorkspacePathSchema }) _path: WorkspacePath,
    @Query({ schema: resumePoolListQuerySchema }) query: ListQuery,
  ) {
    const context = getWorkspaceContext(request);
    return this.pool.list(
      context.workspace.id,
      context.actor.id,
      await this.visible(request),
      query,
    );
  }

  @Get("uploaders")
  @ApiOperation({ operationId: "listWorkspaceResumePoolUploaders" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumePoolUploadersSchema })
  @RequireWorkspacePermission("resumePool", "read")
  async uploaders(@Req() request: Request) {
    const context = getWorkspaceContext(request);
    return this.pool.uploaders(context.workspace.id, await this.visible(request));
  }

  @Get(":id")
  @ApiOperation({ operationId: "getWorkspaceResumePoolItem" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumePoolItemSchema })
  @RequireWorkspacePermission("resumePool", "read")
  async get(@Req() request: Request, @Param({ schema: resumePoolPathSchema }) path: ItemPath) {
    const context = getWorkspaceContext(request);
    return this.pool.get(
      context.workspace.id,
      context.actor.id,
      path.id,
      await this.visible(request),
    );
  }

  @Get(":id/duplicate-matches")
  @ApiOperation({ operationId: "listWorkspaceResumePoolDuplicateMatches" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: duplicateMatchesSchema })
  @RequireWorkspacePermission("resumePool", "read")
  async duplicates(
    @Req() request: Request,
    @Param({ schema: resumePoolPathSchema }) path: ItemPath,
  ) {
    const context = getWorkspaceContext(request);
    return this.pool.duplicateMatches(
      context.workspace.id,
      context.actor.id,
      path.id,
      await this.visible(request),
    );
  }

  @Get(":id/review")
  @ApiOperation({ operationId: "getWorkspaceResumePoolReview" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumePoolItemSchema })
  review(@Req() request: Request, @Param({ schema: resumePoolPathSchema }) path: ItemPath) {
    const context = getWorkspaceContext(request);
    return this.pool.get(context.workspace.id, context.actor.id, path.id, null, true);
  }

  @Get(":id/review/resume")
  @ApiOperation({ operationId: "getWorkspaceResumePoolReviewFile" })
  @ApiProduces("application/octet-stream", "application/pdf")
  @ApiResponse({
    content: {
      "application/octet-stream": { schema: { format: "binary", type: "string" } },
      "application/pdf": { schema: { format: "binary", type: "string" } },
    },
    status: 200,
  })
  async reviewFile(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param({ schema: resumePoolPathSchema }) path: ItemPath,
  ) {
    const context = getWorkspaceContext(request);
    const file = await this.pool.getFile(
      context.workspace.id,
      context.actor.id,
      path.id,
      null,
      true,
    );
    response.setHeader("Cache-Control", "private, max-age=300");
    if (file.contentLength !== undefined) {
      response.setHeader("Content-Length", String(file.contentLength));
    }
    return new StreamableFile(file.body, {
      disposition: `inline; filename="${encodeURIComponent(file.filename)}"`,
      type: file.contentType ?? "application/octet-stream",
    });
  }

  @Get(":id/review/resume-preview.pdf")
  @ApiOperation({ operationId: "getWorkspaceResumePoolReviewPdfPreview" })
  @ApiProduces("application/pdf")
  @ApiResponse({
    content: { "application/pdf": { schema: { format: "binary", type: "string" } } },
    status: 200,
  })
  async reviewPreview(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param({ schema: resumePoolPathSchema }) path: ItemPath,
  ) {
    const context = getWorkspaceContext(request);
    const file = await this.pool.getPreview(
      context.workspace.id,
      context.actor.id,
      path.id,
      null,
      true,
    );
    response.setHeader("Cache-Control", "private, max-age=300");
    return new StreamableFile(Buffer.from(file.bytes), {
      disposition: `inline; filename="${encodeURIComponent(file.filename)}"`,
      type: "application/pdf",
    });
  }

  @Post(":id/retry-parse")
  @HttpCode(200)
  @ApiOperation({ operationId: "retryWorkspaceResumePoolParse" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: queuedSchema })
  @RequireWorkspacePermissions(
    { action: "read", resource: "resumePool" },
    { action: "process", resource: "resumeUploadBatch" },
  )
  async retry(@Req() request: Request, @Param({ schema: resumePoolPathSchema }) path: ItemPath) {
    const context = getWorkspaceContext(request);
    return this.pool.retryParse(
      context.workspace.id,
      context.actor.id,
      path.id,
      await this.visible(request),
    );
  }

  @Get(":id/resume")
  @ApiOperation({ operationId: "getWorkspaceResumePoolFile" })
  @ApiProduces("application/octet-stream", "application/pdf")
  @ApiResponse({
    content: {
      "application/octet-stream": { schema: { format: "binary", type: "string" } },
      "application/pdf": { schema: { format: "binary", type: "string" } },
    },
    status: 200,
  })
  @RequireWorkspacePermission("resumePool", "read")
  async file(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param({ schema: resumePoolPathSchema }) path: ItemPath,
  ) {
    const context = getWorkspaceContext(request);
    const file = await this.pool.getFile(
      context.workspace.id,
      context.actor.id,
      path.id,
      await this.visible(request),
    );
    response.setHeader("Cache-Control", "private, max-age=300");
    if (file.contentLength !== undefined) {
      response.setHeader("Content-Length", String(file.contentLength));
    }
    return new StreamableFile(file.body, {
      disposition: `inline; filename="${encodeURIComponent(file.filename)}"`,
      type: file.contentType ?? "application/octet-stream",
    });
  }

  @Get(":id/resume-preview.pdf")
  @ApiOperation({ operationId: "getWorkspaceResumePoolPdfPreview" })
  @ApiProduces("application/pdf")
  @ApiResponse({
    content: { "application/pdf": { schema: { format: "binary", type: "string" } } },
    status: 200,
  })
  @RequireWorkspacePermission("resumePool", "read")
  async preview(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param({ schema: resumePoolPathSchema }) path: ItemPath,
  ) {
    const context = getWorkspaceContext(request);
    const file = await this.pool.getPreview(
      context.workspace.id,
      context.actor.id,
      path.id,
      await this.visible(request),
    );
    response.setHeader("Cache-Control", "private, max-age=300");
    return new StreamableFile(Buffer.from(file.bytes), {
      disposition: `inline; filename="${encodeURIComponent(file.filename)}"`,
      type: "application/pdf",
    });
  }

  @Delete(":id")
  @HttpCode(200)
  @ApiOperation({ operationId: "deleteWorkspaceResumePoolItem" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: successSchema })
  @RequireWorkspacePermission("resumePool", "delete")
  remove(@Req() request: Request, @Param({ schema: resumePoolPathSchema }) path: ItemPath) {
    const context = getWorkspaceContext(request);
    return this.pool.delete(context.workspace.id, context.actor.id, path.id);
  }

  @Post()
  @UseInterceptors(FileInterceptor("resume"))
  @ApiConsumes("multipart/form-data")
  @ApiMultipartBody({ fileField: "resume", schema: resumePoolCreateInputSchema })
  @ApiOperation({ operationId: "createWorkspaceResumePoolItem" })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: resumePoolItemSchema })
  @RequireWorkspacePermission("resumePool", "create")
  create(
    @Req() request: Request,
    @Param({ schema: resumePoolWorkspacePathSchema }) _path: WorkspacePath,
    @Body({ schema: resumePoolCreateInputSchema }) body: CreateInput,
    @UploadedFile() file?: UploadedResumeFile,
  ) {
    const context = getWorkspaceContext(request);
    return this.pool.create(context.workspace.id, context.actor.id, body, file);
  }

  @Post(":id/publish")
  @ApiOperation({ operationId: "publishWorkspaceResumePoolItem" })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: resumePoolItemSchema })
  @RequireWorkspacePermission("resumePool", "publish")
  publish(@Req() request: Request, @Param({ schema: resumePoolPathSchema }) path: ItemPath) {
    const context = getWorkspaceContext(request);
    return this.pool.publish(context.workspace.id, context.actor.id, path.id);
  }

  @Post(":id/import")
  @ApiOperation({ operationId: "importWorkspaceResumePoolItem" })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: importResultSchema })
  @RequireWorkspacePermissions(
    { action: "import", resource: "resumePool" },
    { action: "create", resource: "resumeLibrary" },
  )
  import(
    @Req() request: Request,
    @Param({ schema: resumePoolPathSchema }) path: ItemPath,
    @Body({ schema: resumePoolImportInputSchema }) body: ImportInput,
  ) {
    const context = getWorkspaceContext(request);
    return this.pool.import(context.workspace.id, context.actor.id, path.id, body);
  }

  @Post(":id/bind")
  @HttpCode(200)
  @ApiOperation({ operationId: "bindWorkspaceResumePoolItem" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumePoolItemSchema })
  @RequireWorkspacePermissions(
    { action: "import", resource: "resumePool" },
    { action: "read", resource: "jd" },
  )
  bind(
    @Req() request: Request,
    @Param({ schema: resumePoolPathSchema }) path: ItemPath,
    @Body({ schema: resumePoolBindSchema }) body: BindInput,
  ) {
    const context = getWorkspaceContext(request);
    return this.pool.bind(context.workspace.id, context.actor.id, path.id, body);
  }

  @Get(":id/job-match")
  @ApiOperation({ operationId: "getWorkspaceResumePoolJobMatch" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: jobMatchSchema })
  @RequireWorkspacePermission("resumePool", "read")
  jobMatch(@Req() request: Request, @Param({ schema: resumePoolPathSchema }) path: ItemPath) {
    const context = getWorkspaceContext(request);
    return this.pool.getJobMatch(context.workspace.id, context.actor.id, path.id);
  }

  @Post(":id/recommendations")
  @HttpCode(200)
  @ApiOperation({ operationId: "recommendWorkspaceResumePoolJobs" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: recommendationsResponseSchema })
  @RequireWorkspacePermissions(
    { action: "read", resource: "resumePool" },
    { action: "read", resource: "jd" },
  )
  recommendations(
    @Req() request: Request,
    @Param({ schema: resumePoolPathSchema }) path: ItemPath,
    @Body({ schema: resumePoolRecommendationsSchema }) body: RecommendationInput,
  ) {
    const context = getWorkspaceContext(request);
    return this.pool.recommendations(context.workspace.id, context.actor.id, path.id, body.topN);
  }
}
