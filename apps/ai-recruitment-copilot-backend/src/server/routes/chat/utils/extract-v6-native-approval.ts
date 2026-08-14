import type { UIMessage } from "ai";

const APPROVAL_ID_SEPARATOR = "::";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isToolUiPart(part: unknown): part is {
  approval?: { approved?: boolean; id?: string; reason?: string };
  state?: string;
  type: string;
} {
  if (!isRecord(part) || typeof part.type !== "string") {
    return false;
  }
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

/**
 * Port of `@mastra/ai-sdk` `extractV6NativeApproval` (not publicly exported).
 * Detects AI SDK v6 `approval-responded` tool parts and recovers runId for resumeStream.
 */
export function extractV6NativeApproval(messages: UIMessage[]): {
  resumeData: Record<string, unknown>;
  runId: string;
} | null {
  const lastAssistantMsg = messages.at(-1);
  if (!lastAssistantMsg || lastAssistantMsg.role !== "assistant") {
    return null;
  }
  const parts = lastAssistantMsg.parts ?? [];
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i];
    if (!isToolUiPart(part) || part.state !== "approval-responded") {
      continue;
    }
    const approvalId = part.approval?.id;
    if (typeof approvalId !== "string" || approvalId.length === 0) {
      continue;
    }
    const lastSep = approvalId.lastIndexOf(APPROVAL_ID_SEPARATOR);
    if (lastSep === -1) {
      continue;
    }
    const runId = approvalId.slice(0, lastSep);
    if (!runId) {
      continue;
    }
    const reason = part.approval?.reason;
    return {
      resumeData: {
        approved: part.approval?.approved === true,
        ...(typeof reason === "string" ? { reason } : {}),
      },
      runId,
    };
  }
  return null;
}
