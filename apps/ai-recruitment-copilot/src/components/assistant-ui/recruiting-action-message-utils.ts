import type { UIMessage } from "ai";
import type { RecruitingActionConfirmation } from "@/components/assistant-ui/recruiting-copilot-context";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isToolLikePart(part: unknown): part is {
  output?: unknown;
  state?: string;
  type: string;
} {
  if (!isRecord(part) || typeof part.type !== "string") {
    return false;
  }
  return part.type === "tool" || part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function readProposalId(output: unknown): string | null {
  if (!isRecord(output)) {
    return null;
  }
  if (isRecord(output.proposal) && typeof output.proposal.id === "string") {
    return output.proposal.id;
  }
  if (
    isRecord(output.conversationJobBindingProposal) &&
    typeof output.conversationJobBindingProposal.id === "string"
  ) {
    return output.conversationJobBindingProposal.id;
  }
  return null;
}

function hasConfirmation(output: unknown): boolean {
  if (!isRecord(output) || !isRecord(output.confirmation)) {
    return false;
  }
  return output.confirmation.status === "confirmed" || output.confirmation.status === "ignored";
}

function patchToolOutput(
  output: unknown,
  confirmation: RecruitingActionConfirmation,
  proposalId: string,
): unknown {
  if (!isRecord(output)) {
    return output;
  }
  const next: Record<string, unknown> = { ...output, confirmation };
  if (isRecord(output.proposal) && output.proposal.id === proposalId) {
    const payload = isRecord(output.proposal.payload) ? { ...output.proposal.payload } : {};
    if (confirmation.jobDescriptionId) {
      payload.jobDescriptionId = confirmation.jobDescriptionId;
    }
    next.proposal = { ...output.proposal, payload };
  }
  if (
    isRecord(output.conversationJobBindingProposal) &&
    output.conversationJobBindingProposal.id === proposalId
  ) {
    const payload = isRecord(output.conversationJobBindingProposal.payload)
      ? { ...output.conversationJobBindingProposal.payload }
      : {};
    if (confirmation.jobDescriptionId) {
      payload.jobDescriptionId = confirmation.jobDescriptionId;
    }
    next.conversationJobBindingProposal = {
      ...output.conversationJobBindingProposal,
      payload,
    };
  }
  return next;
}

export function patchUiMessagesRecruitingActionConfirmation(
  messages: UIMessage[],
  proposalId: string,
  confirmation: RecruitingActionConfirmation,
): UIMessage[] {
  return messages.map((message) => {
    let changed = false;
    const parts = message.parts.map((part) => {
      if (!isToolLikePart(part) || part.state !== "output-available") {
        return part;
      }
      if (readProposalId(part.output) !== proposalId) {
        return part;
      }
      changed = true;
      return {
        ...part,
        output: patchToolOutput(part.output, confirmation, proposalId),
      };
    });
    return changed ? { ...message, parts } : message;
  });
}

export function lastAssistantHasPendingRecruitingBindProposal(messages: UIMessage[]): boolean {
  const message = messages.at(-1);
  if (!message || message.role !== "assistant") {
    return false;
  }
  return message.parts.some((part) => {
    if (!isToolLikePart(part) || part.state !== "output-available") {
      return false;
    }
    if (hasConfirmation(part.output)) {
      return false;
    }
    if (!isRecord(part.output)) {
      return false;
    }
    const proposal = part.output.proposal ?? part.output.conversationJobBindingProposal;
    if (!isRecord(proposal)) {
      return false;
    }
    return proposal.type === "bind_candidate_to_job" || proposal.type === "bind_pool_item_to_job";
  });
}
