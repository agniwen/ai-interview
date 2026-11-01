import type { McpCandidateDetailCard } from "@app/shared/recruiting-mcp-cards";
import {
  CandidateBadges,
  CandidateRoleLine,
  CardSurface,
  ProfileLines,
  SkillChips,
} from "./card-parts";

const actionButtonClass =
  "inline-flex h-7 cursor-pointer items-center rounded-(--radius-control) px-2.5 font-medium text-xs outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-focus";

export function CandidateDetailCard({
  card,
  onBack,
  onOpenLink,
}: {
  card: McpCandidateDetailCard;
  onBack?: () => void;
  onOpenLink?: (url: string) => void;
}) {
  const { candidate } = card;
  const contacts = [candidate.phone, candidate.email].filter(Boolean).join(" · ");
  const workYears = candidate.workYears === null ? null : `${candidate.workYears} 年经验`;
  return (
    <CardSurface>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold text-base">{candidate.name}</h2>
          <CandidateRoleLine candidate={candidate} />
        </div>
        <CandidateBadges candidate={candidate} />
      </div>
      {contacts || workYears ? (
        <p className="mt-2 text-fg-muted text-xs">
          {[workYears, contacts].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      {candidate.summary ? <p className="mt-3 text-sm leading-6">{candidate.summary}</p> : null}
      {candidate.recruiterAssessment ? (
        <section className="mt-3 rounded-(--radius-control) bg-surface-muted px-2.5 py-2">
          <h3 className="font-medium text-fg-subtle text-xs">招聘人员评价</h3>
          <p className="mt-0.5 text-sm leading-6">{candidate.recruiterAssessment}</p>
        </section>
      ) : null}
      <div className="mt-3 space-y-3">
        <ProfileLines lines={candidate.experience} title="工作经历" />
        <ProfileLines lines={candidate.education} title="教育经历" />
        {candidate.skills.length > 0 ? (
          <section>
            <h3 className="font-medium text-fg-subtle text-xs">技能</h3>
            <div className="mt-1">
              <SkillChips skills={candidate.skills} />
            </div>
          </section>
        ) : null}
      </div>
      {onBack || (candidate.url && onOpenLink) ? (
        <div className="mt-3 flex items-center gap-1 border-line border-t pt-3">
          {onBack ? (
            <button
              className={`${actionButtonClass} text-fg-muted hover:bg-surface-hover`}
              onClick={onBack}
              type="button"
            >
              返回列表
            </button>
          ) : null}
          {candidate.url && onOpenLink ? (
            <button
              className={`${actionButtonClass} ms-auto bg-surface-muted hover:bg-surface-hover`}
              onClick={() => candidate.url && onOpenLink(candidate.url)}
              type="button"
            >
              在工作台打开
            </button>
          ) : null}
        </div>
      ) : null}
    </CardSurface>
  );
}
