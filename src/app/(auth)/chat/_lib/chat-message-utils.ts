import type { DynamicToolUIPart, ToolUIPart, UIMessage } from "ai";

type MessagePart = UIMessage["parts"][number];

export function isTextPart(part: MessagePart): part is Extract<MessagePart, { type: "text" }> {
  return part.type === "text";
}

export function isFilePart(part: MessagePart): part is Extract<MessagePart, { type: "file" }> {
  return part.type === "file";
}

export function isSourceUrlPart(
  part: MessagePart,
): part is Extract<MessagePart, { type: "source-url" }> {
  return part.type === "source-url";
}

export function isToolPart(part: MessagePart): part is ToolUIPart | DynamicToolUIPart {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

export function getMessageTimeValue(message: UIMessage): Date | null {
  const { createdAt } = message as UIMessage & {
    createdAt?: Date | string | number;
  };
  if (!createdAt) {
    return null;
  }
  const parsed = createdAt instanceof Date ? createdAt : new Date(createdAt);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed;
}

export interface DownloadMessage {
  content: string;
  role: UIMessage["role"];
}

export function toDownloadMessage(message: UIMessage): DownloadMessage {
  const text = message.parts
    .filter(isTextPart)
    .map((part) => part.text)
    .join("\n\n")
    .trim();

  if (text) {
    return { content: text, role: message.role };
  }

  const hasFiles = message.parts.some(isFilePart);
  const hasTools = message.parts.some(isToolPart);
  let fallback = "[Empty Message]";
  if (hasFiles) {
    fallback = "[Attachment]";
  } else if (hasTools) {
    fallback = "[Tool Call]";
  }
  return { content: fallback, role: message.role };
}
