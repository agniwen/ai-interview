/* oxlint-disable typescript/consistent-type-imports -- Injected service classes must remain runtime imports so Nest can emit and resolve constructor metadata. */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  SerializeOptions,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import type { z } from "zod";
import { workspaceSlugSchema } from "../../../../infrastructure/http/http.schemas.js";
import {
  RequireWorkspacePermission,
  WorkspaceAccessGuard,
  getWorkspaceContext,
} from "../../../../infrastructure/http/workspace-access/index.js";
import { ResumeCoreService } from "./resume-core.service.js";
import { InterviewCoreService } from "../../recruiting-records/interviews/interview-core.service.js";
import {
  dedupCheckInputSchema,
  dedupResponseSchema,
  resumeReviewFilePathSchema,
  resumeMetricsQuerySchema,
  resumeMetricsResponseSchema,
  skillSuggestionQuerySchema,
  skillSuggestionsResponseSchema,
  interviewQuestionsResponseSchema,
  interviewQuestionsUpdateSchema,
  queuedResponseSchema,
} from "./resume-core.schemas.js";

type WorkspacePath = z.infer<typeof workspaceSlugSchema>;
type DedupInput = z.infer<typeof dedupCheckInputSchema>;
type SkillQuery = z.infer<typeof skillSuggestionQuerySchema>;
type FilePath = z.infer<typeof resumeReviewFilePathSchema>;
type MetricsQuery = z.infer<typeof resumeMetricsQuerySchema>;
type InterviewQuestionsInput = z.infer<typeof interviewQuestionsUpdateSchema>;

@ApiTags("workspace-resumes")
@UseGuards(WorkspaceAccessGuard)
@Controller("workspaces/:workspaceSlug/candidates/resumes")
export class ResumeCoreController {
  constructor(
    private readonly interviews: InterviewCoreService,
    private readonly resumes: ResumeCoreService,
  ) {}

  @Get("skill-suggestions")
  @ApiOperation({ operationId: "listWorkspaceResumeSkillSuggestions" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: skillSuggestionsResponseSchema })
  @RequireWorkspacePermission("resumeLibrary", "read")
  listSkillSuggestions(
    @Req() request: Request,
    @Param({ schema: workspaceSlugSchema }) _path: WorkspacePath,
    @Query({ schema: skillSuggestionQuerySchema }) query: SkillQuery,
  ) {
    return this.resumes.listSkillSuggestions(
      getWorkspaceContext(request).workspace.id,
      query.prefix,
      query.limit,
    );
  }

  @Get("metrics")
  @ApiOperation({ operationId: "getWorkspaceResumeMetrics" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: resumeMetricsResponseSchema })
  @RequireWorkspacePermission("resumeLibrary", "read")
  getMetrics(
    @Req() request: Request,
    @Param({ schema: workspaceSlugSchema }) _path: WorkspacePath,
    @Query({ schema: resumeMetricsQuerySchema }) query: MetricsQuery,
  ) {
    const context = getWorkspaceContext(request);
    return this.resumes.getMetrics(context.workspace.id, context.actor.id, query.scope);
  }

  @Post("dedup-check")
  @HttpCode(200)
  @ApiOperation({ operationId: "findWorkspaceResumeDuplicates" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: dedupResponseSchema })
  @RequireWorkspacePermission("resumeLibrary", "read")
  findDuplicates(
    @Req() request: Request,
    @Param({ schema: workspaceSlugSchema }) _path: WorkspacePath,
    @Body({ schema: dedupCheckInputSchema }) body: DedupInput,
  ) {
    return this.resumes.findDuplicates(getWorkspaceContext(request).workspace.id, body);
  }

  @Get(":id/review/resume")
  @ApiOperation({ operationId: "getWorkspaceResumeReviewFile" })
  @ApiProduces("application/octet-stream", "application/pdf")
  @ApiResponse({
    content: {
      "application/octet-stream": { schema: { format: "binary", type: "string" } },
      "application/pdf": { schema: { format: "binary", type: "string" } },
    },
    status: 200,
  })
  async getReviewResume(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param({ schema: resumeReviewFilePathSchema }) path: FilePath,
  ) {
    const file = await this.resumes.getReviewResume(
      getWorkspaceContext(request).workspace.id,
      path.id,
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

  @Get(":id/resume")
  @ApiOperation({ operationId: "getWorkspaceResumeFile" })
  @ApiProduces("application/octet-stream", "application/pdf")
  @ApiResponse({
    content: {
      "application/octet-stream": { schema: { format: "binary", type: "string" } },
      "application/pdf": { schema: { format: "binary", type: "string" } },
    },
    status: 200,
  })
  @RequireWorkspacePermission("resumeLibrary", "read")
  async getResume(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param({ schema: resumeReviewFilePathSchema }) path: FilePath,
  ) {
    const context = getWorkspaceContext(request);
    const visible = await this.interviews.visibleCreatorIds(
      context.workspace.id,
      context.actor.id,
      context.member.role,
    );
    const file = await this.resumes.getWorkspaceResume(context.workspace.id, path.id, visible);
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
  @ApiOperation({ operationId: "getWorkspaceResumePdfPreview" })
  @ApiProduces("application/pdf")
  @ApiResponse({
    content: { "application/pdf": { schema: { format: "binary", type: "string" } } },
    status: 200,
  })
  @RequireWorkspacePermission("resumeLibrary", "read")
  async getResumePreview(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param({ schema: resumeReviewFilePathSchema }) path: FilePath,
  ) {
    const context = getWorkspaceContext(request);
    const visible = await this.interviews.visibleCreatorIds(
      context.workspace.id,
      context.actor.id,
      context.member.role,
    );
    const file = await this.resumes.getResumePreview(context.workspace.id, path.id, visible);
    response.setHeader("Cache-Control", "private, max-age=300");
    return new StreamableFile(Buffer.from(file.bytes), {
      disposition: `inline; filename="${encodeURIComponent(file.filename)}"`,
      type: "application/pdf",
    });
  }

  @Get(":id/review/resume-preview.pdf")
  @ApiOperation({ operationId: "getWorkspaceResumeReviewPdfPreview" })
  @ApiProduces("application/pdf")
  @ApiResponse({
    content: { "application/pdf": { schema: { format: "binary", type: "string" } } },
    status: 200,
  })
  async getReviewResumePreview(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param({ schema: resumeReviewFilePathSchema }) path: FilePath,
  ) {
    const file = await this.resumes.getResumePreview(
      getWorkspaceContext(request).workspace.id,
      path.id,
      null,
    );
    response.setHeader("Cache-Control", "private, max-age=300");
    return new StreamableFile(Buffer.from(file.bytes), {
      disposition: `inline; filename="${encodeURIComponent(file.filename)}"`,
      type: "application/pdf",
    });
  }

  @Patch(":id/interview-questions")
  @ApiOperation({ operationId: "updateWorkspaceResumeInterviewQuestions" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: interviewQuestionsResponseSchema })
  @RequireWorkspacePermission("resumeLibrary", "update")
  updateInterviewQuestions(
    @Req() request: Request,
    @Param({ schema: resumeReviewFilePathSchema }) path: FilePath,
    @Body({ schema: interviewQuestionsUpdateSchema }) body: InterviewQuestionsInput,
  ) {
    const context = getWorkspaceContext(request);
    return this.interviews.updateInterviewQuestions(
      context.workspace.id,
      context.actor.id,
      context.member.role,
      path.id,
      body.interviewQuestions,
    );
  }

  @Post(":id/retry-parse")
  @HttpCode(200)
  @ApiOperation({ operationId: "retryWorkspaceResumeParse" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: queuedResponseSchema })
  @RequireWorkspacePermission("resumeLibrary", "update")
  async retryParse(
    @Req() request: Request,
    @Param({ schema: resumeReviewFilePathSchema }) path: FilePath,
  ) {
    const context = getWorkspaceContext(request);
    const visible = await this.interviews.visibleCreatorIds(
      context.workspace.id,
      context.actor.id,
      context.member.role,
    );
    return this.resumes.retryParse(context.workspace.id, context.actor.id, path.id, visible);
  }

  @Post(":id/force-reparse")
  @HttpCode(200)
  @ApiOperation({ operationId: "forceWorkspaceResumeReparse" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: queuedResponseSchema })
  @RequireWorkspacePermission("resumeLibrary", "update")
  async forceReparse(
    @Req() request: Request,
    @Param({ schema: resumeReviewFilePathSchema }) path: FilePath,
  ) {
    const context = getWorkspaceContext(request);
    const visible = await this.interviews.visibleCreatorIds(
      context.workspace.id,
      context.actor.id,
      context.member.role,
    );
    return this.resumes.forceReparse(
      context.workspace.id,
      context.actor.id,
      context.member.role,
      path.id,
      visible,
    );
  }
}
