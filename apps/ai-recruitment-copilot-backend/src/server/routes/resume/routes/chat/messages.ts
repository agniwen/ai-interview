import type { UIMessage } from "ai";
import { safeValidateUIMessages } from "ai";
import type { ResumeChatMessagesInput } from "@arc/ai-recruitment-copilot-backend/server/routes/resume/schema";

const BINDING_NEGATION_PATTERN =
  /(?:不(?:要|需要)?|暂不|先不|无需|别)[^。！？?]{0,12}(?:绑定|关联)|(?:绑定|关联)[^。！？?]{0,12}(?:不(?:要|需要)?|暂不|先不|无需|取消)/;
const BINDING_QUESTION_PATTERN =
  /(?:是否|能否|可否|要不要|怎么|如何)[^。！？?]{0,30}(?:绑定|关联)|(?:绑定|关联)[^。！？?]{0,12}[吗么？?]/;
const DIRECT_BINDING_PATTERN =
  /(?:请帮我|请|帮我|直接|现在|同意|确认|可以|要|需要)\s*(?:把[^，,。；;]{0,24})?(?:绑定|关联)|(?:^|[}\s，,。；;])(?:把[^，,。；;]{0,24})?(?:绑定|关联)(?:到|至|岗位|职位|一下)/;
const SHORT_AFFIRMATIVE_PATTERN = /^(?:好|好的|要|需要|可以|同意|确认|是|行|继续)$/;
const PRIOR_BINDING_QUESTION_PATTERN =
  /(?:是否|要不要|需要)[^。！？?]{0,30}(?:绑定|关联)|(?:绑定|关联)[^。！？?]{0,12}[吗么？?]/;

function messageText(message: UIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export function hasExplicitJobBindingConsent(messages: UIMessage[]): boolean {
  const latestUserIndex = messages.findLastIndex((message) => message.role === "user");
  if (latestUserIndex === -1) {
    return false;
  }
  const latestUserText = messageText(messages[latestUserIndex]);
  if (
    !latestUserText ||
    BINDING_NEGATION_PATTERN.test(latestUserText) ||
    BINDING_QUESTION_PATTERN.test(latestUserText)
  ) {
    return false;
  }
  if (DIRECT_BINDING_PATTERN.test(latestUserText)) {
    return true;
  }
  if (!SHORT_AFFIRMATIVE_PATTERN.test(latestUserText)) {
    return false;
  }
  const priorAssistant = messages
    .slice(0, latestUserIndex)
    .toReversed()
    .find((message) => message.role === "assistant");
  return priorAssistant ? PRIOR_BINDING_QUESTION_PATTERN.test(messageText(priorAssistant)) : false;
}

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
