import type { McpCandidateListCard } from "@app/shared/recruiting-mcp-cards";
import { CandidateBadges, CandidateRoleLine, CardSurface, SkillChips } from "./card-parts";

export function CandidateListCard({
  card,
  onSelectCandidate,
  pendingCandidateId,
}: {
  card: McpCandidateListCard;
  onSelectCandidate?: (candidateId: string) => void;
  pendingCandidateId?: string | null;
}) {
  const hidden = card.total - card.candidates.length;
  if (card.candidates.length === 0) {
    return (
      <CardSurface>
        <p className="text-fg-muted text-sm">没有找到符合条件的候选人。</p>
      </CardSurface>
    );
  }
  return (
    <CardSurface>
      <p className="px-1 pb-2 text-fg-subtle text-xs">共找到 {card.total} 位候选人</p>
      <ul className="space-y-1">
        {card.candidates.map((candidate) => {
          const pending = pendingCandidateId === candidate.id;
          return (
            <li key={candidate.id}>
              <button
                aria-busy={pending || undefined}
                className="w-full cursor-pointer rounded-(--radius-control) px-2 py-2 text-left outline-none transition-colors duration-150 hover:bg-surface-hover focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-default aria-busy:opacity-60"
                disabled={!onSelectCandidate || pending}
                onClick={() => onSelectCandidate?.(candidate.id)}
                type="button"
              >
                <span className="flex items-center gap-2">
                  <span className="min-w-0 truncate font-medium text-sm">{candidate.name}</span>
                  <span className="ms-auto">
                    <CandidateBadges candidate={candidate} />
                  </span>
                </span>
                <span className="mt-0.5 block">
                  <CandidateRoleLine candidate={candidate} />
                </span>
                {candidate.summary ? (
                  <span className="mt-1 line-clamp-2 block text-fg-muted text-xs leading-5">
                    {candidate.summary}
                  </span>
                ) : null}
                {candidate.skills.length > 0 ? (
                  <span className="mt-1.5 block">
                    <SkillChips skills={candidate.skills.slice(0, 5)} />
                  </span>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
      {hidden > 0 ? (
        <p className="px-1 pt-2 text-fg-subtle text-xs">
          还有 {hidden} 位未展示，可让助手翻页查看。
        </p>
      ) : null}
    </CardSurface>
  );
}
