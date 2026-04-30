import type { UIMessage } from "ai";
import { isReasoningUIPart, isToolUIPart } from "ai";

type AssistantPart = UIMessage["parts"][number];

/**
 * 判断一条 assistant message part 是否真的有"用户可见"的内容。
 *
 * 仅靠 `parts.length > 0` 判断会被空 placeholder 骗到 (例如刚 emit 了 step-start
 * 还没真正出 token)。stall recovery / 切后台恢复决策依赖这个判断, 必须排除
 * 占位 part —— 否则 "submitted 卡住" 会被误判为"已经在出内容了"。
 *
 * Mirrors open-agents `lib/chat-streaming-state.ts:hasRenderableAssistantPart`.
 * Plain `parts.length > 0` falsely accepts step-start placeholders; stall
 * recovery decisions need to know whether anything user-visible is on screen.
 */
export function hasRenderableAssistantPart(part: AssistantPart | undefined | null): boolean {
  // 切换 session / 流抖动期, parts 数组里偶尔会出现非预期的 undefined element,
  // 全套防御一下避免 "Cannot read properties of undefined" 之类的 runtime 报错。
  // Defensive: parts can briefly contain unexpected nullish entries during
  // session transitions / stream churn — guard before pattern-matching.
  if (!part || typeof part !== "object" || typeof part.type !== "string") {
    return false;
  }
  if (part.type === "text") {
    return typeof part.text === "string" && part.text.length > 0;
  }
  if (isToolUIPart(part)) {
    return true;
  }
  if (isReasoningUIPart(part)) {
    return (typeof part.text === "string" && part.text.length > 0) || part.state === "streaming";
  }
  return false;
}

/**
 * 当前末尾消息是否是带可见内容的 assistant —— 给 stall recovery 用。
 * Whether the trailing message is an assistant with at least one renderable
 * part — used by stall recovery to decide if a stream is actually progressing.
 */
export function trailingAssistantHasRenderableContent(messages: UIMessage[]): boolean {
  const last = messages.at(-1);
  if (last?.role !== "assistant" || !Array.isArray(last.parts)) {
    return false;
  }
  return last.parts.some(hasRenderableAssistantPart);
}
