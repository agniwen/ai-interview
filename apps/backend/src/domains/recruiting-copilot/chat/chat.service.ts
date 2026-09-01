/* oxlint-disable max-lines -- Conversation persistence, confirmed recruiting actions, and attachment lifecycle form one HTTP feature. */
import { rawBackendEnvironment } from "../../../config/raw-backend-environment.js";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { createHash } from "node:crypto";
import { and, desc, eq, gte, inArray, ne } from "drizzle-orm";
import type { ArcMessage, ArcMessagePart, ArcToolPart } from "@arc/db-schema/ai-message";
import {
  EMPTY_CHAT_CONTEXT_BINDINGS,
  RECRUITING_CONTEXT_JOB_BINDING_META_KEY,
  buildContextJobBindingMessageId,
  deriveChatContextBindingsFromMessages,
  readRecruitingContextJobBinding,
} from "@arc/db-schema/chat-context-bindings";
import {
  chatAttachment,
  chatConversation,
  chatMessage,
  jobDescription,
  resumePoolItem,
  studioInterview,
} from "@arc/db-schema/schema";
import {
  getResumeDocumentExtension,
  getResumeDocumentKind,
  isSupportedResumeDocumentInput,
} from "@arc/shared/resume-documents";
import { isResumeStructuredSourceFileNameCompatible } from "@arc/db-schema/resume-parser-schema";
import { z } from "zod";
import {
  WORKSPACE_DATABASE_PORT,
  WORKSPACE_DOCUMENT_PREVIEW_PORT,
} from "../../../infrastructure/workspace/workspace.ports.js";
import type {
  WorkspaceDatabasePort,
  WorkspaceDocumentPreviewPort,
} from "../../../infrastructure/workspace/workspace.ports.js";
import {
  CANDIDATE_COPILOT_COMMANDS,
  CANDIDATE_DOCUMENT_COMMANDS,
  projectResumeProfile,
} from "../../candidate-lifecycle/public.js";
import type {
  CandidateCopilotCommands,
  CandidateDocumentCommands,
} from "../../candidate-lifecycle/public.js";
import {
  RECRUITING_SCOPE_QUERIES,
  WORKSPACE_AUTHORIZATION_QUERIES,
} from "../../identity-access/public.js";
import type {
  RecruitingScopeQueries,
  WorkspaceAuthorizationContext,
  WorkspaceAuthorizationQueries,
} from "../../identity-access/public.js";
import {
  generateInterviewQuestions,
  generateResumeStructured,
  extractResumeDocument,
  matchJobDescription,
  parseResume,
} from "../tools/resume-analysis.js";
import { MAX_ATTACHMENT_SIZE } from "./chat.schemas.js";
import type {
  confirmRecruitingActionSchema,
  patchConversationSchema,
  uploadPreflightSchema,
  upsertConversationSchema,
} from "./chat.schemas.js";
import { ChatStorage } from "./chat-storage.js";
import { deriveRecruitingActionConfirmations } from "./recruiting-action-confirmation.js";

type UpsertConversationInput = z.infer<typeof upsertConversationSchema>;
type PatchConversationInput = z.infer<typeof patchConversationSchema>;
type ConfirmActionInput = z.infer<typeof confirmRecruitingActionSchema>;
type UploadPreflightInput = z.infer<typeof uploadPreflightSchema>;
interface MessageInput {
  id: string;
  role: ArcMessage["role"];
}
const recruitingProposalSchema = z.object({
  id: z.string().optional(),
  payload: z.record(z.string(), z.json()).optional(),
});
const toolOutputSchema = z
  .object({
    conversationJobBindingProposal: recruitingProposalSchema.optional(),
    proposal: recruitingProposalSchema.optional(),
  })
  .loose();

export interface ChatUploadedFile {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
}

type AttachmentRow = typeof chatAttachment.$inferSelect;
interface RecruitingConfirmation {
  confirmedAt: string;
  jobDescriptionId?: string;
  jobDescriptionName?: string | null;
  status: "confirmed" | "ignored";
}
type ActionResult =
  | {
      actionType: ConfirmActionInput["proposal"]["type"];
      confirmation?: RecruitingConfirmation;
      message: string;
      status: "executed" | "noop";
    }
  | { message: string; status: "failed" };

function cacheEnabled() {
  return !["1", "true", "yes"].includes(
    rawBackendEnvironment.RESUME_PARSE_DISABLE_CACHE?.trim().toLowerCase() ?? "",
  );
}

function cacheCompatible(source: string | null) {
  const provider = rawBackendEnvironment.RESUME_PARSE_PROVIDER?.trim() || "ocr-llm";
  return provider === "aliyun-docmining"
    ? source === "aliyun-docmining"
    : source !== "aliyun-docmining" && source !== "qwen3.5-ocr";
}

function toArcMessage(value: MessageInput): ArcMessage {
  // SAFETY: StandardSchemaValidationPipe validates the required legacy message identity and role;
  // the remaining optional fields are copied from the already-typed AI SDK message payload.
  const record = value as {
    content?: string;
    createdAt?: Date | string;
    id: string;
    metadata?: ArcMessage["metadata"];
    parts?: ArcMessage["parts"];
    role: ArcMessage["role"];
  };
  const result: ArcMessage = {
    id: record.id,
    parts: record.parts ?? (record.content?.trim() ? [{ text: record.content, type: "text" }] : []),
    role: record.role,
  };
  if (record.createdAt) {
    result.createdAt =
      record.createdAt instanceof Date ? record.createdAt.toISOString() : record.createdAt;
  }
  if (record.metadata) {
    result.metadata = record.metadata;
  }
  return result;
}

function isToolPart(part: ArcMessagePart): part is ArcToolPart {
  return part.type === "tool" || part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function confirmationPatch(
  message: ArcMessage,
  proposalId: string,
  confirmation: {
    confirmedAt: string;
    jobDescriptionId?: string;
    jobDescriptionName?: string | null;
    status: "confirmed" | "ignored";
  },
) {
  let changed = false;
  const parts = message.parts.map((part) => {
    if (!isToolPart(part)) {
      return part;
    }
    if (part.state !== "output-available") {
      return part;
    }
    const parsedOutput = toolOutputSchema.safeParse(part.output);
    if (!parsedOutput.success) {
      return part;
    }
    const output = parsedOutput.data;
    const proposal = output.proposal ?? output.conversationJobBindingProposal;
    if (proposal?.id !== proposalId) {
      return part;
    }
    changed = true;
    const patchedProposal = confirmation.jobDescriptionId
      ? {
          ...proposal,
          payload: { ...proposal.payload, jobDescriptionId: confirmation.jobDescriptionId },
        }
      : proposal;
    let patchedOutput = {
      ...output,
      confirmation,
    };
    if (output.proposal) {
      patchedOutput = { ...patchedOutput, proposal: patchedProposal };
    }
    if (output.conversationJobBindingProposal) {
      patchedOutput = {
        ...patchedOutput,
        conversationJobBindingProposal: patchedProposal,
      };
    }
    return {
      ...part,
      output: patchedOutput,
    };
  });
  return changed ? { ...message, parts } : null;
}

function duplicateParsedAttachment(row: AttachmentRow | undefined | null): row is AttachmentRow {
  return Boolean(
    row &&
    row.parsedStatus === "ready" &&
    row.parsedPageCount !== null &&
    row.parsedText !== null &&
    row.parsedTextSource !== null &&
    cacheCompatible(row.parsedTextSource),
  );
}

@Injectable()
export class ChatService {
  constructor(
    @Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort,
    @Inject(WORKSPACE_AUTHORIZATION_QUERIES)
    private readonly access: WorkspaceAuthorizationQueries,
    @Inject(WORKSPACE_DOCUMENT_PREVIEW_PORT)
    private readonly preview: WorkspaceDocumentPreviewPort,
    @Inject(RECRUITING_SCOPE_QUERIES)
    private readonly recruitingScope: RecruitingScopeQueries,
    @Inject(CANDIDATE_COPILOT_COMMANDS)
    private readonly candidateCopilot: CandidateCopilotCommands,
    @Inject(CANDIDATE_DOCUMENT_COMMANDS)
    private readonly candidateDocuments: CandidateDocumentCommands,
    @Inject(ChatStorage) private readonly storage: ChatStorage,
  ) {}

  async listConversations(organizationId: string, userId: string) {
    const rows = await this.database
      .select({
        createdAt: chatConversation.createdAt,
        id: chatConversation.id,
        isTitleGenerating: chatConversation.isTitleGenerating,
        title: chatConversation.title,
        updatedAt: chatConversation.updatedAt,
      })
      .from(chatConversation)
      .where(
        and(
          eq(chatConversation.userId, userId),
          eq(chatConversation.organizationId, organizationId),
        ),
      )
      .orderBy(desc(chatConversation.createdAt));
    return {
      conversations: rows.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
      })),
    };
  }

  async upsertConversation(organizationId: string, userId: string, input: UpsertConversationInput) {
    const owner = await this.owner(organizationId, userId, input.id);
    if (owner === "forbidden") {
      throw new ForbiddenException("Forbidden", { errorCode: "CHAT_CONVERSATION_FORBIDDEN" });
    }
    const now = new Date();
    if (owner === "not_found") {
      await this.database.insert(chatConversation).values({
        createdAt: input.createdAt ? new Date(input.createdAt) : now,
        id: input.id,
        isTitleGenerating: input.isTitleGenerating ?? false,
        jobDescription: input.jobDescription ?? "",
        jobDescriptionConfig: input.jobDescriptionConfig ?? null,
        organizationId,
        resumeImports: input.resumeImports ?? {},
        title: input.title ?? "",
        updatedAt: now,
        userId,
      });
      return { ok: true as const };
    }
    await this.updateConversation(organizationId, userId, input.id, input);
    return { ok: true as const };
  }

  async getConversation(organizationId: string, userId: string, id: string) {
    const [row] = await this.database
      .select()
      .from(chatConversation)
      .where(
        and(
          eq(chatConversation.id, id),
          eq(chatConversation.userId, userId),
          eq(chatConversation.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!row) {
      throw new NotFoundException("Not Found", { errorCode: "CHAT_CONVERSATION_NOT_FOUND" });
    }
    const messages = await this.database
      .select({ content: chatMessage.content })
      .from(chatMessage)
      .where(eq(chatMessage.conversationId, id))
      .orderBy(chatMessage.createdAt);
    return {
      conversation: {
        createdAt: row.createdAt.toISOString(),
        id: row.id,
        isTitleGenerating: row.isTitleGenerating,
        jobDescription: row.jobDescription,
        jobDescriptionConfig: row.jobDescriptionConfig ?? null,
        messages: messages.map((message) => message.content),
        resumeImports: row.resumeImports ?? {},
        title: row.title,
        updatedAt: row.updatedAt.toISOString(),
      },
    };
  }

  async updateConversation(
    organizationId: string,
    userId: string,
    id: string,
    input: PatchConversationInput,
  ) {
    const owner = await this.owner(organizationId, userId, id);
    if (owner === "forbidden") {
      throw new ForbiddenException("Forbidden", { errorCode: "CHAT_CONVERSATION_FORBIDDEN" });
    }
    if (owner === "not_found") {
      await this.database.insert(chatConversation).values({
        id,
        isTitleGenerating: input.isTitleGenerating ?? false,
        jobDescription: input.jobDescription ?? "",
        jobDescriptionConfig: input.jobDescriptionConfig ?? null,
        organizationId,
        resumeImports: input.resumeImports ?? {},
        title: input.title ?? "",
        userId,
      });
      return { ok: true as const };
    }
    await this.database
      .update(chatConversation)
      .set({
        ...(input.isTitleGenerating !== undefined && {
          isTitleGenerating: input.isTitleGenerating,
        }),
        ...(input.jobDescription !== undefined && { jobDescription: input.jobDescription }),
        ...(input.jobDescriptionConfig !== undefined && {
          jobDescriptionConfig: input.jobDescriptionConfig,
        }),
        ...(input.resumeImports !== undefined && { resumeImports: input.resumeImports }),
        ...(input.title !== undefined && { title: input.title }),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(chatConversation.id, id),
          eq(chatConversation.userId, userId),
          eq(chatConversation.organizationId, organizationId),
        ),
      );
    return { ok: true as const };
  }

  async deleteConversation(organizationId: string, userId: string, id: string) {
    const deleted = await this.database
      .delete(chatConversation)
      .where(
        and(
          eq(chatConversation.id, id),
          eq(chatConversation.userId, userId),
          eq(chatConversation.organizationId, organizationId),
        ),
      )
      .returning({ id: chatConversation.id });
    if (deleted.length === 0) {
      throw new NotFoundException("Not Found", { errorCode: "CHAT_CONVERSATION_NOT_FOUND" });
    }
    return { ok: true as const };
  }

  async persistMessage(
    organizationId: string,
    userId: string,
    conversationId: string,
    message: MessageInput,
  ) {
    await this.requireOwner(organizationId, userId, conversationId);
    await this.upsertMessage(organizationId, conversationId, toArcMessage(message));
    return { ok: true as const };
  }

  async preflightUpload(context: WorkspaceAuthorizationContext, input: UploadPreflightInput) {
    const existing = cacheEnabled() ? await this.findAttachmentByHash(input.hash) : null;
    if (!duplicateParsedAttachment(existing)) {
      return { hit: false as const };
    }
    return {
      hit: true as const,
      ...(await this.cloneAttachment(context, existing, {
        filename: input.filename,
        mediaType: input.mediaType,
        size: input.size,
      })),
    };
  }

  // oxlint-disable-next-line complexity -- Upload validation, dedupe, storage, parsing, and persistence remain one legacy atomic contract.
  async upload(context: WorkspaceAuthorizationContext, file: ChatUploadedFile | undefined) {
    if (!file) {
      throw new BadRequestException("Missing file", { errorCode: "CHAT_FILE_REQUIRED" });
    }
    if (
      !isSupportedResumeDocumentInput({ fileName: file.originalname, mediaType: file.mimetype })
    ) {
      throw new UnsupportedMediaTypeException("Unsupported media type", {
        errorCode: "CHAT_FILE_TYPE_UNSUPPORTED",
      });
    }
    if (file.size <= 0 || file.size > MAX_ATTACHMENT_SIZE) {
      throw new PayloadTooLargeException("File too large", { errorCode: "CHAT_FILE_TOO_LARGE" });
    }
    const bytes = new Uint8Array(file.buffer);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const existing = cacheEnabled() ? await this.findAttachmentByHash(hash) : null;
    if (duplicateParsedAttachment(existing)) {
      return this.cloneAttachment(context, existing, {
        filename: file.originalname.slice(0, 255) || "attachment.pdf",
        mediaType: file.mimetype,
        size: file.size,
      });
    }
    const storageKey = this.storage.attachmentKey(
      hash,
      getResumeDocumentExtension({ fileName: file.originalname, mediaType: file.mimetype }),
    );
    const [uploadResult, parseResult] = await Promise.allSettled([
      this.storage.put(storageKey, bytes, file.mimetype),
      extractResumeDocument({
        bytes: new Uint8Array(bytes),
        fileName: file.originalname,
        mediaType: file.mimetype,
      }),
    ]);
    if (uploadResult.status === "rejected") {
      throw uploadResult.reason;
    }
    const now = new Date();
    const id = crypto.randomUUID();
    const parsed = parseResult.status === "fulfilled" ? parseResult.value : null;
    const parseError = parseResult.status === "rejected" ? String(parseResult.reason) : null;
    await this.candidateDocuments.create({
      contentHash: hash,
      filename: file.originalname.slice(0, 255) || "attachment.pdf",
      id,
      mediaType: file.mimetype,
      organizationId: context.workspace.id,
      parsedAt: now,
      parsedError: parsed ? null : parseError?.slice(0, 500),
      parsedPageCount: parsed?.pageCount ?? null,
      parsedStatus: parsed ? "ready" : "failed",
      parsedStructured: null,
      parsedText: parsed?.text ?? null,
      parsedTextSource: parsed?.textSource ?? null,
      size: file.size,
      storageKey,
      userId: context.actor.id,
    });
    return this.uploadResponse(context.workspace.slug, {
      id,
      parsedPageCount: parsed?.pageCount ?? null,
      parsedStatus: parsed ? "ready" : "failed",
      parsedStructured: null,
      parsedText: parsed?.text ?? null,
      parsedTextSource: parsed?.textSource ?? null,
    });
  }

  async getAttachment(organizationId: string, userId: string, idValue: string, preview: boolean) {
    const id = preview ? idValue.replace(/-preview\.pdf$/u, "") : idValue;
    const attachment = await this.userAttachment(organizationId, userId, id);
    if (!attachment) {
      throw new NotFoundException("Not Found", { errorCode: "CHAT_ATTACHMENT_NOT_FOUND" });
    }
    if (!preview) {
      const object = await this.storage.getStream(attachment.storageKey);
      if (!object) {
        throw new NotFoundException("Not Found", { errorCode: "CHAT_ATTACHMENT_NOT_FOUND" });
      }
      return {
        ...object,
        filename: attachment.filename,
        mediaType: object.contentType ?? attachment.mediaType,
      };
    }
    if (
      getResumeDocumentKind({ fileName: attachment.filename, mediaType: attachment.mediaType }) !==
      "pptx"
    ) {
      throw new UnsupportedMediaTypeException("仅支持 PPTX 文件预览。", {
        errorCode: "CHAT_ATTACHMENT_PREVIEW_UNSUPPORTED",
      });
    }
    const object = await this.storage.getBytes(attachment.storageKey);
    if (!object) {
      throw new NotFoundException("Not Found", { errorCode: "CHAT_ATTACHMENT_NOT_FOUND" });
    }
    const bytes = await this.preview.pptxToPdf({
      bytes: object.bytes,
      filename: attachment.filename,
    });
    return {
      body: Buffer.from(bytes),
      contentLength: bytes.byteLength,
      filename: attachment.filename.replace(/\.pptx$/iu, ".pdf"),
      mediaType: "application/pdf",
    };
  }

  async matchAttachment(context: WorkspaceAuthorizationContext, id: string) {
    const attachment = await this.userAttachment(context.workspace.id, context.actor.id, id);
    if (!attachment) {
      throw new NotFoundException("Not Found", { errorCode: "CHAT_ATTACHMENT_NOT_FOUND" });
    }
    const structured = attachment.parsedStructured;
    let profile = null;
    if (
      cacheCompatible(attachment.parsedTextSource) &&
      structured &&
      isResumeStructuredSourceFileNameCompatible(structured, attachment.filename)
    ) {
      profile = projectResumeProfile(structured);
    }
    if (!profile && cacheCompatible(attachment.parsedTextSource) && attachment.parsedText?.trim()) {
      const document = {
        images: [],
        pageCount: attachment.parsedPageCount ?? 1,
        text: attachment.parsedText,
        textSource: attachment.parsedTextSource ?? ("html-text" as const),
      };
      const generatedStructured = await generateResumeStructured(document, attachment.filename);
      await this.updateStructuredByHash(
        attachment.contentHash,
        generatedStructured,
        attachment.filename,
      );
      profile = projectResumeProfile(generatedStructured);
    }
    if (!profile) {
      const object = await this.storage.getBytes(attachment.storageKey);
      if (object) {
        const parsed = await parseResume({
          bytes: object.bytes,
          fileName: attachment.filename,
          mediaType: object.contentType || attachment.mediaType,
        });
        await this.updateParseByHash(attachment.contentHash, parsed);
        profile = parsed.resumeProfile;
      }
    }
    if (!profile) {
      throw new UnprocessableEntityException("简历解析缓存不可用，请重新上传简历后再试。", {
        errorCode: "CHAT_ATTACHMENT_PARSE_UNAVAILABLE",
      });
    }
    const jobs = await this.database
      .select({ id: jobDescription.id, name: jobDescription.name, prompt: jobDescription.prompt })
      .from(jobDescription)
      .where(
        and(
          eq(jobDescription.organizationId, context.workspace.id),
          eq(jobDescription.lifecycleStatus, "published"),
        ),
      );
    return matchJobDescription(profile, jobs);
  }

  async confirmAction(
    context: WorkspaceAuthorizationContext,
    conversationId: string,
    input: ConfirmActionInput,
  ): Promise<ActionResult> {
    await this.requireOwner(context.workspace.id, context.actor.id, conversationId);
    if (input.decision === "ignore") {
      const confirmation = await this.stampConfirmation(
        context.workspace.id,
        conversationId,
        input.proposal.id,
        "ignored",
      );
      return {
        actionType: input.proposal.type,
        confirmation,
        message: "已忽略该动作建议。",
        status: "executed",
      };
    }
    if (input.proposal.type === "bind_candidate_to_job") {
      return this.bindToJob(context, conversationId, input.proposal, "resume_record");
    }
    if (input.proposal.type === "bind_pool_item_to_job") {
      return this.bindToJob(context, conversationId, input.proposal, "resume_pool_item");
    }
    if (input.proposal.type === "advance_candidate_stage") {
      return this.advanceCandidate(context, input.proposal);
    }
    return this.generateQuestionsAction(context, input.proposal);
  }

  async loadContextBindings(organizationId: string, conversationId: string) {
    const [conversation] = await this.database
      .select({ id: chatConversation.id })
      .from(chatConversation)
      .where(
        and(
          eq(chatConversation.id, conversationId),
          eq(chatConversation.organizationId, organizationId),
        ),
      )
      .limit(1);
    if (!conversation) {
      return EMPTY_CHAT_CONTEXT_BINDINGS;
    }
    const messages = await this.database
      .select({ content: chatMessage.content })
      .from(chatMessage)
      .where(eq(chatMessage.conversationId, conversationId))
      .orderBy(chatMessage.createdAt);
    const contents = messages.map((row) => row.content);
    const bindings = deriveChatContextBindingsFromMessages(contents);
    const actionConfirmations = deriveRecruitingActionConfirmations(contents);
    return Object.keys(actionConfirmations).length > 0
      ? { ...bindings, actionConfirmations }
      : bindings;
  }

  async deleteMessagesFrom(
    organizationId: string,
    userId: string,
    conversationId: string,
    messageId: string,
  ) {
    await this.requireOwner(organizationId, userId, conversationId);
    const [target] = await this.database
      .select({ createdAt: chatMessage.createdAt })
      .from(chatMessage)
      .where(and(eq(chatMessage.conversationId, conversationId), eq(chatMessage.id, messageId)))
      .limit(1);
    if (!target) {
      return;
    }
    await this.database
      .delete(chatMessage)
      .where(
        and(
          eq(chatMessage.conversationId, conversationId),
          gte(chatMessage.createdAt, target.createdAt),
        ),
      );
  }

  async conversationOwned(organizationId: string, userId: string, id: string) {
    return (await this.owner(organizationId, userId, id)) === "ok";
  }

  private async owner(organizationId: string, userId: string, id: string) {
    const [row] = await this.database
      .select({ organizationId: chatConversation.organizationId, userId: chatConversation.userId })
      .from(chatConversation)
      .where(eq(chatConversation.id, id))
      .limit(1);
    if (!row) {
      return "not_found" as const;
    }
    if (row.organizationId !== organizationId || row.userId !== userId) {
      return "forbidden" as const;
    }
    return "ok" as const;
  }

  private async requireOwner(organizationId: string, userId: string, id: string) {
    const owner = await this.owner(organizationId, userId, id);
    if (owner === "not_found") {
      throw new NotFoundException("Not Found", { errorCode: "CHAT_CONVERSATION_NOT_FOUND" });
    }
    if (owner === "forbidden") {
      throw new ForbiddenException("Forbidden", { errorCode: "CHAT_CONVERSATION_FORBIDDEN" });
    }
  }

  private async upsertMessage(organizationId: string, conversationId: string, message: ArcMessage) {
    const now = new Date();
    await this.database
      .insert(chatMessage)
      .values({
        content: message,
        conversationId,
        id: message.id,
        organizationId,
        role: message.role,
      })
      .onConflictDoUpdate({
        set: { content: message, role: message.role, updatedAt: now },
        target: chatMessage.id,
      });
    await this.database
      .update(chatConversation)
      .set({ updatedAt: now })
      .where(eq(chatConversation.id, conversationId));
  }

  private async findAttachmentByHash(hash: string) {
    const [row] = await this.database
      .select()
      .from(chatAttachment)
      .where(
        and(
          eq(chatAttachment.contentHash, hash),
          ne(chatAttachment.parsedStatus, "failed"),
          ne(chatAttachment.storageKey, ""),
        ),
      )
      .orderBy(desc(chatAttachment.parsedAt), desc(chatAttachment.createdAt))
      .limit(1);
    return row ?? null;
  }

  private async cloneAttachment(
    context: WorkspaceAuthorizationContext,
    source: AttachmentRow,
    input: { filename: string; mediaType: string; size: number },
  ) {
    const id = crypto.randomUUID();
    const structured =
      source.parsedStructured &&
      isResumeStructuredSourceFileNameCompatible(source.parsedStructured, input.filename)
        ? source.parsedStructured
        : null;
    await this.candidateDocuments.create({
      contentHash: source.contentHash,
      filename: input.filename.slice(0, 255),
      id,
      mediaType: input.mediaType,
      organizationId: context.workspace.id,
      parsedAt: source.parsedAt,
      parsedError: source.parsedError,
      parsedPageCount: source.parsedPageCount,
      parsedStatus: source.parsedStatus,
      parsedStructured: structured,
      parsedText: source.parsedText,
      parsedTextSource: source.parsedTextSource,
      size: input.size,
      storageKey: source.storageKey,
      userId: context.actor.id,
    });
    return this.uploadResponse(context.workspace.slug, {
      id,
      parsedPageCount: source.parsedPageCount,
      parsedStatus: source.parsedStatus,
      parsedStructured: structured,
      parsedText: source.parsedText,
      parsedTextSource: source.parsedTextSource,
    });
  }

  private uploadResponse(
    slug: string,
    input: {
      id: string;
      parsedPageCount: number | null;
      parsedStatus: string;
      parsedStructured: unknown;
      parsedText: string | null;
      parsedTextSource: string | null;
    },
  ) {
    const parsed =
      input.parsedStatus === "ready" &&
      input.parsedPageCount !== null &&
      input.parsedText !== null &&
      input.parsedTextSource !== null
        ? {
            pageCount: input.parsedPageCount,
            structured: input.parsedStructured,
            text: input.parsedText,
            textSource: input.parsedTextSource,
          }
        : null;
    const response = {
      id: input.id,
      parseStatus: input.parsedStatus,
      url: `/api/w/${slug}/chat/attachments/${input.id}`,
    };
    return parsed ? { ...response, parsed } : response;
  }

  private async userAttachment(organizationId: string, userId: string, id: string) {
    const [row] = await this.database
      .select()
      .from(chatAttachment)
      .where(
        and(
          eq(chatAttachment.id, id),
          eq(chatAttachment.userId, userId),
          eq(chatAttachment.organizationId, organizationId),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  private async updateStructuredByHash(
    hash: string | null,
    structured: NonNullable<AttachmentRow["parsedStructured"]>,
    filename: string,
  ) {
    if (!hash) {
      return;
    }
    await this.candidateDocuments.storeStructuredParseByHash({
      contentHash: hash,
      filename,
      parsedStructured: structured,
    });
  }

  private async updateParseByHash(
    hash: string | null,
    parsed: Awaited<ReturnType<typeof parseResume>>,
  ) {
    if (!hash) {
      return;
    }
    await this.candidateDocuments.completeParseByHash({
      contentHash: hash,
      parsedAt: new Date(),
      parsedPageCount: parsed.pageCount,
      parsedStructured: parsed.structured,
      parsedText: parsed.text,
      parsedTextSource: parsed.textSource,
    });
  }

  private async stampConfirmation(
    organizationId: string,
    conversationId: string,
    proposalId: string,
    status: "confirmed" | "ignored",
    job?: { id: string; name: string | null },
  ) {
    const confirmation: RecruitingConfirmation = { confirmedAt: new Date().toISOString(), status };
    if (job) {
      confirmation.jobDescriptionId = job.id;
      confirmation.jobDescriptionName = job.name;
    }
    const rows = await this.database
      .select({ content: chatMessage.content })
      .from(chatMessage)
      .where(eq(chatMessage.conversationId, conversationId))
      .orderBy(chatMessage.createdAt);
    for (const row of rows) {
      const patched = confirmationPatch(row.content, proposalId, confirmation);
      if (patched) {
        await this.upsertMessage(organizationId, conversationId, patched);
      }
    }
    return confirmation;
  }

  private async bindToJob(
    context: WorkspaceAuthorizationContext,
    conversationId: string,
    proposal: Extract<
      ConfirmActionInput["proposal"],
      { type: "bind_candidate_to_job" | "bind_pool_item_to_job" }
    >,
    kind: "resume_pool_item" | "resume_record",
  ): Promise<ActionResult> {
    const jobId = proposal.payload.jobDescriptionId;
    if (!jobId) {
      return { message: "请先选择要绑定的岗位。", status: "failed" };
    }
    const [job] = await this.database
      .select({ id: jobDescription.id, name: jobDescription.name })
      .from(jobDescription)
      .where(
        and(eq(jobDescription.id, jobId), eq(jobDescription.organizationId, context.workspace.id)),
      )
      .limit(1);
    if (!job) {
      return { message: "岗位不存在或不属于当前 workspace。", status: "failed" };
    }
    const recordId =
      proposal.type === "bind_candidate_to_job"
        ? proposal.payload.resumeRecordId
        : proposal.payload.poolItemId.trim().replace(/^pool:/u, "");
    const visible = await this.recruitingScope.visibleCreatorIds(
      context.workspace.id,
      context.actor.id,
      context.member.role,
    );
    const exists =
      kind === "resume_record"
        ? await this.database
            .select({ id: studioInterview.id })
            .from(studioInterview)
            .where(
              and(
                eq(studioInterview.id, recordId),
                eq(studioInterview.organizationId, context.workspace.id),
                visible ? inArray(studioInterview.createdBy, visible) : undefined,
              ),
            )
            .limit(1)
        : await this.database
            .select({ id: resumePoolItem.id })
            .from(resumePoolItem)
            .where(
              and(
                eq(resumePoolItem.id, recordId),
                eq(resumePoolItem.organizationId, context.workspace.id),
                eq(resumePoolItem.status, "active"),
                visible ? inArray(resumePoolItem.createdBy, visible) : undefined,
              ),
            )
            .limit(1);
    if (exists.length === 0) {
      return {
        message: kind === "resume_record" ? "候选人记录不存在。" : "人才库记录不存在或无权访问。",
        status: "failed",
      };
    }
    const messageId = buildContextJobBindingMessageId(kind, recordId);
    const [existing] = await this.database
      .select({ content: chatMessage.content })
      .from(chatMessage)
      .where(and(eq(chatMessage.conversationId, conversationId), eq(chatMessage.id, messageId)))
      .limit(1);
    const previous = existing ? readRecruitingContextJobBinding(existing.content) : null;
    const noop = previous?.jobDescriptionId === job.id;
    if (!noop) {
      await this.upsertMessage(context.workspace.id, conversationId, {
        id: messageId,
        metadata: {
          [RECRUITING_CONTEXT_JOB_BINDING_META_KEY]: {
            jobDescriptionId: job.id,
            jobDescriptionName: job.name,
            kind,
            recordId,
          },
        },
        parts: [
          {
            text: `已在本对话中将该${kind === "resume_record" ? "候选人" : "人才库条目"}关联到「${job.name}」（仅影响本轮分析，未改招聘数据）。`,
            type: "text",
          },
        ],
        role: "assistant",
      });
    }
    const confirmation = await this.stampConfirmation(
      context.workspace.id,
      conversationId,
      proposal.id,
      "confirmed",
      job,
    );
    return {
      actionType: proposal.type,
      confirmation,
      message: noop
        ? "本对话已将该记录关联到该岗位（仅影响本轮分析，未改招聘数据）。"
        : "已在本对话中将该记录关联到所选岗位（仅影响本轮分析，未改招聘数据）。",
      status: noop ? "noop" : "executed",
    };
  }

  private async advanceCandidate(
    context: WorkspaceAuthorizationContext,
    proposal: Extract<ConfirmActionInput["proposal"], { type: "advance_candidate_stage" }>,
  ): Promise<ActionResult> {
    let targetPermission: { action: string; resource: string } | null = null;
    if (proposal.payload.pipelineStage === "human_interview") {
      targetPermission = { action: "create", resource: "humanInterview" };
    } else if (proposal.payload.pipelineStage === "offer") {
      targetPermission = { action: "create", resource: "offer" };
    }
    if (targetPermission && !(await this.access.authorize(context, targetPermission))) {
      return { message: "没有权限执行目标阶段流转。", status: "failed" };
    }
    const result = await this.candidateCopilot.transitionCandidate({
      actorId: context.actor.id,
      closedMeta: proposal.payload.closedMeta,
      closedReason: proposal.payload.closedReason,
      organizationId: context.workspace.id,
      outcome: proposal.payload.outcome,
      proposalId: proposal.id,
      proposalTitle: proposal.title,
      reactivationReason: proposal.payload.reactivationReason,
      resumeRecordId: proposal.payload.resumeRecordId,
      targetStage: proposal.payload.pipelineStage,
    });
    if (result.kind === "not_found") {
      return { message: "候选人记录不存在。", status: "failed" };
    }
    if (result.kind === "invalid") {
      return { message: result.message, status: "failed" };
    }
    if (result.kind === "noop") {
      return {
        actionType: "advance_candidate_stage",
        message: "候选人已经处于目标阶段。",
        status: "noop",
      };
    }
    return {
      actionType: "advance_candidate_stage",
      message: "已推进候选人阶段。",
      status: "executed",
    };
  }

  private async generateQuestionsAction(
    context: WorkspaceAuthorizationContext,
    proposal: Extract<ConfirmActionInput["proposal"], { type: "generate_interview_questions" }>,
  ): Promise<ActionResult> {
    const [existing] = await this.database
      .select({ resumeProfile: studioInterview.resumeProfile })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, proposal.payload.resumeRecordId),
          eq(studioInterview.organizationId, context.workspace.id),
        ),
      )
      .limit(1);
    if (!existing) {
      return { message: "候选人记录不存在。", status: "failed" };
    }
    const { resumeProfile } = existing;
    const { interviewQuestions: proposedQuestions } = proposal.payload;
    if (!(proposedQuestions?.length || resumeProfile)) {
      return { message: "候选人没有可用于生成面试题的结构化简历。", status: "failed" };
    }
    try {
      let questions;
      if (proposedQuestions?.length) {
        questions = proposedQuestions.map((question, index) => ({
          ...question,
          order: index + 1,
          question: question.question.trim(),
        }));
      } else if (resumeProfile) {
        questions = await generateInterviewQuestions(resumeProfile);
      } else {
        return { message: "候选人没有可用于生成面试题的结构化简历。", status: "failed" };
      }
      await this.candidateCopilot.draftInterviewQuestions({
        actorId: context.actor.id,
        organizationId: context.workspace.id,
        proposalId: proposal.id,
        proposalTitle: proposal.title,
        questions,
        resumeRecordId: proposal.payload.resumeRecordId,
      });
      return {
        actionType: "generate_interview_questions",
        message: `已生成 ${questions.length} 道面试题草稿。`,
        status: "executed",
      };
    } catch {
      return { message: "面试题生成失败。", status: "failed" };
    }
  }
}
