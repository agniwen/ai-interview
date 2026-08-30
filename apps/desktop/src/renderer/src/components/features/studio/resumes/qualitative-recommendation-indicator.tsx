import type { QualitativeRecommendationLevel } from "@arc/db-schema/qualitative-resume-evaluation";
import { cn } from "@arc/shared/utils";
import { Icon } from "@/components/ui/icon";

export const QUALITATIVE_RECOMMENDATION_LABEL = {
  highly_recommended: "非常推荐",
  not_recommended: "不推荐",
  recommended: "推荐",
  undecided: "待定",
} as const satisfies Record<QualitativeRecommendationLevel, string>;

export const QUALITATIVE_RECOMMENDATION_TEXT_CLASS = {
  highly_recommended: "text-purple-700 dark:text-purple-300",
  not_recommended: "text-red-700 dark:text-red-300",
  recommended: "text-green-700 dark:text-green-300",
  undecided: "text-yellow-700 dark:text-yellow-300",
} as const satisfies Record<QualitativeRecommendationLevel, string>;

const LEVEL_META = {
  highly_recommended: {
    className: QUALITATIVE_RECOMMENDATION_TEXT_CLASS.highly_recommended,
    icon: "ph:sparkle",
    label: QUALITATIVE_RECOMMENDATION_LABEL.highly_recommended,
  },
  not_recommended: {
    className: QUALITATIVE_RECOMMENDATION_TEXT_CLASS.not_recommended,
    icon: "ph:x",
    label: QUALITATIVE_RECOMMENDATION_LABEL.not_recommended,
  },
  recommended: {
    className: QUALITATIVE_RECOMMENDATION_TEXT_CLASS.recommended,
    icon: "ph:thumbs-up",
    label: QUALITATIVE_RECOMMENDATION_LABEL.recommended,
  },
  undecided: {
    className: QUALITATIVE_RECOMMENDATION_TEXT_CLASS.undecided,
    icon: "ph:question",
    label: QUALITATIVE_RECOMMENDATION_LABEL.undecided,
  },
} as const;

export function QualitativeRecommendationIndicator({
  level,
  className,
}: {
  level: QualitativeRecommendationLevel;
  className?: string;
}) {
  const meta = LEVEL_META[level];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 font-medium text-xs leading-none",
        meta.className,
        className,
      )}
      data-qualitative-recommendation={level}
    >
      <Icon icon={meta.icon} aria-hidden="true" className="size-3.5 shrink-0" />
      {meta.label}
    </span>
  );
}
