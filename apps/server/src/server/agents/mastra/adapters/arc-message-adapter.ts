import { z } from "zod";
import type {
  ArcFilePart,
  ArcMessage,
  ArcMessagePart,
  ArcMessageRole,
  ArcSourcePart,
  ArcToolPart,
} from "@arc/db-schema/ai-message";

const arcMessageRoleSchema = z.enum(["assistant", "system", "tool", "user"]);
const arcTextPartSchema = z.object({ text: z.string(), type: z.literal("text") }).passthrough();
const arcReasoningPartSchema = z
  .object({ text: z.string(), type: z.literal("reasoning") })
  .passthrough();
const arcFilePartSchema = z
  .object({
    data: z.string().optional(),
    filename: z.string().optional(),
    hash: z.string().optional(),
    mediaType: z.string(),
    name: z.string().optional(),
    type: z.literal("file"),
    url: z.string().optional(),
  })
  .passthrough();
const arcSourcePartSchema = z
  .object({
    filename: z.string().optional(),
    mediaType: z.string().optional(),
    metadata: z.unknown().optional(),
    sourceId: z.string().optional(),
    title: z.string().optional(),
    type: z.enum(["source", "source-url", "source-document"]),
    url: z.string().optional(),
  })
  .passthrough();
const arcToolStateSchema = z.enum([
  "input-streaming",
  "input-available",
  "approval-requested",
  "approval-responded",
  "output-available",
  "output-error",
  "output-denied",
  "error",
]);
const arcToolTypeSchema = z.union([
  z.literal("tool"),
  z.literal("dynamic-tool"),
  z.templateLiteral(["tool-", z.string()]),
]);
const arcToolPartSchema = z
  .object({
    approval: z
      .object({
        approved: z.boolean().optional(),
        id: z.string(),
        reason: z.string().optional(),
        signature: z.string().optional(),
      })
      .optional(),
    errorText: z.string().optional(),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    state: arcToolStateSchema,
    toolCallId: z.string(),
    toolName: z.string().optional(),
    type: arcToolTypeSchema,
  })
  .passthrough();
const arcStepStartPartSchema = z.object({ type: z.literal("step-start") }).passthrough();
const arcDataPartSchema = z
  .object({
    data: z.unknown(),
    id: z.string().optional(),
    type: z.templateLiteral(["data-", z.string()]),
  })
  .passthrough();
const arcMessagePartSchema = z.union([
  arcTextPartSchema,
  arcReasoningPartSchema,
  arcFilePartSchema,
  arcSourcePartSchema,
  arcToolPartSchema,
  arcStepStartPartSchema,
  arcDataPartSchema,
]) satisfies z.ZodType<ArcMessagePart>;

const legacyUiMessageSchema = z.object({
  content: z.string().optional(),
  createdAt: z.union([z.date(), z.string()]).optional(),
  id: z.string().trim().min(1, "ArcMessage id is required."),
  metadata: z.record(z.string(), z.json()).optional(),
  parts: z.array(arcMessagePartSchema).optional(),
  role: z.string(),
});

const streamRecordChunkSchema = z
  .object({
    data: z.string().optional(),
    delta: z.string().optional(),
    errorText: z.string().optional(),
    filename: z.string().optional(),
    hash: z.string().optional(),
    input: z.unknown().optional(),
    mediaType: z.string().optional(),
    metadata: z.unknown().optional(),
    name: z.string().optional(),
    output: z.unknown().optional(),
    state: z.string().optional(),
    text: z.string().optional(),
    title: z.string().optional(),
    toolCallId: z.string().optional(),
    toolName: z.string().optional(),
    type: z.string(),
    url: z.string().optional(),
  })
  .passthrough();
const streamTextChunkSchema = z.string();

export interface MastraMessageInput {
  content: string;
  id?: string;
  metadata?: ArcMessage["metadata"];
  role: ArcMessageRole;
}

function parseRole(value: string): ArcMessageRole {
  const result = arcMessageRoleSchema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  throw new Error(`Unsupported ArcMessage role: ${value}`);
}

function normalizeCreatedAt(value: Date | string | undefined): string | undefined {
  if (value instanceof Date) {
    return value.toISOString();
  }
  return value?.trim() || undefined;
}

function normalizeParts(message: z.output<typeof legacyUiMessageSchema>): ArcMessagePart[] {
  if (message.parts) {
    return message.parts;
  }
  return message.content?.trim() ? [{ text: message.content, type: "text" }] : [];
}

function isArcToolPart(part: ArcMessagePart): part is ArcToolPart {
  return part.type === "tool" || part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function isArcSourcePart(part: ArcMessagePart): part is ArcSourcePart {
  return ["source", "source-url", "source-document"].includes(part.type);
}

function arcPartToModelText(part: ArcMessagePart): string | null {
  if (part.type === "text" || part.type === "reasoning") {
    return part.text;
  }
  if (part.type === "file") {
    const label = [part.filename, part.name].map((value) => value?.trim()).find(Boolean);
    const locator = [part.url, part.hash].map((value) => value?.trim()).find(Boolean);
    return `[file:${label ?? "attachment"} ${part.mediaType}${locator ? ` ${locator}` : ""}]`;
  }
  if (isArcSourcePart(part)) {
    const label = [part.title, part.url].map((value) => value?.trim()).find(Boolean);
    return `[source:${label ?? "source"}]`;
  }
  if (isArcToolPart(part)) {
    const toolName = part.toolName ?? part.type.slice("tool-".length);
    return `[tool:${toolName} ${part.state}]`;
  }
  return null;
}

function sourceChunkToArcPart(chunk: z.output<typeof streamRecordChunkSchema>): ArcSourcePart {
  const part: ArcSourcePart = { type: "source" };
  if ("metadata" in chunk && chunk.metadata !== undefined) {
    part.metadata = chunk.metadata;
  }
  if ("title" in chunk && chunk.title) {
    part.title = chunk.title;
  }
  if ("url" in chunk && chunk.url) {
    part.url = chunk.url;
  }
  return part;
}

function normalizeToolState(value: string | undefined): ArcToolPart["state"] {
  const result = arcToolStateSchema.safeParse(value);
  return result.success ? result.data : "input-available";
}

function toolChunkToArcPart(chunk: z.output<typeof streamRecordChunkSchema>): ArcToolPart | null {
  if (!(chunk.toolCallId && chunk.toolName)) {
    return null;
  }
  const part: ArcToolPart = {
    state: normalizeToolState(chunk.state),
    toolCallId: chunk.toolCallId,
    toolName: chunk.toolName,
    type: "tool",
  };
  if (chunk.errorText) {
    part.errorText = chunk.errorText;
  }
  if (chunk.input !== undefined) {
    part.input = chunk.input;
  }
  if (chunk.output !== undefined) {
    part.output = chunk.output;
  }
  return part;
}

function fileChunkToArcPart(chunk: z.output<typeof streamRecordChunkSchema>): ArcFilePart | null {
  if (!chunk.mediaType) {
    return null;
  }
  const part: ArcFilePart = { mediaType: chunk.mediaType, type: "file" };
  if (chunk.data) {
    part.data = chunk.data;
  }
  if (chunk.filename) {
    part.filename = chunk.filename;
  }
  if (chunk.hash) {
    part.hash = chunk.hash;
  }
  if (chunk.name) {
    part.name = chunk.name;
  }
  if (chunk.url) {
    part.url = chunk.url;
  }
  return part;
}

function recordStreamChunkToArcPart(
  chunk: z.output<typeof streamRecordChunkSchema>,
): ArcMessagePart | null {
  switch (chunk.type) {
    case "text":
    case "text-delta": {
      return chunk.text ? { text: chunk.text, type: "text" } : null;
    }
    case "reasoning":
    case "reasoning-delta": {
      const text = chunk.text ?? chunk.delta;
      return text ? { text, type: "reasoning" } : null;
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

export function arcMessageToMastraInput(message: ArcMessage): MastraMessageInput {
  const content = message.parts
    .map(arcPartToModelText)
    .filter((part) => part !== null)
    .join("\n");
  const input: MastraMessageInput = { content, id: message.id, role: message.role };
  if (message.metadata) {
    input.metadata = message.metadata;
  }
  return input;
}

export function mastraStreamToArcMessageParts(chunks: Iterable<unknown>): ArcMessagePart[] {
  const parts: ArcMessagePart[] = [];
  for (const chunk of chunks) {
    const textResult = streamTextChunkSchema.safeParse(chunk);
    if (textResult.success) {
      if (textResult.data.trim()) {
        parts.push({ text: textResult.data, type: "text" });
      }
      continue;
    }
    const recordResult = streamRecordChunkSchema.safeParse(chunk);
    if (!recordResult.success) {
      continue;
    }
    const part = recordStreamChunkToArcPart(recordResult.data);
    if (part) {
      parts.push(part);
    }
  }
  return parts;
}

const arcMessageFromLegacySchema = legacyUiMessageSchema.transform((message): ArcMessage => {
  const result: ArcMessage = {
    id: message.id,
    parts: normalizeParts(message),
    role: parseRole(message.role),
  };
  const createdAt = normalizeCreatedAt(message.createdAt);
  if (createdAt) {
    result.createdAt = createdAt;
  }
  if (message.metadata) {
    result.metadata = message.metadata;
  }
  return result;
});

export const legacyUiMessageToArcMessage = arcMessageFromLegacySchema.parse;
