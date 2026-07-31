"use client";

import type { ResumeDuplicateMatchSummary } from "@arc/shared/resume-duplicates";
import { Badge } from "@/components/ui/badge";

export function ResumeDuplicateMatchBadge({
  duplicateMatch,
  onClick,
}: {
  duplicateMatch: ResumeDuplicateMatchSummary;
  onClick?: () => void;
}) {
  const isDuplicate = duplicateMatch.highestLevel === "high";
  const badgeText = isDuplicate ? "重复简历" : "相似简历";
  const label = duplicateMatch.count > 1 ? `${badgeText} ${duplicateMatch.count} 条` : badgeText;
  const variant = isDuplicate ? "destructive" : "secondary";

  if (!onClick) {
    return (
      <Badge className="max-w-full" variant={variant}>
        {label}
      </Badge>
    );
  }

  return (
    <Badge
      className="max-w-full cursor-pointer"
      render={
        <button
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
          }}
          type="button"
        >
          {label}
        </button>
      }
      variant={variant}
    />
  );
}
