import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from "@nestjs/common";
import { toAISdkStream } from "@mastra/ai-sdk";
import type { UIMessage } from "ai";
import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  safeValidateUIMessages,
} from "ai";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { EMPTY_CHAT_CONTEXT_BINDINGS } from "@arc/db-schema/chat-context-bindings";
import { member, recruitingGroupMember, studioInterview } from "@arc/db-schema/schema";
import { WORKSPACE_DATABASE_PORT } from "../workspace.ports.js";
import type { WorkspaceRequestContext, WorkspaceDatabasePort } from "../workspace.ports.js";
import { ChatService } from "../chat/chat.service.js";
import type { resumeChatRequestSchema } from "./interview-tools.schemas.js";
import { createRecruitingCopilotAgent, getRecruitingMastra } from "./recruiting-copilot.js";
import type { RecruitingVisibilityScope } from "./recruiting-copilot.js";

type ResumeChatInput = z.infer<typeof resumeChatRequestSchema>;
interface NativeResumeApproval {
  approved: boolean;
  reason?: string;
}
type MessageValidation = Awaited<ReturnType<typeof safeValidateUIMessages<UIMessage>>>;

function validatedUserMessages(result: MessageValidation) {
  if (!result.success || result.data.some((message) => message.role === "system")) {
    throw new BadRequestException("聊天消息格式无效。", {
      errorCode: "RESUME_CHAT_MESSAGES_INVALID",
    });
  }
  return result.data;
}

const approvalPartSchema = z.object({
  approval: z
    .object({
      approved: z.boolean().optional(),
      id: z.string().min(1).optional(),
      reason: z.string().optional(),
    })
    .optional(),
  state: z.string().optional(),
  type: z.string(),
});

const NEGATED_BINDING = /(?:不(?:要|需要)?|暂不|先不|无需|别)[^。！？?]{0,12}(?:绑定|关联)/u;
const BINDING_QUESTION = /(?:是否|能否|可否|要不要|怎么|如何)[^。！？?]{0,30}(?:绑定|关联)/u;
const DIRECT_BINDING =
  /(?:请帮我|请|帮我|直接|现在|同意|确认|可以|要|需要)\s*(?:把[^，,。；;]{0,24})?(?:绑定|关联)/u;
const SHORT_AFFIRMATIVE = /^(?:好|好的|要|需要|可以|同意|确认|是|行|继续)$/u;
const PRIOR_BINDING_QUESTION =
  /(?:是否|要不要|需要)[^。！？?]{0,30}(?:绑定|关联)|(?:绑定|关联)[^。！？?]{0,12}[吗么？?]/u;
const ROLE_RANK = new Map([
  ["viewer", 0],
  ["hr", 1],
  ["recruitingLead", 2],
  ["recruitingSupervisor", 3],
]);

function messageText(message: UIMessage) {
  return message.parts
    .filter(
      (part): part is Extract<(typeof message.parts)[number], { type: "text" }> =>
        part.type === "text",
    )
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function hasBindingConsent(messages: UIMessage[]) {
  const latestIndex = messages.findLastIndex((message) => message.role === "user");
  if (latestIndex === -1) {
    return false;
  }
  const text = messageText(messages[latestIndex]);
  if (!text || NEGATED_BINDING.test(text) || BINDING_QUESTION.test(text)) {
    return false;
  }
  if (DIRECT_BINDING.test(text)) {
    return true;
  }
  if (!SHORT_AFFIRMATIVE.test(text)) {
    return false;
  }
  const prior = messages
    .slice(0, latestIndex)
    .toReversed()
    .find((message) => message.role === "assistant");
  return prior ? PRIOR_BINDING_QUESTION.test(messageText(prior)) : false;
}

function nativeApproval(messages: UIMessage[]) {
  const last = messages.at(-1);
  if (!last || last.role !== "assistant") {
    return null;
  }
  for (const raw of [...last.parts].toReversed()) {
    const parsed = approvalPartSchema.safeParse(raw);
    if (!parsed.success) {
      continue;
    }
    const part = parsed.data;
    if (
      part.state !== "approval-responded" ||
      (part.type !== "dynamic-tool" && !part.type.startsWith("tool-"))
    ) {
      continue;
    }
    const approvalId = part.approval?.id;
    const separator = approvalId?.lastIndexOf("::") ?? -1;
    if (!approvalId || separator === -1) {
      continue;
    }
    const runId = approvalId.slice(0, separator);
    if (!runId) {
      continue;
    }
    const resumeData: NativeResumeApproval = {
      approved: part.approval?.approved === true,
    };
    if (part.approval?.reason) {
      resumeData.reason = part.approval.reason;
    }
    return { resumeData, runId };
  }
  return null;
}

function latestUserMessage(messages: UIMessage[]) {
  return messages.toReversed().find((message) => message.role === "user");
}

@Injectable()
export class ResumeChatService {
  constructor(
    @Inject(WORKSPACE_DATABASE_PORT) private readonly database: WorkspaceDatabasePort,
    @Inject(ChatService) private readonly conversations: ChatService,
  ) {}

  async chat(context: WorkspaceRequestContext, input: ResumeChatInput) {
    let messages = validatedUserMessages(
      await safeValidateUIMessages<UIMessage>({ messages: input.messages }),
    );
    const visibilityScope = await this.resolveVisibility(context);
    const focus = input.focus
      ? await this.resolveFocus(context.workspace.id, input.focus.id, visibilityScope)
      : undefined;
    if (input.focus && !focus) {
      throw new NotFoundException("候选人记录不存在或不属于当前 workspace。", {
        errorCode: "RESUME_CHAT_FOCUS_NOT_FOUND",
      });
    }

    const owned = input.chatId
      ? await this.conversations.conversationOwned(
          context.workspace.id,
          context.actor.id,
          input.chatId,
        )
      : false;
    const contextBindings =
      owned && input.chatId
        ? await this.conversations.loadContextBindings(context.workspace.id, input.chatId)
        : EMPTY_CHAT_CONTEXT_BINDINGS;
    if (input.trigger === "regenerate-message" && input.messageId) {
      const cutoff = messages.findIndex((message) => message.id === input.messageId);
      if (cutoff !== -1) {
        messages = messages.slice(0, cutoff);
      }
      if (owned && input.chatId) {
        try {
          await this.conversations.deleteMessagesFrom(
            context.workspace.id,
            context.actor.id,
            input.chatId,
            input.messageId,
          );
        } catch (error) {
          throw new InternalServerErrorException("无法重新生成这条消息，请稍后重试。", {
            cause: error,
            errorCode: "RESUME_CHAT_REGENERATE_FAILED",
          });
        }
      }
    }
    if (owned && input.chatId) {
      const latest = latestUserMessage(messages);
      if (latest) {
        try {
          await this.conversations.persistMessage(
            context.workspace.id,
            context.actor.id,
            input.chatId,
            latest,
          );
        } catch (error) {
          throw new InternalServerErrorException("消息保存失败，请稍后重试。", {
            cause: error,
            errorCode: "RESUME_CHAT_PERSIST_FAILED",
          });
        }
      }
    }

    const agentOptions: Parameters<typeof createRecruitingCopilotAgent>[0] = {
      bindingConsent: hasBindingConsent(messages),
      contextBindings,
      database: this.database,
      organizationId: context.workspace.id,
      visibilityScope,
    };
    if (focus) {
      agentOptions.focus = focus;
    }
    const agent = createRecruitingCopilotAgent(agentOptions);
    agent.__registerMastra(getRecruitingMastra());
    const approval = nativeApproval(messages);
    const agentStream = approval
      ? await agent.resumeStream(approval.resumeData, { runId: approval.runId })
      : await agent.stream(await convertToModelMessages(messages));
    const responseStream = createUIMessageStream<UIMessage>({
      execute: ({ writer }) => {
        writer.merge(
          toAISdkStream(agentStream, {
            from: "agent",
            sendReasoning: false,
            sendSources: true,
            version: "v6",
          }),
        );
      },
      generateId: () => crypto.randomUUID(),
      onError: () => "招聘 Copilot 暂时无法响应，请稍后重试。",
      onFinish: async ({ responseMessage }) => {
        if (!(owned && input.chatId && responseMessage.id)) {
          return;
        }
        try {
          await this.conversations.persistMessage(
            context.workspace.id,
            context.actor.id,
            input.chatId,
            responseMessage,
          );
        } catch (error) {
          console.error("[resume-chat] failed to persist assistant message", error);
        }
      },
      originalMessages: messages,
    });
    return createUIMessageStreamResponse({ stream: responseStream });
  }

  private async resolveFocus(organizationId: string, id: string, scope: RecruitingVisibilityScope) {
    if (scope.kind === "none") {
      return null;
    }
    const [record] = await this.database
      .select({ id: studioInterview.id })
      .from(studioInterview)
      .where(
        and(
          eq(studioInterview.id, id),
          eq(studioInterview.organizationId, organizationId),
          scope.kind === "restricted"
            ? inArray(studioInterview.createdBy, scope.userIds)
            : undefined,
        ),
      )
      .limit(1);
    return record ? { id: record.id, kind: "resume_record" as const } : null;
  }

  private async resolveVisibility(
    context: WorkspaceRequestContext,
  ): Promise<RecruitingVisibilityScope> {
    if (["owner", "admin"].includes(context.member.role)) {
      return { kind: "all" };
    }
    const [current] = await this.database
      .select({ role: member.role, userId: member.userId })
      .from(member)
      .where(
        and(eq(member.organizationId, context.workspace.id), eq(member.userId, context.actor.id)),
      )
      .limit(1);
    if (!current) {
      return { kind: "none" };
    }
    const memberships = await this.database
      .select({ groupId: recruitingGroupMember.groupId, role: recruitingGroupMember.role })
      .from(recruitingGroupMember)
      .where(
        and(
          eq(recruitingGroupMember.organizationId, context.workspace.id),
          eq(recruitingGroupMember.userId, context.actor.id),
        ),
      );
    if (memberships.length === 0) {
      return { kind: "restricted", userIds: [context.actor.id] };
    }
    const rows = await this.database
      .select({
        groupId: recruitingGroupMember.groupId,
        role: recruitingGroupMember.role,
        userId: recruitingGroupMember.userId,
      })
      .from(recruitingGroupMember)
      .where(
        and(
          eq(recruitingGroupMember.organizationId, context.workspace.id),
          inArray(
            recruitingGroupMember.groupId,
            memberships.map((row) => row.groupId),
          ),
        ),
      );
    const ownRanks = new Map(memberships.map((row) => [row.groupId, ROLE_RANK.get(row.role) ?? 0]));
    const visible = new Set([context.actor.id]);
    for (const row of rows) {
      const ownRank = ownRanks.get(row.groupId) ?? 0;
      if (ownRank >= 2 && (ROLE_RANK.get(row.role) ?? 0) < ownRank) {
        visible.add(row.userId);
      }
    }
    return { kind: "restricted", userIds: [...visible] };
  }
}
