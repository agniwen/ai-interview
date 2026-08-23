"use client";

import type { ResumeDuplicateMatchSummary } from "@arc/shared/resume-duplicates";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { formatTimeDisplayText } from "@/components/features/display/time-display";

interface DuplicateMatchBadgeDescription {
  baseLabel: string;
  creatorImage?: string | null;
  creatorName?: string;
  fullLabel: string;
  suffix?: string;
}

function describeDuplicateMatchBadge(
  duplicateMatch: ResumeDuplicateMatchSummary,
  sourceCreatedAt?: string,
): DuplicateMatchBadgeDescription {
  const isDuplicate = duplicateMatch.highestLevel === "high";
  const badgeText = isDuplicate ? "重复简历" : "相似简历";
  const baseLabel =
    duplicateMatch.count > 1 ? `${badgeText} ${duplicateMatch.count} 条` : badgeText;
  const { latestMatchedResume } = duplicateMatch;
  if (!(isDuplicate && latestMatchedResume)) {
    return { baseLabel, fullLabel: baseLabel };
  }

  const creatorName = latestMatchedResume.creatorName ?? "未知创建人";
  const latestCreatedAt = Date.parse(latestMatchedResume.createdAt);
  const currentCreatedAt = sourceCreatedAt ? Date.parse(sourceCreatedAt) : Number.NaN;
  const createdAtLabel = formatTimeDisplayText(latestMatchedResume.createdAt);
  if (!createdAtLabel) {
    return { baseLabel, fullLabel: baseLabel };
  }
  if (Number.isFinite(currentCreatedAt) && latestCreatedAt > currentCreatedAt) {
    const suffix = `于${createdAtLabel}再次创建`;
    return {
      baseLabel,
      creatorImage: latestMatchedResume.creatorImage,
      creatorName,
      fullLabel: `${creatorName}${suffix}`,
      suffix,
    };
  }

  const suffix = ` ${createdAtLabel}已创建`;
  return {
    baseLabel,
    creatorImage: latestMatchedResume.creatorImage,
    creatorName,
    fullLabel: `${creatorName}${suffix}`,
    suffix,
  };
}

function DuplicateMatchBadgeContent({
  description,
}: {
  description: DuplicateMatchBadgeDescription;
}) {
  return (
    <>
      {description.creatorName && description.suffix ? (
        <span className="inline-flex min-w-0 items-center">
          <Avatar
            aria-hidden
            className="mx-0.5 size-4"
            generatedSize={16}
            seed={`creator:${description.creatorName}`}
          >
            <AvatarImage alt="" src={description.creatorImage ?? undefined} />
            <AvatarFallback aria-hidden className="text-[8px] leading-none">
              {description.creatorName.slice(0, 1)}
            </AvatarFallback>
          </Avatar>
          <span className="max-w-20 truncate" data-slot="duplicate-match-creator">
            {`${description.creatorName}`}
          </span>
          <span className="shrink-0">{description.suffix}</span>
        </span>
      ) : (
        <span className="shrink-0">{description.baseLabel}</span>
      )}
    </>
  );
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
  const description = describeDuplicateMatchBadge(duplicateMatch, sourceCreatedAt);
  const variant = isDuplicate ? "destructive" : "secondary";

  if (!onClick) {
    return (
      <Badge className="max-w-full" title={description.fullLabel} variant={variant}>
        <DuplicateMatchBadgeContent description={description} />
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
          className="inline-flex min-w-0 items-center overflow-hidden"
          type="button"
        >
          <DuplicateMatchBadgeContent description={description} />
        </button>
      }
      title={description.fullLabel}
      variant={variant}
    />
  );
}
