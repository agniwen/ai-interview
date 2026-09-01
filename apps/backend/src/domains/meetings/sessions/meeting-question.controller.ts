/* oxlint-disable no-nested-ternary, typescript/consistent-type-imports, unicorn/no-nested-ternary -- The response normalizer mirrors legacy envelopes; Nest also needs its service class at runtime. */
import {
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  SerializeOptions,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { z } from "zod";
import {
  WorkspaceAccessGuard,
  getWorkspaceContext,
} from "../../../infrastructure/http/workspace-access/index.js";
import { MeetingQuestionService } from "./meeting-question.service.js";
import {
  createMeetingQuestionSchema,
  createMeetingQuestionThreadSchema,
  meetingNestedPathSchema,
  meetingPathSchema,
  meetingQuestionExchangeSchema,
  meetingQuestionThreadSchema,
  meetingQuestionThreadSummarySchema,
  meetingQuestionThreadsResponseSchema,
} from "./meeting.schemas.js";
type Path = z.infer<typeof meetingPathSchema>;
type Nested = z.infer<typeof meetingNestedPathSchema>;
type ThreadInput = z.infer<typeof createMeetingQuestionThreadSchema>;
type QuestionInput = z.infer<typeof createMeetingQuestionSchema>;
@ApiTags("workspace-meeting-questions")
@UseGuards(WorkspaceAccessGuard)
@Controller("api/w/:slug/meetings/:id/questions")
export class MeetingQuestionController {
  constructor(private readonly questions: MeetingQuestionService) {}
  private context(request: Request) {
    return getWorkspaceContext(request);
  }
  @Get()
  @ApiOperation({ operationId: "listWorkspaceMeetingQuestionThreads" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: meetingQuestionThreadsResponseSchema })
  async list(@Req() request: Request, @Param({ schema: meetingPathSchema }) path: Path) {
    const c = this.context(request);
    return {
      records: await this.questions.list(c.workspace.id, c.actor.id, c.member.role, path.id),
    };
  }
  @Post()
  @ApiOperation({ operationId: "createWorkspaceMeetingQuestionThread" })
  @ApiResponse({ status: 201 })
  @SerializeOptions({ schema: meetingQuestionThreadSummarySchema })
  create(
    @Req() request: Request,
    @Param({ schema: meetingPathSchema }) path: Path,
    @Body({ schema: createMeetingQuestionThreadSchema }) body: ThreadInput,
  ) {
    const c = this.context(request);
    return this.questions.create(c.workspace.id, c.actor.id, c.member.role, path.id, body);
  }
  @Get(":threadId")
  @ApiOperation({ operationId: "getWorkspaceMeetingQuestionThread" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: meetingQuestionThreadSchema })
  get(@Req() request: Request, @Param({ schema: meetingNestedPathSchema }) path: Nested) {
    const c = this.context(request);
    return this.questions.get(
      c.workspace.id,
      c.actor.id,
      c.member.role,
      path.id,
      path.threadId ?? "",
    );
  }
  @Post(":threadId/messages")
  @HttpCode(202)
  @ApiOperation({ operationId: "askWorkspaceMeetingQuestion" })
  @ApiResponse({ status: 202 })
  @SerializeOptions({ schema: meetingQuestionExchangeSchema })
  async ask(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param({ schema: meetingNestedPathSchema }) path: Nested,
    @Body({ schema: createMeetingQuestionSchema }) body: QuestionInput,
  ) {
    const c = this.context(request);
    const result = await this.questions.ask(
      c.workspace.id,
      c.actor.id,
      c.member.role,
      path.id,
      path.threadId ?? "",
      body,
    );
    const parsedStatus = z.string().safeParse(result);
    if (!parsedStatus.success) {
      return result;
    }
    const status = parsedStatus.data;
    if (status === "rate-limited") {
      response.setHeader("Retry-After", "60");
      throw new HttpException("提问过于频繁，请稍后再试", HttpStatus.TOO_MANY_REQUESTS);
    }
    if (status === "not-found") {
      throw new HttpException("Meeting Question thread 不存在", HttpStatus.NOT_FOUND);
    }
    const message =
      status === "conflict"
        ? "requestId 已用于另一条 Meeting Question"
        : status === "not-ready"
          ? "当前权威会议转录尚未就绪"
          : status === "active-question"
            ? "请等待当前问题回答完成后再继续提问"
            : "当前提问线程已达问题数量上限，请创建线程";
    throw new ConflictException(message);
  }
}
