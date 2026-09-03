import type { ArcMessage } from "./ai-message";
import { z } from "zod";

/** Snapshot of a recruiting action card decision persisted in tool JSON. */
export interface RecruitingActionConfirmationSnapshot {
  confirmedAt: string;
  jobDescriptionId?: string;
  jobDescriptionName?: string | null;
  status: "confirmed" | "ignored";
}

/** Conversation-scoped person↔job bindings derived from chat messages. */
export interface ChatContextBindings {
  actionConfirmations?: Record<string, RecruitingActionConfirmationSnapshot>;
  resume_pool_item?: Record<string, string>;
  resume_record?: Record<string, string>;
}

export const EMPTY_CHAT_CONTEXT_BINDINGS: ChatContextBindings = {};

export const RECRUITING_CONTEXT_JOB_BINDING_META_KEY = "recruitingContextJobBinding";

export interface RecruitingContextJobBindingMeta {
  jobDescriptionId: string;
  jobDescriptionName?: string | null;
  kind: "resume_pool_item" | "resume_record";
  recordId: string;
}

const recruitingContextJobBindingMetaSchema = z.object({
  jobDescriptionId: z.string().min(1),
  jobDescriptionName: z.string().nullable().optional(),
  kind: z.enum(["resume_pool_item", "resume_record"]),
  recordId: z.string().min(1),
});

export function buildContextJobBindingMessageId(
  kind: RecruitingContextJobBindingMeta["kind"],
  recordId: string,
): string {
  return `copilot-job-binding:${kind}:${recordId}`;
}

export function readRecruitingContextJobBinding(
  message: ArcMessage,
): RecruitingContextJobBindingMeta | null {
  const raw = message.metadata?.[RECRUITING_CONTEXT_JOB_BINDING_META_KEY];
  const parsed = recruitingContextJobBindingMetaSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  return {
    jobDescriptionId: parsed.data.jobDescriptionId,
    jobDescriptionName: parsed.data.jobDescriptionName ?? null,
    kind: parsed.data.kind,
    recordId: parsed.data.recordId,
  };
}

/** Later messages win when the same person is re-bound in the same conversation. */
export function deriveChatContextBindingsFromMessages(messages: ArcMessage[]): ChatContextBindings {
  const bindings: ChatContextBindings = {};
  for (const message of messages) {
    const binding = readRecruitingContextJobBinding(message);
    if (!binding) {
      continue;
    }
    const bucket = bindings[binding.kind] ?? {};
    bucket[binding.recordId] = binding.jobDescriptionId;
    bindings[binding.kind] = bucket;
  }
  return bindings;
}
