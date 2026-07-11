import type {
  ArcFilePart,
  ArcMessage,
  ArcMessagePart,
  ArcMessageRole,
  ArcSourcePart,
  ArcToolPart,
} from "@arc/db-schema/ai-message";

const SUPPORTED_ROLES = new Set<ArcMessageRole>(["assistant", "system", "tool", "user"]);

export interface MastraMessageInput {
  content: string;
  id?: string;
  metadata?: Record<string, unknown>;
  role: ArcMessageRole;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeRole(value: unknown): ArcMessageRole {
  if (typeof value === "string" && SUPPORTED_ROLES.has(value as ArcMessageRole)) {
    return value as ArcMessageRole;
  }
  throw new Error(`Unsupported ArcMessage role: ${String(value)}`);
}

function normalizeCreatedAt(value: unknown): string | undefined {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    return value;
  }
  return undefined;
}

function normalizeMetadata(value: unknown): Record<string, unknown> | undefined {
  if (isRecord(value)) {
    return value;
  }
  return undefined;
}

function normalizeParts(message: Record<string, unknown>): ArcMessagePart[] {
  if (Array.isArray(message.parts)) {
    return message.parts as ArcMessagePart[];
  }
  if (typeof message.content === "string" && message.content.trim()) {
    return [{ text: message.content, type: "text" }];
  }
  return [];
}

function arcPartToModelText(part: ArcMessagePart): string | null {
  if (part.type === "text" || part.type === "reasoning") {
    return part.text;
  }
  if (part.type === "file") {
    const label = part.filename?.trim() || part.name?.trim() || "attachment";
    const locator = part.url?.trim() || part.hash?.trim() || "";
    return `[file:${label} ${part.mediaType}${locator ? ` ${locator}` : ""}]`;
  }
  if (part.type === "source") {
    return `[source:${part.title?.trim() || part.url?.trim() || "source"}]`;
  }
  if (part.type === "tool") {
    return `[tool:${part.toolName} ${part.state}]`;
  }
  return null;
}

function chunkText(chunk: Record<string, unknown>): string | null {
  if (typeof chunk.text === "string") {
    return chunk.text;
  }
  if (typeof chunk.delta === "string") {
    return chunk.delta;
  }
  return null;
}

function textChunkToArcPart(
  chunk: Record<string, unknown>,
  type: "reasoning" | "text",
): ArcMessagePart | null {
  const text = chunkText(chunk);
  return text ? { text, type } : null;
}

function sourceChunkToArcPart(chunk: Record<string, unknown>): ArcSourcePart {
  return {
    ...(chunk.metadata === undefined ? {} : { metadata: chunk.metadata }),
    ...(typeof chunk.title === "string" ? { title: chunk.title } : {}),
    type: "source",
    ...(typeof chunk.url === "string" ? { url: chunk.url } : {}),
  };
}

function normalizeToolState(value: unknown): ArcToolPart["state"] {
  if (
    value === "input-streaming" ||
    value === "input-available" ||
    value === "output-available" ||
    value === "error"
  ) {
    return value;
  }
  return "input-available";
}

function toolChunkToArcPart(chunk: Record<string, unknown>): ArcToolPart | null {
  if (typeof chunk.toolCallId === "string" && typeof chunk.toolName === "string") {
    return {
      ...(typeof chunk.errorText === "string" ? { errorText: chunk.errorText } : {}),
      ...(chunk.input === undefined ? {} : { input: chunk.input }),
      ...(chunk.output === undefined ? {} : { output: chunk.output }),
      state: normalizeToolState(chunk.state),
      toolCallId: chunk.toolCallId,
      toolName: chunk.toolName,
      type: "tool",
    };
  }
  return null;
}

function fileChunkToArcPart(chunk: Record<string, unknown>): ArcFilePart | null {
  if (typeof chunk.mediaType === "string") {
    return {
      ...(typeof chunk.data === "string" ? { data: chunk.data } : {}),
      ...(typeof chunk.filename === "string" ? { filename: chunk.filename } : {}),
      ...(typeof chunk.hash === "string" ? { hash: chunk.hash } : {}),
      mediaType: chunk.mediaType,
      ...(typeof chunk.name === "string" ? { name: chunk.name } : {}),
      type: "file",
      ...(typeof chunk.url === "string" ? { url: chunk.url } : {}),
    };
  }
  return null;
}

function recordStreamChunkToArcPart(chunk: Record<string, unknown>): ArcMessagePart | null {
  switch (chunk.type) {
    case "text":
    case "text-delta": {
      return textChunkToArcPart(chunk, "text");
    }
    case "reasoning":
    case "reasoning-delta": {
      return textChunkToArcPart(chunk, "reasoning");
    }
    case "source": {
      return sourceChunkToArcPart(chunk);
    }
    case "tool": {
      return toolChunkToArcPart(chunk);
    }
    case "file": {
      return fileChunkToArcPart(chunk);
    }
    default: {
      return null;
    }
  }
}

function streamChunkToArcPart(chunk: unknown): ArcMessagePart | null {
  if (typeof chunk === "string" && chunk.trim()) {
    return { text: chunk, type: "text" };
  }
  if (isRecord(chunk) && typeof chunk.type === "string") {
    return recordStreamChunkToArcPart(chunk);
  }
  return null;
}

export function arcMessageToMastraInput(message: ArcMessage): MastraMessageInput {
  const content = message.parts
    .map(arcPartToModelText)
    .filter((part) => part !== null)
    .join("\n");

  return {
    ...(content ? { content } : { content: "" }),
    id: message.id,
    ...(message.metadata ? { metadata: message.metadata } : {}),
    role: message.role,
  };
}

export function mastraStreamToArcMessageParts(chunks: Iterable<unknown>): ArcMessagePart[] {
  const parts: ArcMessagePart[] = [];
  for (const chunk of chunks) {
    const part = streamChunkToArcPart(chunk);
    if (part) {
      parts.push(part);
    }
  }
  return parts;
}

export function legacyUiMessageToArcMessage(message: unknown): ArcMessage {
  if (!isRecord(message)) {
    throw new Error("ArcMessage input must be an object.");
  }
  if (typeof message.id !== "string" || !message.id.trim()) {
    throw new Error("ArcMessage id is required.");
  }

  const createdAt = normalizeCreatedAt(message.createdAt);
  const metadata = normalizeMetadata(message.metadata);

  return {
    ...(createdAt ? { createdAt } : {}),
    id: message.id,
    ...(metadata ? { metadata } : {}),
    parts: normalizeParts(message),
    role: normalizeRole(message.role),
  };
}
