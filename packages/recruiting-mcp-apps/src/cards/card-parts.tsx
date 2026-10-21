import type { ReactNode } from "react";
import type { McpCandidateCard } from "@app/shared/recruiting-mcp-cards";

type Tone = "neutral" | "info" | "success" | "warning";

const toneClass = {
  info: "bg-(--color-background-info) text-(--color-text-info)",
  neutral: "bg-surface-muted text-fg-muted",
  success: "bg-(--color-background-success) text-(--color-text-success)",
  warning: "bg-(--color-background-warning) text-(--color-text-warning)",
} as const satisfies Record<Tone, string>;

function recommendationTone(level: string): Tone {
  switch (level) {
    case "highly_recommended": {
      return "success";
    }
    case "recommended": {
      return "info";
    }
    case "undecided": {
      return "warning";
    }
    default: {
      return "neutral";
    }
  }
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      className={`inline-flex h-5 shrink-0 items-center rounded-full px-2 font-medium text-[11px] ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}

/** 阶段 / 结论 / AI 推荐等级，按候选人卡片上的固定顺序展示。 */
export function CandidateBadges({ candidate }: { candidate: McpCandidateCard }) {
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Badge>{candidate.outcome?.label ?? candidate.stage.label}</Badge>
      {candidate.recommendation ? (
        <Badge tone={recommendationTone(candidate.recommendation.value)}>
          AI {candidate.recommendation.label}
        </Badge>
      ) : null}
    </span>
  );
}

export function CandidateRoleLine({ candidate }: { candidate: McpCandidateCard }) {
  const parts = [candidate.jobName, candidate.targetRole].filter(
    (part, index, all): part is string => Boolean(part) && all.indexOf(part) === index,
  );
  if (parts.length === 0) {
    return null;
  }
  return <span className="block truncate text-fg-muted text-xs">{parts.join(" · ")}</span>;
}

// 列表行整体是按钮，按钮内只能放短语内容，所以用 span 而不是 ul/li。
// List rows are buttons, which only accept phrasing content.
export function SkillChips({ skills }: { skills: string[] }) {
  if (skills.length === 0) {
    return null;
  }
  return (
    <span className="flex flex-wrap gap-1">
      {skills.map((skill) => (
        <span
          className="rounded-(--radius-control) bg-surface-muted px-1.5 py-0.5 text-[11px] text-fg-muted"
          key={skill}
        >
          {skill}
        </span>
      ))}
    </span>
  );
}

export function ProfileLines({
  lines,
  title,
}: {
  lines: McpCandidateCard["experience"];
  title: string;
}) {
  if (lines.length === 0) {
    return null;
  }
  return (
    <section>
      <h3 className="font-medium text-fg-subtle text-xs">{title}</h3>
      <ul className="mt-1 space-y-1">
        {lines.map((line) => (
          <li className="flex items-baseline gap-2 text-sm" key={`${line.primary}-${line.period}`}>
            <span className="min-w-0 truncate">
              {line.primary}
              {line.secondary ? <span className="text-fg-muted"> · {line.secondary}</span> : null}
            </span>
            {line.period ? (
              <span className="ms-auto shrink-0 text-fg-subtle text-xs tabular-nums">
                {line.period}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CardSurface({ children }: { children: ReactNode }) {
  return <div className="rounded-card bg-surface p-3 text-fg shadow-card">{children}</div>;
}
