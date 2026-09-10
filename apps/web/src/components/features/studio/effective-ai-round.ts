import type { RecruitingNodeStateRecord } from "@app/shared/studio-resumes";

/** 当前 AI 依据由招聘节点指定；列表顺序和创建时间都不能替代有效引用。 */
export function findEffectiveAiRound<T extends { id: string }>(
  rounds: readonly T[],
  nodeStates?: readonly Pick<RecruitingNodeStateRecord, "node" | "effectiveAiRoundId">[],
): T | null {
  const roundId = nodeStates?.find((node) => node.node === "ai_interview")?.effectiveAiRoundId;
  return roundId ? (rounds.find((round) => round.id === roundId) ?? null) : null;
}
