import type { ArcMessage } from "./ai-message";

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
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const value = raw as Partial<RecruitingContextJobBindingMeta>;
  if (
    (value.kind !== "resume_pool_item" && value.kind !== "resume_record") ||
    typeof value.recordId !== "string" ||
    value.recordId.length === 0 ||
    typeof value.jobDescriptionId !== "string" ||
    value.jobDescriptionId.length === 0
  ) {
    return null;
  }
  return {
    jobDescriptionId: value.jobDescriptionId,
    jobDescriptionName:
      typeof value.jobDescriptionName === "string" ? value.jobDescriptionName : null,
    kind: value.kind,
    recordId: value.recordId,
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
