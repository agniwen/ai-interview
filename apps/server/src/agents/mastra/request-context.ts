import { z } from "zod";

type RequestContextValue = string | number | boolean | null | undefined;

export interface MastraRequestContextInput {
  workspaceId?: string | null;
  workspaceSlug?: string | null;
  userId?: string | null;
  conversationId?: string | null;
  resumeRecordId?: string | null;
  extra?: Record<string, RequestContextValue>;
}

export interface MastraMemoryScopeInput {
  workspaceId: string;
  userId: string;
  conversationId: string;
  resumeRecordId?: string | null;
}

const requestContextStringSchema = z.string();

function cleanString(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function addContextValue(
  context: Map<string, RequestContextValue>,
  key: string,
  value: RequestContextValue,
): void {
  const stringResult = requestContextStringSchema.safeParse(value);
  if (stringResult.success) {
    const cleaned = cleanString(stringResult.data);
    if (cleaned) {
      context.set(key, cleaned);
    }
    return;
  }

  if (value !== null && value !== undefined) {
    context.set(key, value);
  }
}

export function toMastraRequestContext(
  input: MastraRequestContextInput,
): Map<string, RequestContextValue> {
  const context = new Map<string, RequestContextValue>();

  addContextValue(context, "workspaceId", input.workspaceId);
  addContextValue(context, "workspaceSlug", input.workspaceSlug);
  addContextValue(context, "userId", input.userId);
  addContextValue(context, "conversationId", input.conversationId);
  addContextValue(context, "resumeRecordId", input.resumeRecordId);

  for (const [key, value] of Object.entries(input.extra ?? {})) {
    addContextValue(context, key, value);
  }

  return context;
}

export function buildMastraMemoryScope(input: MastraMemoryScopeInput) {
  const workspaceId = cleanString(input.workspaceId);
  const userId = cleanString(input.userId);
  const conversationId = cleanString(input.conversationId);
  const resumeRecordId = cleanString(input.resumeRecordId);

  if (!(workspaceId && userId && conversationId)) {
    throw new Error("workspaceId, userId, and conversationId are required for Mastra memory.");
  }

  return {
    resource: `workspace:${workspaceId}:user:${userId}`,
    thread: resumeRecordId
      ? `resume:${resumeRecordId}:conversation:${conversationId}`
      : `conversation:${conversationId}`,
  };
}
