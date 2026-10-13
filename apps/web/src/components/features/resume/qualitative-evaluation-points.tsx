import { IconAlertTriangle, IconThumbUp } from "@tabler/icons-react";
import type { QualitativeEvaluationSection } from "@app/db-schema/qualitative-resume-evaluation";
import { cn } from "@app/shared/utils";
import { RestrictedMarkdownView } from "@/components/features/display/markdown-view";
import { Badge } from "@/components/ui/badge";

export type QualitativeEvaluationPointKind = "matching" | "risk";

const POINT_META = {
  matching: { icon: IconThumbUp, variant: "success" },
  risk: { icon: IconAlertTriangle, variant: "warning" },
} as const;

/** 左栏固定宽度，让各条要点的 Badge 与正文上下对齐。 */
export const QUALITATIVE_POINT_GRID_CLASS =
  "grid min-w-0 grid-cols-[minmax(0,5.5rem)_minmax(0,1fr)] items-start gap-x-3 sm:grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)] sm:gap-x-4";

/** 要求点标签：复用原子 Badge，匹配为绿色点赞，风险为琥珀色提示。 */
export function QualitativeEvaluationPointBadge({
  className,
  kind,
  muted = false,
  point,
}: {
  className?: string;
  kind: QualitativeEvaluationPointKind;
  /** 已淘汰候选人等非活跃记录：保留图标区分匹配 / 风险，颜色退为灰色。 */
  muted?: boolean;
  point: string;
}) {
  const meta = POINT_META[kind];
  const Icon = meta.icon;
  return (
    <Badge
      className={cn("max-w-full justify-self-start", className)}
      title={point}
      variant={muted ? "default" : meta.variant}
    >
      <Icon aria-hidden="true" />
      <span className="truncate">{point}</span>
    </Badge>
  );
}

/**
 * 匹配依据 / 风险与待确认项：V3 起左栏为要求点 Badge，右栏为结论及其岗位要求、简历原文证据；
 * V1/V2 历史结果仍是受限 Markdown。
 */
export function QualitativeEvaluationPointsView({
  className,
  kind,
  section,
}: {
  className?: string;
  kind: QualitativeEvaluationPointKind;
  section: QualitativeEvaluationSection;
}) {
  if (!Array.isArray(section)) {
    return <RestrictedMarkdownView className={className} content={section} />;
  }
  return (
    <ul className={cn("flex min-w-0 flex-col gap-4", className)}>
      {section.map((item, index) => (
        <li className={QUALITATIVE_POINT_GRID_CLASS} key={`${index}-${item.point}`}>
          <QualitativeEvaluationPointBadge kind={kind} point={item.point} />
          <div className="min-w-0 wrap-break-word">
            <p className="text-foreground">{item.content}</p>
            <dl className="mt-1.5 grid gap-0.5 text-muted-foreground text-xs leading-5">
              <div className="flex min-w-0 gap-2">
                <dt className="shrink-0 text-muted-foreground/70">岗位要求</dt>
                <dd className="min-w-0">{item.jobRequirement}</dd>
              </div>
              <div className="flex min-w-0 gap-2">
                <dt className="shrink-0 text-muted-foreground/70">简历证据</dt>
                <dd className="min-w-0">{item.resumeEvidence ?? "简历未提及"}</dd>
              </div>
            </dl>
          </div>
        </li>
      ))}
    </ul>
  );
}
