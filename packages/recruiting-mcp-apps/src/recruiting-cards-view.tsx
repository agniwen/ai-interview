import type { McpCandidateDetailCard, RecruitingMcpCard } from "@app/shared/recruiting-mcp-cards";
import { CandidateDetailCard } from "./cards/candidate-detail-card";
import { CandidateListCard } from "./cards/candidate-list-card";

export interface RecruitingCardsViewProps {
  /** 工具调用结果对应的卡片；工具结果到达前为 null。 */
  card: RecruitingMcpCard | null;
  /** 从列表中点开的候选人详情。 */
  detail: McpCandidateDetailCard | null;
  error: string | null;
  pendingCandidateId: string | null;
  onBack: () => void;
  onOpenLink?: (url: string) => void;
  onSelectCandidate?: (candidateId: string) => void;
}

/** 纯展示层：根据工具结果分发到具体卡片，不直接接触宿主通信。 */
export function RecruitingCardsView({
  card,
  detail,
  error,
  pendingCandidateId,
  onBack,
  onOpenLink,
  onSelectCandidate,
}: RecruitingCardsViewProps) {
  if (error && !card) {
    return <p className="p-3 text-fg-muted text-sm">{error}</p>;
  }
  if (!card) {
    return (
      <p aria-live="polite" className="p-3 text-fg-subtle text-sm">
        正在读取招聘数据…
      </p>
    );
  }
  if (detail) {
    return <CandidateDetailCard card={detail} onBack={onBack} onOpenLink={onOpenLink} />;
  }
  if (card.kind === "candidate_detail") {
    return <CandidateDetailCard card={card} onOpenLink={onOpenLink} />;
  }
  return (
    <div className="space-y-2">
      <CandidateListCard
        card={card}
        onSelectCandidate={onSelectCandidate}
        pendingCandidateId={pendingCandidateId}
      />
      {error ? (
        <p className="px-1 text-fg-muted text-xs" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
