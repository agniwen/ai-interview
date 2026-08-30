import type { UIMessage } from "ai";
import { z } from "zod";
import type { RecruitingActionConfirmation } from "@/components/assistant-ui/recruiting-copilot-context";

const recruitingProposalSchema = z
  .object({
    id: z.string(),
    payload: z.record(z.string(), z.json()).optional(),
    type: z.string().optional(),
  })
  .catchall(z.json());
const recruitingToolOutputSchema = z
  .object({
    confirmation: z
      .object({
        confirmedAt: z.string(),
        jobDescriptionId: z.string().optional(),
        jobDescriptionName: z.string().nullable().optional(),
        status: z.enum(["confirmed", "ignored"]),
      })
      .optional(),
    conversationJobBindingProposal: recruitingProposalSchema.optional(),
    proposal: recruitingProposalSchema.optional(),
  })
  .catchall(z.json());
type RecruitingToolOutput = z.infer<typeof recruitingToolOutputSchema>;

function readProposalId(output: RecruitingToolOutput): string | null {
  return output.proposal?.id ?? output.conversationJobBindingProposal?.id ?? null;
}

function hasConfirmation(output: RecruitingToolOutput): boolean {
  return output.confirmation !== undefined;
}

function patchToolOutput(
  output: RecruitingToolOutput,
  confirmation: RecruitingActionConfirmation,
  proposalId: string,
): RecruitingToolOutput {
  let confirmationPayload:
    | { confirmedAt: string; status: "confirmed" | "ignored" }
    | {
        confirmedAt: string;
        jobDescriptionId: string;
        status: "confirmed" | "ignored";
      }
    | {
        confirmedAt: string;
        jobDescriptionName: string | null;
        status: "confirmed" | "ignored";
      }
    | {
        confirmedAt: string;
        jobDescriptionId: string;
        jobDescriptionName: string | null;
        status: "confirmed" | "ignored";
      };
  if (confirmation.jobDescriptionId && confirmation.jobDescriptionName !== undefined) {
    confirmationPayload = {
      confirmedAt: confirmation.confirmedAt,
      jobDescriptionId: confirmation.jobDescriptionId,
      jobDescriptionName: confirmation.jobDescriptionName,
      status: confirmation.status,
    };
  } else if (confirmation.jobDescriptionId) {
    confirmationPayload = {
      confirmedAt: confirmation.confirmedAt,
      jobDescriptionId: confirmation.jobDescriptionId,
      status: confirmation.status,
    };
  } else if (confirmation.jobDescriptionName === undefined) {
    confirmationPayload = {
      confirmedAt: confirmation.confirmedAt,
      status: confirmation.status,
    };
  } else {
    confirmationPayload = {
      confirmedAt: confirmation.confirmedAt,
      jobDescriptionName: confirmation.jobDescriptionName,
      status: confirmation.status,
    };
  }
  const next = {
    ...output,
    confirmation: confirmationPayload,
  };
  if (output.proposal?.id === proposalId) {
    const payload = { ...output.proposal.payload };
    if (confirmation.jobDescriptionId) {
      payload.jobDescriptionId = confirmation.jobDescriptionId;
    }
    next.proposal = { ...output.proposal, payload };
  }
  if (output.conversationJobBindingProposal?.id === proposalId) {
    const payload = { ...output.conversationJobBindingProposal.payload };
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
      if (
        !("state" in part) ||
        part.state !== "output-available" ||
        !("output" in part) ||
        !(part.type === "dynamic-tool" || part.type.startsWith("tool-"))
      ) {
        return part;
      }
      const output = recruitingToolOutputSchema.safeParse(part.output);
      if (!output.success || readProposalId(output.data) !== proposalId) {
        return part;
      }
      changed = true;
      return {
        ...part,
        output: patchToolOutput(output.data, confirmation, proposalId),
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
    if (
      !("state" in part) ||
      part.state !== "output-available" ||
      !("output" in part) ||
      !(part.type === "dynamic-tool" || part.type.startsWith("tool-"))
    ) {
      return false;
    }
    const output = recruitingToolOutputSchema.safeParse(part.output);
    if (!output.success || hasConfirmation(output.data)) {
      return false;
    }
    const proposal = output.data.proposal ?? output.data.conversationJobBindingProposal;
    if (!proposal) {
      return false;
    }
    return proposal.type === "bind_candidate_to_job" || proposal.type === "bind_pool_item_to_job";
  });
}
