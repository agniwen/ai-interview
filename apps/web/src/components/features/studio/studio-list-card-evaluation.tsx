import { IconSparkles } from "@tabler/icons-react";
import type { QualitativeRecommendationLevel } from "@app/db-schema/qualitative-resume-evaluation";
import type { QualitativeResumeFocus } from "@app/shared/qualitative-resume-focus";
import { cn } from "@app/shared/utils";
import { memo } from "react";
import type { ReactNode } from "react";

import { RestrictedMarkdownView } from "@/components/features/display/markdown-view";
import {
  QUALITATIVE_POINT_GRID_CLASS,
  QualitativeEvaluationPointBadge,
} from "@/components/features/resume/qualitative-evaluation-points";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";

export const QUALITATIVE_RECOMMENDATION_LABEL = {
  highly_recommended: "非常推荐",
  not_recommended: "不推荐",
  recommended: "推荐",
  undecided: "待定",
} satisfies Record<QualitativeRecommendationLevel, string>;

export type StudioListCardVerdictTone = "danger" | "highlight" | "muted" | "success" | "warning";

/** AI 结论徽标配色：非常推荐用紫色强调，其余沿用语义色；与“AI 初面”阶段徽标的紫色同源。 */
const VERDICT_BADGE_CLASS = {
  danger: "",
  highlight:
    "border-violet-500/20 bg-violet-500/10 text-violet-700 dark:border-violet-400/30 dark:bg-violet-400/15 dark:text-violet-300",
  muted: "",
  success: "",
  warning: "",
} satisfies Record<StudioListCardVerdictTone, string>;

const VERDICT_BADGE_VARIANT = {
  danger: "danger",
  highlight: "default",
  muted: "default",
  success: "success",
  warning: "warning",
} as const satisfies Record<StudioListCardVerdictTone, string>;

export const QUALITATIVE_RECOMMENDATION_VERDICT_TONE = {
  highly_recommended: "highlight",
  not_recommended: "danger",
  recommended: "success",
  undecided: "warning",
} satisfies Record<QualitativeRecommendationLevel, StudioListCardVerdictTone>;

/**
 * 标题行里的 AI 结论徽标：扫读列表时第一眼看到“AI 怎么看”，评语行只保留结论文字。
 * 仅为建议，不代表招聘决策。
 */
export function StudioListCardAiVerdictBadge({
  label,
  muted = false,
  tone,
}: {
  label: string;
  /** 已淘汰等非活跃记录：徽标改为灰色。 */
  muted?: boolean;
  tone: StudioListCardVerdictTone;
}) {
  const effectiveTone = muted ? "muted" : tone;
  return (
    <Badge
      className={cn("shrink-0", VERDICT_BADGE_CLASS[effectiveTone])}
      data-slot="studio-list-card-ai-verdict"
      title={`AI 评价：${label}`}
      variant={VERDICT_BADGE_VARIANT[effectiveTone]}
    >
      <IconSparkles aria-hidden />
      <span className="sr-only">AI 评价：</span>
      {label}
    </Badge>
  );
}

/** 卡片 hover 背景与骨架同色，hover 时加深骨架，保证占位仍可见。 */
const CARD_SKELETON_HOVER_CLASS = "group-hover/list-card:bg-foreground/10";

/** 列表卡片的评价文本统一两行截断，行高固定，便于虚拟列表使用固定行高。 */
export const STUDIO_LIST_CARD_EVALUATION_TEXT_CLASS =
  "line-clamp-2 text-[13px] text-foreground leading-[19px] wrap-break-word";

/**
 * 摘录区固定高度：最多 4 条要点，每条最多两行（19px × 2），条间距 12px → 4 × 38 + 3 × 12 = 188px。
 * 旧版 Markdown 摘录沿用同一高度并在底部渐隐，保证虚拟列表行高不随内容变化。
 */
const STUDIO_LIST_CARD_FOCUS_HEIGHT_CLASS = "h-[188px]";
const STUDIO_LIST_CARD_FOCUS_MAX_POINTS = 4;

type FocusPoints = Extract<QualitativeResumeFocus, { format: "points" }>;

function StudioListCardFocusPoint({
  item,
  muted,
}: {
  item: FocusPoints["items"][number];
  muted: boolean;
}) {
  const { kind } = item;
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <li className={cn(QUALITATIVE_POINT_GRID_CLASS, "group/focus-point rounded-sm")}>
            <QualitativeEvaluationPointBadge
              className="py-0.5"
              kind={kind}
              muted={muted}
              point={item.point}
            />
            <p className="line-clamp-2 min-w-0 wrap-break-word underline decoration-transparent underline-offset-2 transition-colors group-hover/focus-point:decoration-foreground/40">
              {item.content}
            </p>
          </li>
        }
      />
      <HoverCardContent align="start" className="w-96 space-y-2.5" side="bottom">
        <QualitativeEvaluationPointBadge kind={kind} point={item.point} />
        <p className="text-foreground text-sm leading-6">{item.content}</p>
        <dl className="grid gap-1.5 text-xs leading-5">
          <div>
            <dt className="text-muted-foreground">岗位要求</dt>
            <dd className="text-foreground">{item.jobRequirement}</dd>
          </div>
          <div>
            <dt className="text-muted-foreground">原文证据</dt>
            <dd className="text-foreground">{item.resumeEvidence ?? "简历未提及"}</dd>
          </div>
        </dl>
      </HoverCardContent>
    </HoverCard>
  );
}

/**
 * 评语下方的评价摘录：V3 为“匹配依据在前、风险与待确认项在后”的平衡要点（服务端已选好，最多 4 条），
 * 左栏要求点 Badge 区分匹配 / 风险，右栏结论每条两行，悬停展示完整要点；
 * 旧版按受限 Markdown 渲染并在底部渐隐。
 */
export const StudioListCardEvaluationFocus = memo(function StudioListCardEvaluationFocus({
  focus,
  muted = false,
}: {
  focus: QualitativeResumeFocus | null;
  /** 已淘汰等非活跃记录：要点徽标改为灰色。 */
  muted?: boolean;
}) {
  if (!focus || (focus.format === "points" ? focus.items.length === 0 : !focus.text.trim())) {
    return null;
  }
  if (focus.format === "points") {
    return (
      <ul
        className={cn(
          "grid min-w-0 content-start gap-3 overflow-hidden text-[13px] text-foreground leading-[19px]",
          STUDIO_LIST_CARD_FOCUS_HEIGHT_CLASS,
        )}
        data-slot="studio-list-card-evaluation-focus"
      >
        {focus.items.slice(0, STUDIO_LIST_CARD_FOCUS_MAX_POINTS).map((item, index) => (
          <StudioListCardFocusPoint
            item={item}
            key={`${index}-${item.kind}-${item.point}`}
            muted={muted}
          />
        ))}
      </ul>
    );
  }
  return (
    <div
      className={cn(
        "min-w-0 overflow-hidden [mask-image:linear-gradient(to_bottom,#000_calc(100%-19px),transparent)]",
        STUDIO_LIST_CARD_FOCUS_HEIGHT_CLASS,
      )}
      data-slot="studio-list-card-evaluation-focus"
    >
      <RestrictedMarkdownView
        className="text-foreground [--typeset-flow:0.25em] [--typeset-leading:19px] [--typeset-size:13px]"
        content={focus.text}
      />
    </div>
  );
});

const FOCUS_SKELETON_ROWS = [
  ["w-16", "w-full", "w-4/5"],
  ["w-20", "w-11/12", "w-2/3"],
  ["w-14", "w-full", "w-3/4"],
  ["w-16", "w-5/6", "w-1/2"],
] as const;

/** 摘录区骨架：4 行“Badge + 两行正文”，与正式摘录区同高（188px）。 */
function StudioListCardFocusSkeletonRows() {
  return (
    <div
      aria-hidden
      className={cn("grid min-w-0 content-start gap-3", STUDIO_LIST_CARD_FOCUS_HEIGHT_CLASS)}
      data-slot="studio-list-card-evaluation-focus-skeleton"
    >
      {FOCUS_SKELETON_ROWS.map(([badge, first, second]) => (
        <div className={QUALITATIVE_POINT_GRID_CLASS} key={`${badge}-${first}-${second}`}>
          <Skeleton className={cn("h-[22px] rounded-[8px]", badge, CARD_SKELETON_HOVER_CLASS)} />
          <div className="grid">
            <Skeleton className={cn("my-[3px] h-[13px]", first, CARD_SKELETON_HOVER_CLASS)} />
            <Skeleton className={cn("my-[3px] h-[13px]", second, CARD_SKELETON_HOVER_CLASS)} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** AI 评价生成中、尚无摘录时的占位：与摘录区同高，完成后卡片不跳动。 */
export function StudioListCardEvaluationFocusSkeleton() {
  return <StudioListCardFocusSkeletonRows />;
}

/** 卡片评价区：概述在上，摘录在下；外层控制与元信息行的间距。 */
export function StudioListCardEvaluation({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn("mt-3 grid min-w-0 gap-2.5", className)}>{children}</div>;
}

const SUMMARY_SKELETON_LINES = ["w-full", "w-3/4"] as const;

/** 与评价区同高的骨架：评语两行（每行 19px）+ 摘录区，段间距与正式内容一致。 */
export function StudioListCardEvaluationSkeletonLines({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("mt-3 grid min-w-0 gap-2.5", className)}>
      <div className="grid">
        {SUMMARY_SKELETON_LINES.map((width) => (
          <Skeleton
            className={cn("my-[3px] h-[13px]", width, CARD_SKELETON_HOVER_CLASS)}
            key={width}
          />
        ))}
      </div>
      <StudioListCardFocusSkeletonRows />
    </div>
  );
}

/** 简历解析中：用评价区骨架占位，避免解析完成后卡片内容跳动。 */
export function StudioListCardEvaluationSkeleton() {
  return (
    <output
      aria-label="简历解析中"
      className="block"
      data-slot="studio-list-card-evaluation-skeleton"
    >
      <StudioListCardEvaluationSkeletonLines />
    </output>
  );
}

/** 宽屏右侧经历栏在解析中的占位，放在经历栏单元格内，与正式内容同宽。 */
export function StudioListCardProfileSnapshotSkeleton() {
  return (
    <div
      aria-hidden
      className="grid min-w-0 gap-1"
      data-slot="studio-list-card-profile-snapshot-skeleton"
    >
      <Skeleton className={cn("my-1 h-4 w-full", CARD_SKELETON_HOVER_CLASS)} />
      <Skeleton className={cn("my-1 h-4 w-4/5", CARD_SKELETON_HOVER_CLASS)} />
      <div className="my-0.5 border-border/60 border-t" />
      <Skeleton className={cn("my-1 h-4 w-3/4", CARD_SKELETON_HOVER_CLASS)} />
    </div>
  );
}
