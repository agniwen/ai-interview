import type { UIMessage } from "ai";
import { safeValidateUIMessages } from "ai";

export async function validateClientChatMessages(
  rawMessages: unknown,
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
