import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  SerializeOptions,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiMultipartBody } from "../../../openapi/api-multipart-body.js";
import { ApiConsumes, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { Readable } from "node:stream";
import type { z } from "zod";
import {
  WorkspaceAccessGuard,
  getWorkspaceContext,
} from "../../../infrastructure/http/workspace-access/index.js";
import {
  interviewQuestionInputSchema,
  interviewToolsWorkspacePathSchema,
  jobMatchInputSchema,
  jobMatchResponseSchema,
  resumeReviewInputSchema,
} from "./interview-tools.schemas.js";
import { InterviewToolsService } from "./interview-tools.service.js";
import type { InterviewToolsUploadedFile } from "./interview-tools.service.js";

type WorkspacePath = z.infer<typeof interviewToolsWorkspacePathSchema>;
type MatchInput = z.infer<typeof jobMatchInputSchema>;
type QuestionInput = z.infer<typeof interviewQuestionInputSchema>;
type ReviewInput = z.infer<typeof resumeReviewInputSchema>;

const eventStreamResponse = {
  content: { "text/event-stream": { schema: { type: "string" } } },
  description: "AI run event stream",
  status: 200,
} as const;

function streamResponse(stream: ReadableStream<Uint8Array>) {
  async function* chunks() {
    const reader = stream.getReader();
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) {
          return;
        }
        yield Buffer.from(result.value);
      }
    } finally {
      reader.releaseLock();
    }
  }
  return new StreamableFile(Readable.from(chunks()), {
    type: "text/event-stream",
  });
}

@ApiTags("workspace-interview-tools")
@UseGuards(WorkspaceAccessGuard)
@Controller("workspaces/:workspaceSlug/copilot/interview-tools")
export class InterviewToolsController {
  constructor(@Inject(InterviewToolsService) private readonly tools: InterviewToolsService) {}

  @Post("parse-resume")
  @HttpCode(200)
  @UseInterceptors(FileInterceptor("resume"))
  @ApiConsumes("multipart/form-data")
  @ApiMultipartBody({ fileField: "resume" })
  @ApiOperation({ operationId: "parseWorkspaceInterviewResume" })
  @ApiResponse(eventStreamResponse)
  parseResume(
    @Req() request: Request,
    @Param({ schema: interviewToolsWorkspacePathSchema }) _path: WorkspacePath,
    @UploadedFile() file?: InterviewToolsUploadedFile,
  ) {
    const context = getWorkspaceContext(request);
    return streamResponse(this.tools.parseResume(context.workspace.id, context.actor.id, file));
  }

  @Post("match-job-description")
  @HttpCode(200)
  @ApiOperation({ operationId: "matchWorkspaceInterviewJobDescription" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: jobMatchResponseSchema })
  matchJobDescription(
    @Req() request: Request,
    @Param({ schema: interviewToolsWorkspacePathSchema }) _path: WorkspacePath,
    @Body({ schema: jobMatchInputSchema }) body: MatchInput,
  ) {
    return this.tools.matchJobDescription(getWorkspaceContext(request).workspace.id, body);
  }

  @Post("generate-questions")
  @HttpCode(200)
  @ApiOperation({ operationId: "generateWorkspaceInterviewQuestions" })
  @ApiResponse(eventStreamResponse)
  async generateQuestions(
    @Req() request: Request,
    @Param({ schema: interviewToolsWorkspacePathSchema }) _path: WorkspacePath,
    @Body({ schema: interviewQuestionInputSchema }) body: QuestionInput,
  ) {
    return streamResponse(
      await this.tools.generateQuestions(getWorkspaceContext(request).workspace.id, body),
    );
  }

  @Post("generate-review")
  @HttpCode(200)
  @ApiOperation({ operationId: "generateWorkspaceInterviewResumeReview" })
  @ApiResponse(eventStreamResponse)
  async generateReview(
    @Req() request: Request,
    @Param({ schema: interviewToolsWorkspacePathSchema }) _path: WorkspacePath,
    @Body({ schema: resumeReviewInputSchema }) body: ReviewInput,
  ) {
    return streamResponse(
      await this.tools.generateReview(getWorkspaceContext(request).workspace.id, body, false),
    );
  }

  @Post("generate-review-markdown-stream")
  @HttpCode(200)
  @ApiOperation({ operationId: "generateWorkspaceInterviewResumeReviewMarkdown" })
  @ApiResponse(eventStreamResponse)
  async generateReviewMarkdown(
    @Req() request: Request,
    @Param({ schema: interviewToolsWorkspacePathSchema }) _path: WorkspacePath,
    @Body({ schema: resumeReviewInputSchema }) body: ReviewInput,
  ) {
    return streamResponse(
      await this.tools.generateReview(getWorkspaceContext(request).workspace.id, body, true),
    );
  }
}
