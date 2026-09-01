import {
  Body,
  Controller,
  Header,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  StreamableFile,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import { Readable } from "node:stream";
import type { z } from "zod";
import {
  RequireWorkspacePermission,
  WorkspaceAccessGuard,
  getWorkspaceContext,
} from "../../../infrastructure/http/workspace-access/index.js";
import {
  interviewToolsWorkspacePathSchema,
  resumeChatRequestSchema,
} from "./interview-tools.schemas.js";
import { ResumeChatService } from "./resume-chat.service.js";

type WorkspacePath = z.infer<typeof interviewToolsWorkspacePathSchema>;
type ResumeChatInput = z.infer<typeof resumeChatRequestSchema>;

function streamableResponse(response: Response) {
  if (!response.body) {
    return new StreamableFile(Buffer.alloc(0), { type: "text/event-stream" });
  }
  const reader = response.body.getReader();
  async function* chunks() {
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
    type: response.headers.get("content-type") ?? "text/event-stream",
  });
}

@ApiTags("workspace-resume-chat")
@UseGuards(WorkspaceAccessGuard)
@Controller("workspaces/:workspaceSlug/copilot/resume-chat")
export class ResumeChatController {
  constructor(@Inject(ResumeChatService) private readonly resumeChat: ResumeChatService) {}

  @Post()
  @HttpCode(200)
  @Header("Cache-Control", "no-cache")
  @Header("X-Accel-Buffering", "no")
  @Header("x-vercel-ai-ui-message-stream", "v1")
  @ApiOperation({ operationId: "streamWorkspaceResumeChat" })
  @ApiResponse({
    content: { "text/event-stream": { schema: { type: "string" } } },
    description: "AI SDK v6 UI message stream",
    status: 200,
  })
  @RequireWorkspacePermission("chat", "create")
  async chat(
    @Req() request: Request,
    @Param({ schema: interviewToolsWorkspacePathSchema }) _path: WorkspacePath,
    @Body({ schema: resumeChatRequestSchema }) body: ResumeChatInput,
  ) {
    return streamableResponse(await this.resumeChat.chat(getWorkspaceContext(request), body));
  }
}
