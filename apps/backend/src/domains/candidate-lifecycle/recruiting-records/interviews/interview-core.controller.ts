/* oxlint-disable typescript/consistent-type-imports -- Injected service classes must remain runtime imports so Nest can emit and resolve constructor metadata. */
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
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
import { ResumeCoreService } from "../../resume-library/resumes/resume-core.service.js";
import {
  dedupCheckInputSchema,
  dedupResponseSchema,
  resumeReviewFilePathSchema,
} from "../../resume-library/resumes/resume-core.schemas.js";
import { InterviewCoreService } from "./interview-core.service.js";
import { interviewSummaryResponseSchema } from "./interview-core.schemas.js";

type WorkspacePath = z.infer<typeof workspaceSlugSchema>;
type DedupInput = z.infer<typeof dedupCheckInputSchema>;
type FilePath = z.infer<typeof resumeReviewFilePathSchema>;

@ApiTags("workspace-interviews")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/studio/interviews")
export class InterviewCoreController {
  constructor(
    private readonly interviews: InterviewCoreService,
    private readonly resumes: ResumeCoreService,
  ) {}

  @Get("summary")
  @ApiOperation({ operationId: "getWorkspaceInterviewSummary" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: interviewSummaryResponseSchema })
  @RequireWorkspacePermission("interview", "read")
  summary(@Req() request: Request, @Param({ schema: workspaceSlugSchema }) _path: WorkspacePath) {
    const context = getWorkspaceContext(request);
    return this.interviews.summary(context.workspace.id, context.actor.id, context.member.role);
  }

  @Post("dedup-check")
  @HttpCode(200)
  @ApiOperation({ operationId: "findWorkspaceInterviewResumeDuplicates" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: dedupResponseSchema })
  @RequireWorkspacePermission("interview", "read")
  findDuplicates(
    @Req() request: Request,
    @Param({ schema: workspaceSlugSchema }) _path: WorkspacePath,
    @Body({ schema: dedupCheckInputSchema }) body: DedupInput,
  ) {
    return this.resumes.findDuplicates(getWorkspaceContext(request).workspace.id, body);
  }

  @Get(":id/resume")
  @ApiOperation({ operationId: "getWorkspaceInterviewResumeFile" })
  @ApiProduces("application/octet-stream", "application/pdf")
  @ApiResponse({
    content: {
      "application/octet-stream": { schema: { format: "binary", type: "string" } },
      "application/pdf": { schema: { format: "binary", type: "string" } },
    },
    status: 200,
  })
  @RequireWorkspacePermission("interview", "read")
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
    const file = await this.resumes.getInterviewResume(context.workspace.id, path.id, visible);
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
  @ApiOperation({ operationId: "getWorkspaceInterviewResumePdfPreview" })
  @ApiProduces("application/pdf")
  @ApiResponse({
    content: { "application/pdf": { schema: { format: "binary", type: "string" } } },
    status: 200,
  })
  @RequireWorkspacePermission("interview", "read")
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
    const file = await this.resumes.getInterviewResumePreview(
      context.workspace.id,
      path.id,
      visible,
    );
    response.setHeader("Cache-Control", "private, max-age=300");
    return new StreamableFile(Buffer.from(file.bytes), {
      disposition: `inline; filename="${encodeURIComponent(file.filename)}"`,
      type: "application/pdf",
    });
  }
}
