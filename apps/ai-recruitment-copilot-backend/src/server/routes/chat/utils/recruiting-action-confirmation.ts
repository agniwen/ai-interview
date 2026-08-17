import { z } from "zod";
import type { ArcMessage } from "@arc/db-schema/ai-message";
import type { RecruitingActionConfirmationSnapshot } from "@arc/db-schema/chat-context-bindings";

export type RecruitingActionConfirmationStatus = "confirmed" | "ignored";
export type RecruitingActionConfirmation = RecruitingActionConfirmationSnapshot;

interface ToolLikePart {
  output?: unknown;
  state?: string;
  type: string;
}

const toolLikePartSchema = z
  .object({
    output: z.unknown().optional(),
    state: z.string().optional(),
    type: z.string(),
  })
  .passthrough();

const proposalSchema = z
  .object({
    id: z.string(),
    payload: z.record(z.string(), z.unknown()).optional(),
    type: z.string().optional(),
  })
  .passthrough();

const confirmationSchema = z.object({
  confirmedAt: z.string(),
  jobDescriptionId: z.string().optional(),
  jobDescriptionName: z.string().nullable().optional(),
  status: z.enum(["confirmed", "ignored"]),
}) satisfies z.ZodType<RecruitingActionConfirmation>;

const toolOutputSchema = z
  .object({
    confirmation: confirmationSchema.optional(),
    conversationJobBindingProposal: proposalSchema.optional(),
    proposal: proposalSchema.optional(),
  })
  .passthrough();

type ToolOutput = z.output<typeof toolOutputSchema>;

/** AI SDK stores tools as `tool-${name}` / `dynamic-tool`; Arc uses `type: "tool"`. */
function parseToolLikePart(part: ArcMessage["parts"][number]): ToolLikePart | null {
  const result = toolLikePartSchema.safeParse(part);
  if (!result.success) {
    return null;
  }
  return result.data.type === "tool" ||
    result.data.type === "dynamic-tool" ||
    result.data.type.startsWith("tool-")
    ? result.data
    : null;
}

function parseToolOutput(part: ToolLikePart): ToolOutput | null {
  const result = toolOutputSchema.safeParse(part.output);
  return result.success ? result.data : null;
}

function proposalIdFromOutput(output: ToolOutput): string | null {
  return output.proposal?.id ?? output.conversationJobBindingProposal?.id ?? null;
}

function patchProposal(
  proposal: z.output<typeof proposalSchema>,
  confirmation: RecruitingActionConfirmation,
): z.output<typeof proposalSchema> {
  if (!confirmation.jobDescriptionId) {
    return proposal;
  }
  return {
    ...proposal,
    payload: {
      ...proposal.payload,
      jobDescriptionId: confirmation.jobDescriptionId,
    },
  };
}

function patchProposalOutput(
  output: ToolOutput,
  confirmation: RecruitingActionConfirmation,
  proposalId: string,
): ToolOutput {
  const next = { ...output, confirmation };
  if (output.proposal?.id === proposalId) {
    next.proposal = patchProposal(output.proposal, confirmation);
  }
  if (output.conversationJobBindingProposal?.id === proposalId) {
    next.conversationJobBindingProposal = patchProposal(
      output.conversationJobBindingProposal,
      confirmation,
    );
  }
  return next;
}

function matchingToolOutput(
  part: ArcMessage["parts"][number],
  proposalId: string,
): ToolOutput | null {
  const toolPart = parseToolLikePart(part);
  if (!toolPart || toolPart.state !== "output-available") {
    return null;
  }
  const output = parseToolOutput(toolPart);
  return output && proposalIdFromOutput(output) === proposalId ? output : null;
}

/** Returns patched message when a matching propose/detail tool result was updated. */
export function patchArcMessageRecruitingActionConfirmation(
  message: ArcMessage,
  proposalId: string,
  confirmation: RecruitingActionConfirmation,
): ArcMessage | null {
  let changed = false;
  const parts = message.parts.map((part) => {
    const output = matchingToolOutput(part, proposalId);
    if (!output) {
      return part;
    }
    changed = true;
    return {
      ...part,
      output: patchProposalOutput(output, confirmation, proposalId),
    };
  });
  return changed ? { ...message, parts } : null;
}

/** Later tool results win when the same proposal id appears more than once. */
export function deriveRecruitingActionConfirmationsFromMessages(messages: ArcMessage[]) {
  const confirmations = new Map<string, RecruitingActionConfirmation>();
  for (const message of messages) {
    for (const part of message.parts) {
      const toolPart = parseToolLikePart(part);
      if (!toolPart || toolPart.state !== "output-available") {
        continue;
      }
      const output = parseToolOutput(toolPart);
      if (!output?.confirmation) {
        continue;
      }
      const proposalId = proposalIdFromOutput(output);
      if (proposalId) {
        confirmations.set(proposalId, output.confirmation);
      }
    }
  }
  return Object.fromEntries(confirmations);
}

/** Whether a tool output still shows an unresolved bind proposal (legacy messages). */
export function hasPendingRecruitingBindProposal(
  outputInput: z.input<typeof toolOutputSchema>,
): boolean {
  const result = toolOutputSchema.safeParse(outputInput);
  if (!result.success || result.data.confirmation) {
    return false;
  }
  const proposal = result.data.proposal ?? result.data.conversationJobBindingProposal;
  return proposal?.type === "bind_candidate_to_job" || proposal?.type === "bind_pool_item_to_job";
}
