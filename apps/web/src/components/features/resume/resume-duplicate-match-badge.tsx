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
  prefix?: string;
  suffix?: string;
}

type DuplicateMatchBadgeDisplayMode = "creation" | "recruiting-entry";

function describeDuplicateMatchBadge(
  duplicateMatch: ResumeDuplicateMatchSummary,
  displayMode: DuplicateMatchBadgeDisplayMode,
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
  const createdAtLabel = formatTimeDisplayText(
    latestMatchedResume.createdAt,
    displayMode === "recruiting-entry" ? "YY年MM月DD日 HH:mm" : undefined,
  );
  if (!createdAtLabel) {
    return { baseLabel, fullLabel: baseLabel };
  }

  if (displayMode === "creation") {
    const latestCreatedAt = Date.parse(latestMatchedResume.createdAt);
    const currentCreatedAt = sourceCreatedAt ? Date.parse(sourceCreatedAt) : Number.NaN;
    const createdAfterSource =
      Number.isFinite(currentCreatedAt) && latestCreatedAt > currentCreatedAt;
    const suffix = createdAfterSource ? `于${createdAtLabel}再次创建` : ` ${createdAtLabel}已创建`;
    return {
      baseLabel,
      creatorImage: latestMatchedResume.creatorImage,
      creatorName,
      fullLabel: `${creatorName}${suffix}`,
      suffix,
    };
  }

  const prefix = "疑似重复记录已经由";
  const suffix = `于${createdAtLabel}加入招聘台`;
  return {
    baseLabel,
    creatorImage: latestMatchedResume.creatorImage,
    creatorName,
    fullLabel: `${prefix}${creatorName}${suffix}`,
    prefix,
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
          <span className="shrink-0">{description.prefix}</span>
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
  displayMode = "creation",
  duplicateMatch,
  onClick,
  sourceCreatedAt,
}: {
  displayMode?: DuplicateMatchBadgeDisplayMode;
  duplicateMatch: ResumeDuplicateMatchSummary;
  onClick?: () => void;
  sourceCreatedAt?: string;
}) {
  const isDuplicate = duplicateMatch.highestLevel === "high";
  const description = describeDuplicateMatchBadge(duplicateMatch, displayMode, sourceCreatedAt);
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
