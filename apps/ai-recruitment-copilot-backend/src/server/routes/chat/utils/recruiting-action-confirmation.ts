import type { ArcMessage } from "@arc/db-schema/ai-message";
import type { RecruitingActionConfirmationSnapshot } from "@arc/db-schema/chat-context-bindings";

export type RecruitingActionConfirmationStatus = "confirmed" | "ignored";

export type RecruitingActionConfirmation = RecruitingActionConfirmationSnapshot;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** AI SDK stores tools as `tool-${name}` / `dynamic-tool`; Arc uses `type: "tool"`. */
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

function patchProposalOutput(
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
    next.proposal = {
      ...output.proposal,
      payload,
    };
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

function isMatchingToolPart(
  part: ArcMessage["parts"][number] | Record<string, unknown>,
  proposalId: string,
): boolean {
  if (!isToolLikePart(part) || part.state !== "output-available") {
    return false;
  }
  return readProposalId(part.output) === proposalId;
}

/** Returns patched message when a matching propose/detail tool result was updated. */
export function patchArcMessageRecruitingActionConfirmation(
  message: ArcMessage,
  proposalId: string,
  confirmation: RecruitingActionConfirmation,
): ArcMessage | null {
  let changed = false;
  const parts = message.parts.map((part) => {
    if (!isMatchingToolPart(part, proposalId)) {
      return part;
    }
    changed = true;
    const toolPart = part as { output?: unknown };
    return {
      ...part,
      output: patchProposalOutput(toolPart.output, confirmation, proposalId),
    };
  });
  if (!changed) {
    return null;
  }
  return { ...message, parts };
}

function readConfirmation(output: unknown): RecruitingActionConfirmation | null {
  if (!isRecord(output) || !isRecord(output.confirmation)) {
    return null;
  }
  const { status } = output.confirmation;
  if (status !== "confirmed" && status !== "ignored") {
    return null;
  }
  if (typeof output.confirmation.confirmedAt !== "string") {
    return null;
  }
  return {
    confirmedAt: output.confirmation.confirmedAt,
    ...(typeof output.confirmation.jobDescriptionId === "string"
      ? { jobDescriptionId: output.confirmation.jobDescriptionId }
      : {}),
    ...(output.confirmation.jobDescriptionName === undefined
      ? {}
      : {
          jobDescriptionName:
            typeof output.confirmation.jobDescriptionName === "string"
              ? output.confirmation.jobDescriptionName
              : null,
        }),
    status,
  };
}

/** Later tool results win when the same proposal id appears more than once. */
export function deriveRecruitingActionConfirmationsFromMessages(
  messages: ArcMessage[],
): Record<string, RecruitingActionConfirmation> {
  const confirmations: Record<string, RecruitingActionConfirmation> = {};
  for (const message of messages) {
    for (const part of message.parts) {
      if (!isToolLikePart(part) || part.state !== "output-available") {
        continue;
      }
      const proposalId = readProposalId(part.output);
      const confirmation = readConfirmation(part.output);
      if (!(proposalId && confirmation)) {
        continue;
      }
      confirmations[proposalId] = confirmation;
    }
  }
  return confirmations;
}

/** Whether a tool output still shows an unresolved bind proposal (legacy messages). */
export function hasPendingRecruitingBindProposal(output: unknown): boolean {
  if (!isRecord(output)) {
    return false;
  }
  if (readConfirmation(output)) {
    return false;
  }
  const proposal = output.proposal ?? output.conversationJobBindingProposal;
  if (!isRecord(proposal)) {
    return false;
  }
  return proposal.type === "bind_candidate_to_job" || proposal.type === "bind_pool_item_to_job";
}
