"use client";

import type { ResumeDuplicateMatchSummary } from "@arc/shared/resume-duplicates";
import { Badge } from "@/components/ui/badge";
import { formatTimeDisplayText } from "@/components/features/display/time-display";

function getDuplicateMatchBadgeLabel(
  duplicateMatch: ResumeDuplicateMatchSummary,
  sourceCreatedAt?: string,
) {
  const isDuplicate = duplicateMatch.highestLevel === "high";
  const badgeText = isDuplicate ? "重复简历" : "相似简历";
  const baseLabel =
    duplicateMatch.count > 1 ? `${badgeText} ${duplicateMatch.count} 条` : badgeText;
  const { latestMatchedResume } = duplicateMatch;
  if (!(isDuplicate && latestMatchedResume)) {
    return baseLabel;
  }

  const creatorName = latestMatchedResume.creatorName ?? "未知创建人";
  const latestCreatedAt = Date.parse(latestMatchedResume.createdAt);
  const currentCreatedAt = sourceCreatedAt ? Date.parse(sourceCreatedAt) : Number.NaN;
  if (Number.isFinite(currentCreatedAt) && latestCreatedAt > currentCreatedAt) {
    return `${baseLabel}，${creatorName}创建，晚于当前简历创建`;
  }

  const createdAtLabel = formatTimeDisplayText(latestMatchedResume.createdAt);
  return createdAtLabel ? `${baseLabel}，${creatorName}于 ${createdAtLabel} 创建` : baseLabel;
}

export function ResumeDuplicateMatchBadge({
  duplicateMatch,
  onClick,
  sourceCreatedAt,
}: {
  duplicateMatch: ResumeDuplicateMatchSummary;
  onClick?: () => void;
  sourceCreatedAt?: string;
}) {
  const isDuplicate = duplicateMatch.highestLevel === "high";
  const label = getDuplicateMatchBadgeLabel(duplicateMatch, sourceCreatedAt);
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
