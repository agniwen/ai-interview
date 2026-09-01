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
  Req,
  Res,
  SerializeOptions,
  StreamableFile,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiConsumes, ApiOperation, ApiProduces, ApiResponse, ApiTags } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { z } from "zod";
import { Readable } from "node:stream";
import {
  RequireWorkspacePermission,
  WorkspaceAccessGuard,
  getWorkspaceContext,
} from "../../../infrastructure/http/workspace-access/index.js";
import {
  chatAttachmentPathSchema,
  chatConversationPathSchema,
  chatWorkspacePathSchema,
  confirmRecruitingActionSchema,
  conversationDetailSchema,
  conversationListSchema,
  jobMatchSchema,
  okSchema,
  patchConversationSchema,
  recruitingActionResultSchema,
  uploadPreflightSchema,
  uploadResponseSchema,
  upsertChatMessageSchema,
  upsertConversationSchema,
} from "./chat.schemas.js";
import { ChatService } from "./chat.service.js";
import type { ChatUploadedFile } from "./chat.service.js";
import { ApiMultipartBody } from "../../../openapi/api-multipart-body.js";

type WorkspacePath = z.infer<typeof chatWorkspacePathSchema>;
type ConversationPath = z.infer<typeof chatConversationPathSchema>;
type AttachmentPath = z.infer<typeof chatAttachmentPathSchema>;
type UpsertConversation = z.infer<typeof upsertConversationSchema>;
type PatchConversation = z.infer<typeof patchConversationSchema>;
type ConfirmAction = z.infer<typeof confirmRecruitingActionSchema>;
type MessageInput = z.infer<typeof upsertChatMessageSchema>;
type UploadPreflight = z.infer<typeof uploadPreflightSchema>;

const binaryResponse = {
  content: {
    "application/octet-stream": { schema: { format: "binary", type: "string" } },
    "application/pdf": { schema: { format: "binary", type: "string" } },
  },
  description: "Attachment body",
  status: 200,
} as const;

@ApiTags("workspace-chat")
@UseGuards(WorkspaceAccessGuard)
@Controller("workspaces/:workspaceSlug/copilot")
export class ChatController {
  constructor(@Inject(ChatService) private readonly chat: ChatService) {}

  @Get("conversations")
  @ApiOperation({ operationId: "listWorkspaceChatConversations" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: conversationListSchema })
  listConversations(
    @Req() request: Request,
    @Param({ schema: chatWorkspacePathSchema }) _path: WorkspacePath,
  ) {
    const context = getWorkspaceContext(request);
    return this.chat.listConversations(context.workspace.id, context.actor.id);
  }

  @Post("conversations")
  @HttpCode(200)
  @ApiOperation({ operationId: "upsertWorkspaceChatConversation" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: okSchema })
  upsertConversation(
    @Req() request: Request,
    @Param({ schema: chatWorkspacePathSchema }) _path: WorkspacePath,
    @Body({ schema: upsertConversationSchema }) body: UpsertConversation,
  ) {
    const context = getWorkspaceContext(request);
    return this.chat.upsertConversation(context.workspace.id, context.actor.id, body);
  }

  @Get("conversations/:id")
  @ApiOperation({ operationId: "getWorkspaceChatConversation" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: conversationDetailSchema })
  getConversation(
    @Req() request: Request,
    @Param({ schema: chatConversationPathSchema }) path: ConversationPath,
  ) {
    const context = getWorkspaceContext(request);
    return this.chat.getConversation(context.workspace.id, context.actor.id, path.id);
  }

  @Patch("conversations/:id")
  @ApiOperation({ operationId: "patchWorkspaceChatConversation" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: okSchema })
  updateConversation(
    @Req() request: Request,
    @Param({ schema: chatConversationPathSchema }) path: ConversationPath,
    @Body({ schema: patchConversationSchema }) body: PatchConversation,
  ) {
    const context = getWorkspaceContext(request);
    return this.chat.updateConversation(context.workspace.id, context.actor.id, path.id, body);
  }

  @Delete("conversations/:id")
  @HttpCode(200)
  @ApiOperation({ operationId: "deleteWorkspaceChatConversation" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: okSchema })
  deleteConversation(
    @Req() request: Request,
    @Param({ schema: chatConversationPathSchema }) path: ConversationPath,
  ) {
    const context = getWorkspaceContext(request);
    return this.chat.deleteConversation(context.workspace.id, context.actor.id, path.id);
  }

  @Post("conversations/:id/actions/confirm")
  @HttpCode(200)
  @ApiOperation({ operationId: "confirmWorkspaceRecruitingCopilotAction" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: recruitingActionResultSchema })
  @RequireWorkspacePermission("resumeLibrary", "update")
  async confirmAction(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param({ schema: chatConversationPathSchema }) path: ConversationPath,
    @Body({ schema: confirmRecruitingActionSchema }) body: ConfirmAction,
  ) {
    const result = await this.chat.confirmAction(getWorkspaceContext(request), path.id, body);
    if (result.status === "failed") {
      response.status(409);
    }
    return result;
  }

  @Post("conversations/:id/messages")
  @HttpCode(200)
  @ApiOperation({ operationId: "persistWorkspaceRecruitingCopilotMessage" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: okSchema })
  persistMessage(
    @Req() request: Request,
    @Param({ schema: chatConversationPathSchema }) path: ConversationPath,
    @Body({ schema: upsertChatMessageSchema }) body: MessageInput,
  ) {
    const context = getWorkspaceContext(request);
    return this.chat.persistMessage(context.workspace.id, context.actor.id, path.id, body.message);
  }

  @Post("uploads/preflight")
  @HttpCode(200)
  @ApiOperation({ operationId: "preflightWorkspaceChatAttachmentUpload" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: uploadResponseSchema.or(z.object({ hit: z.literal(false) })) })
  preflightUpload(
    @Req() request: Request,
    @Param({ schema: chatWorkspacePathSchema }) _path: WorkspacePath,
    @Body({ schema: uploadPreflightSchema }) body: UploadPreflight,
  ) {
    return this.chat.preflightUpload(getWorkspaceContext(request), body);
  }

  @Post("uploads")
  @HttpCode(200)
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  @ApiMultipartBody({ fileField: "file" })
  @ApiOperation({ operationId: "uploadWorkspaceChatAttachment" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: uploadResponseSchema })
  upload(
    @Req() request: Request,
    @Param({ schema: chatWorkspacePathSchema }) _path: WorkspacePath,
    @UploadedFile() file?: ChatUploadedFile,
  ) {
    return this.chat.upload(getWorkspaceContext(request), file);
  }

  @Post("attachments/:id/match-job-description")
  @HttpCode(200)
  @ApiOperation({ operationId: "matchWorkspaceChatAttachmentJobDescription" })
  @ApiResponse({ status: 200 })
  @SerializeOptions({ schema: jobMatchSchema })
  matchAttachment(
    @Req() request: Request,
    @Param({ schema: chatAttachmentPathSchema }) path: AttachmentPath,
  ) {
    return this.chat.matchAttachment(getWorkspaceContext(request), path.id);
  }

  @Get("attachments/:id")
  @ApiProduces("application/octet-stream", "application/pdf")
  @ApiOperation({ operationId: "getWorkspaceChatAttachment" })
  @ApiResponse(binaryResponse)
  async getAttachment(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Param({ schema: chatAttachmentPathSchema }) path: AttachmentPath,
  ) {
    const context = getWorkspaceContext(request);
    const preview = path.id.endsWith("-preview.pdf");
    const file = await this.chat.getAttachment(
      context.workspace.id,
      context.actor.id,
      path.id,
      preview,
    );
    response.setHeader("Cache-Control", "private, max-age=300");
    const options = {
      disposition: `inline; filename="${encodeURIComponent(file.filename)}"`,
      length: file.contentLength,
      type: file.mediaType,
    };
    return file.body instanceof Readable
      ? new StreamableFile(file.body, options)
      : new StreamableFile(Buffer.from(file.body), options);
  }
}
