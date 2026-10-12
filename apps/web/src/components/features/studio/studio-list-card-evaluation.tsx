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
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Skeleton } from "@/components/ui/skeleton";

export const QUALITATIVE_RECOMMENDATION_LABEL = {
  highly_recommended: "非常推荐",
  not_recommended: "不推荐",
  recommended: "推荐",
  undecided: "待定",
} satisfies Record<QualitativeRecommendationLevel, string>;

export const QUALITATIVE_RECOMMENDATION_TONE_CLASS = {
  highly_recommended: "text-purple-700 dark:text-purple-300",
  not_recommended: "text-red-700 dark:text-red-300",
  recommended: "text-green-700 dark:text-green-300",
  undecided: "text-yellow-700 dark:text-yellow-300",
} satisfies Record<QualitativeRecommendationLevel, string>;

/** 卡片 hover 背景与骨架同色，hover 时加深骨架，保证占位仍可见。 */
const CARD_SKELETON_HOVER_CLASS = "group-hover/list-card:bg-foreground/10";

/** 列表卡片的评价文本统一两行截断，行高固定，便于虚拟列表使用固定行高。 */
export const STUDIO_LIST_CARD_EVALUATION_TEXT_CLASS =
  "line-clamp-2 text-[13px] text-foreground leading-[19px] wrap-break-word";

export function StudioListCardRecommendationLabel({
  level,
}: {
  level: QualitativeRecommendationLevel;
}) {
  const toneClass = QUALITATIVE_RECOMMENDATION_TONE_CLASS[level];
  return (
    <>
      <IconSparkles aria-hidden className={cn("mr-1 inline size-3.5 align-[-2px]", toneClass)} />
      <span className={cn("font-medium", toneClass)}>
        {QUALITATIVE_RECOMMENDATION_LABEL[level]}
      </span>
    </>
  );
}

/**
 * 摘录区固定高度：最多 4 条要点，每条最多两行（19px × 2），条间距 12px → 4 × 38 + 3 × 12 = 188px。
 * 旧版 Markdown 摘录沿用同一高度并在底部渐隐，保证虚拟列表行高不随内容变化。
 */
const STUDIO_LIST_CARD_FOCUS_HEIGHT_CLASS = "h-[188px]";
const STUDIO_LIST_CARD_FOCUS_MAX_POINTS = 4;

type FocusPoints = Extract<QualitativeResumeFocus, { format: "points" }>;

function StudioListCardFocusPoint({
  item,
  kind,
}: {
  item: FocusPoints["items"][number];
  kind: FocusPoints["kind"];
}) {
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <li className={cn(QUALITATIVE_POINT_GRID_CLASS, "group/focus-point rounded-sm")}>
            <QualitativeEvaluationPointBadge className="py-0.5" kind={kind} point={item.point} />
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
 * 评语下方的评价摘录：推荐 / 非常推荐为匹配依据，待定 / 不推荐为风险与待确认项（服务端已按等级选好）。
 * V3 为“左栏要求点 Badge + 右栏结论”的两栏列表，最多 4 条、每条两行，悬停展示完整要点；
 * 旧版按受限 Markdown 渲染并在底部渐隐。
 */
export const StudioListCardEvaluationFocus = memo(function StudioListCardEvaluationFocus({
  focus,
}: {
  focus: QualitativeResumeFocus | null;
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
          <StudioListCardFocusPoint item={item} key={`${index}-${item.point}`} kind={focus.kind} />
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

/** 宽屏右侧经历栏在解析中的占位，与正式栏位同宽同间距。 */
export function StudioListCardProfileSnapshotSkeleton() {
  return (
    <div
      aria-hidden
      className="hidden min-w-0 border-border/60 border-l border-dashed pl-8 xl:block"
      data-slot="studio-list-card-profile-snapshot-skeleton"
    >
      <div className="grid min-w-0 gap-1">
        <Skeleton className={cn("my-1 h-4 w-full", CARD_SKELETON_HOVER_CLASS)} />
        <Skeleton className={cn("my-1 h-4 w-4/5", CARD_SKELETON_HOVER_CLASS)} />
        <div className="my-0.5 border-border/60 border-t" />
        <Skeleton className={cn("my-1 h-4 w-3/4", CARD_SKELETON_HOVER_CLASS)} />
      </div>
    </div>
  );
}
