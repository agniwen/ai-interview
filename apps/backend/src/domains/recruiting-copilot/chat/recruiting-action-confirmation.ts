import { z } from "zod";
import type { ArcMessage } from "@arc/db-schema/ai-message";

const toolPartSchema = z
  .object({ output: z.unknown().optional(), state: z.string().optional(), type: z.string() })
  .passthrough();
const proposalSchema = z.object({ id: z.string() }).passthrough();
const confirmationSchema = z.object({
  confirmedAt: z.string(),
  jobDescriptionId: z.string().optional(),
  jobDescriptionName: z.string().nullable().optional(),
  status: z.enum(["confirmed", "ignored"]),
});
const outputSchema = z
  .object({
    confirmation: confirmationSchema.optional(),
    conversationJobBindingProposal: proposalSchema.optional(),
    proposal: proposalSchema.optional(),
  })
  .passthrough();

export function deriveRecruitingActionConfirmations(messages: ArcMessage[]) {
  const confirmations = new Map<string, z.infer<typeof confirmationSchema>>();
  for (const message of messages) {
    for (const part of message.parts) {
      const tool = toolPartSchema.safeParse(part);
      if (
        !tool.success ||
        tool.data.state !== "output-available" ||
        (tool.data.type !== "tool" &&
          tool.data.type !== "dynamic-tool" &&
          !tool.data.type.startsWith("tool-"))
      ) {
        continue;
      }
      const output = outputSchema.safeParse(tool.data.output);
      if (!output.success || !output.data.confirmation) {
        continue;
      }
      const proposalId = output.data.proposal?.id ?? output.data.conversationJobBindingProposal?.id;
      if (proposalId) {
        confirmations.set(proposalId, output.data.confirmation);
      }
    }
  }
  return Object.fromEntries(confirmations);
}
