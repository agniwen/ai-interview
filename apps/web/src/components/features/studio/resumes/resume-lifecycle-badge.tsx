"use client";

import { IconChevronRight } from "@tabler/icons-react";
import type { PipelineStage } from "@app/db-schema/studio-interviews";
import type { ButtonHTMLAttributes } from "react";

import {
  getCandidateStageBadgeHoverRingClass,
  getCandidateStageBadgeVariant,
} from "@/components/features/studio/candidate-stage-badge";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@app/shared/utils";

type ResumeLifecycleBadgeTone = "success" | "warning" | "info" | "outline";

const lifecycleHoverRingClass = {
  info: "hover:ring-indigo-500/10",
  outline: "hover:ring-muted/70 dark:hover:ring-muted/50",
  success: "hover:ring-emerald-500/10",
  warning: "hover:ring-amber-500/10",
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
  const stageHoverRingClass = getCandidateStageBadgeHoverRingClass(stage);

  return (
    <button
      aria-label={accessibleLabel}
      className={cn(
        badgeVariants({ variant: stageVariant ?? lifecycleBadgeVariant[tone] }),
        "group/lifecycle max-w-full justify-start gap-1.5 px-2.5 py-1 pr-1.5 text-left font-normal",
        "duration-200 hover:ring-2 focus-visible:outline-none",
        stageHoverRingClass ?? lifecycleHoverRingClass[tone],
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
        className="ml-auto flex size-4 shrink-0 items-center justify-center rounded-full border border-current/25 bg-current/10 opacity-70 transition-[transform,background-color,opacity] duration-200 group-hover/lifecycle:scale-110 group-hover/lifecycle:bg-current/15 group-hover/lifecycle:opacity-100"
      >
        <IconChevronRight className="size-3 transition-transform duration-200 group-hover/lifecycle:scale-110" />
      </span>
    </button>
  );
}
