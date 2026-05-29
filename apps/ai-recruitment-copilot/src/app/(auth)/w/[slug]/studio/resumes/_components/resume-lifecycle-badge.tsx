"use client";

import type { ButtonHTMLAttributes } from "react";
import { ChevronRightIcon } from "lucide-react";
import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/shared/utils";

type ResumeLifecycleBadgeTone = "success" | "warning" | "info" | "outline";

interface ResumeLifecycleBadgeProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children"
> {
  detailLabel?: string | null;
  fullLabel: string;
  stageLabel: string;
  tone: ResumeLifecycleBadgeTone;
}

export function ResumeLifecycleBadge({
  className,
  detailLabel,
  fullLabel,
  stageLabel,
  title,
  tone,
  type,
  ...props
}: ResumeLifecycleBadgeProps) {
  const hasDetail = Boolean(detailLabel);
  const accessibleLabel = hasDetail ? `${stageLabel}，${detailLabel}` : stageLabel;

  return (
    <button
      aria-label={accessibleLabel}
      className={cn(
        badgeVariants({ variant: tone }),
        "max-w-full cursor-pointer justify-start gap-1.5 px-2.5 py-1 pr-1.5 text-left font-normal",
        "focus-visible:outline-none",
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
        className="ml-auto flex size-4 shrink-0 items-center justify-center rounded-full border border-current/25 bg-current/10 opacity-70"
      >
        <ChevronRightIcon className="size-3" />
      </span>
    </button>
  );
}
