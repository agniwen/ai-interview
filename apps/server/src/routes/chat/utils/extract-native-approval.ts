import type { UIMessage } from "ai";
import { z } from "zod";

const APPROVAL_ID_SEPARATOR = "::";

const nativeApprovalToolPartSchema = z.object({
  approval: z
    .object({
      approved: z.boolean(),
      id: z.string().min(1).optional(),
      reason: z.string().optional(),
    })
    .optional(),
  state: z.string().optional(),
  toolCallId: z.string().min(1),
  type: z.string(),
});

interface NativeApprovalResumeData {
  approved: boolean;
  reason?: string;
}

/**
 * Resolves the composite run/tool-call approval IDs emitted by Mastra for AI SDK v6/v7.
 * Resume the exact suspended tool rather than an arbitrary pending tool in the run.
 */
export function extractNativeApproval(messages: UIMessage[]): {
  resumeData: NativeApprovalResumeData;
  runId: string;
  toolCallId: string;
} | null {
  const lastAssistantMsg = messages.at(-1);
  if (!lastAssistantMsg || lastAssistantMsg.role !== "assistant") {
    return null;
  }
  const parts = lastAssistantMsg.parts ?? [];
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const parsedPart = nativeApprovalToolPartSchema.safeParse(parts[i]);
    if (!parsedPart.success) {
      continue;
    }
    const part = parsedPart.data;
    if (
      part.state !== "approval-responded" ||
      (part.type !== "dynamic-tool" && !part.type.startsWith("tool-"))
    ) {
      continue;
    }
    const approvalId = part.approval?.id;
    if (!approvalId) {
      continue;
    }
    const lastSep = approvalId.lastIndexOf(APPROVAL_ID_SEPARATOR);
    if (lastSep === -1) {
      continue;
    }
    const runId = approvalId.slice(0, lastSep);
    const toolCallId = approvalId.slice(lastSep + APPROVAL_ID_SEPARATOR.length);
    if (!runId || !toolCallId || toolCallId !== part.toolCallId) {
      continue;
    }
    const reason = part.approval?.reason;
    const resumeData: NativeApprovalResumeData = {
      approved: part.approval?.approved === true,
    };
    if (reason) {
      resumeData.reason = reason;
    }
    return {
      resumeData,
      runId,
      toolCallId,
    };
  }
  return null;
}
