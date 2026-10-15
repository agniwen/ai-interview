"use client";

import { IconChevronRight } from "@tabler/icons-react";
import type { PipelineStage } from "@app/db-schema/studio-interviews";
import type { ButtonHTMLAttributes } from "react";

import {
  getCandidateStageBadgeHoverClass,
  getCandidateStageBadgeVariant,
} from "@/components/features/studio/candidate-stage-badge";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@app/shared/utils";

type ResumeLifecycleBadgeTone = "success" | "warning" | "info" | "outline";

/** 悬停加深底色而不是外扩光环：徽标所在的标题行 overflow-hidden，外扩效果会被裁切。 */
const lifecycleHoverClass = {
  info: "hover:bg-foreground/10",
  outline: "hover:bg-muted",
  success: "hover:bg-green-line",
  warning: "hover:bg-amber-line",
} satisfies Record<ResumeLifecycleBadgeTone, string>;

const lifecycleBadgeVariant = {
  info: "default",
  outline: "outline",
  success: "success",
  warning: "warning",
} as const satisfies Record<ResumeLifecycleBadgeTone, "default" | ResumeLifecycleBadgeTone>;

interface ResumeLifecycleBadgeProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  detailLabel?: string | null;
  fullLabel: string;
  stage?: PipelineStage;
  stageLabel: string;
  tone: ResumeLifecycleBadgeTone;
}

export function ResumeLifecycleBadge({
  className,
  detailLabel,
  fullLabel,
  stage,
  stageLabel,
  title,
  tone,
  type,
  ...props
}: ResumeLifecycleBadgeProps) {
  const hasDetail = Boolean(detailLabel);
  const accessibleLabel = hasDetail ? `${stageLabel}，${detailLabel}` : stageLabel;
  const stageVariant = getCandidateStageBadgeVariant(stage);
  const stageHoverClass = getCandidateStageBadgeHoverClass(stage);

  return (
    <button
      aria-label={accessibleLabel}
      className={cn(
        badgeVariants({ variant: stageVariant ?? lifecycleBadgeVariant[tone] }),
        "group/lifecycle max-w-full justify-start gap-1.5 px-2.5 pr-1.5 text-left font-normal",
        "duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset",
        stageHoverClass ?? lifecycleHoverClass[tone],
        className,
      )}
      title={title ?? fullLabel}
      type={type ?? "button"}
      {...props}
    >
      <span className="shrink-0 ">{stageLabel}</span>
      {hasDetail ? (
        <>
          <span aria-hidden className="shrink-0 opacity-45">
            ·
          </span>
          <span className="min-w-0 truncate opacity-75">{detailLabel}</span>
        </>
      ) : null}
      <span
        aria-hidden
        className="ml-auto flex size-4 shrink-0 items-center justify-center rounded-full bg-current/10 opacity-70 transition-[transform,background-color,opacity] duration-200 group-hover/lifecycle:scale-110 group-hover/lifecycle:bg-current/15 group-hover/lifecycle:opacity-100"
      >
        <IconChevronRight className="size-3 transition-transform duration-200 group-hover/lifecycle:scale-110" />
      </span>
    </button>
  );
}
