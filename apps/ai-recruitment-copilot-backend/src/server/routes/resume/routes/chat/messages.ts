import type { UIMessage } from "ai";
import { safeValidateUIMessages } from "ai";
import type { ResumeChatMessagesInput } from "@arc/ai-recruitment-copilot-backend/server/routes/resume/schema";

export async function validateClientChatMessages(
  rawMessages: ResumeChatMessagesInput,
): Promise<{ messages: UIMessage[] } | { error: string }> {
  const result = await safeValidateUIMessages<UIMessage>({ messages: rawMessages });
  if (!result.success) {
    return { error: "聊天消息格式无效。" };
  }
  if (result.data.some((message) => message.role === "system")) {
    return { error: "客户端不能提交 system 消息。" };
  }
  return { messages: result.data };
}
