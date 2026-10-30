import { selectPreferredFeishuProviderId } from "@app/feishu/provider";
import type { FeishuProviderId } from "@app/feishu/provider";

/** Calendar ownership is stable; participants without this channel do not constrain it. */
export function selectMeetingFeishuProvider(
  bindings: FeishuProviderId[][],
  persistedProviderId?: FeishuProviderId | null,
): FeishuProviderId | null {
  if (persistedProviderId) {
    return persistedProviderId;
  }
  const available = bindings.filter((providers) => providers.length > 0);
  const common =
    available[0]?.filter((provider) =>
      available.every((providers) => providers.includes(provider)),
    ) ?? [];
  return (
    selectPreferredFeishuProviderId(common) ??
    selectPreferredFeishuProviderId(available.flat()) ??
    null
  );
}

/** An absent channel binding is a normal skip, not a delivery failure. */
export function resolveFeishuMeetingRecipients(
  participants: { id: string; openId: string | null }[],
  interviewerIds: string[],
  createdBy: string | null,
) {
  const byId = new Map(participants.map((participant) => [participant.id, participant.openId]));
  const requiredIds = [...interviewerIds, ...(createdBy ? [createdBy] : [])];
  if (requiredIds.some((id) => !byId.has(id))) {
    throw new Error("面试官不属于当前工作区。");
  }
  return {
    interviewerOpenIds: new Map(
      interviewerIds.flatMap((id) => {
        const openId = byId.get(id);
        return openId ? [[id, openId] as const] : [];
      }),
    ),
    ownerOpenId: createdBy ? (byId.get(createdBy) ?? null) : null,
  };
}
