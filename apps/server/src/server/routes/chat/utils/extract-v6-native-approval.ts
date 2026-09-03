import type { UIMessage } from "ai";
import { z } from "zod";

const APPROVAL_ID_SEPARATOR = "::";

const nativeApprovalToolPartSchema = z.object({
  approval: z
    .object({
      approved: z.boolean().optional(),
      id: z.string().min(1).optional(),
      reason: z.string().optional(),
    })
    .optional(),
  state: z.string().optional(),
  type: z.string(),
});

interface NativeApprovalResumeData {
  approved: boolean;
  reason?: string;
}

/**
 * Port of `@mastra/ai-sdk` `extractV6NativeApproval` (not publicly exported).
 * Detects AI SDK v6 `approval-responded` tool parts and recovers runId for resumeStream.
 */
export function extractV6NativeApproval(messages: UIMessage[]): {
  resumeData: NativeApprovalResumeData;
  runId: string;
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
    if (!runId) {
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
    };
  }
  return null;
}
