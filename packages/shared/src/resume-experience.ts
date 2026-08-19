const PLACEHOLDER = "未发现信息";
const CURRENT_PERIOD_PATTERN = /至今|现在|目前|当前|present|current|now/i;

export function isCurrentResumePeriod(period: string | null | undefined): boolean {
  return Boolean(period && CURRENT_PERIOD_PATTERN.test(period));
}

function getPeriodSortKey(period: string | null | undefined): number {
  const value = period?.trim();
  if (!value || value === PLACEHOLDER) {
    return Number.NEGATIVE_INFINITY;
  }
  if (isCurrentResumePeriod(value)) {
    return Number.POSITIVE_INFINITY;
  }

  const dateKeys = [
    ...Array.from(value.matchAll(/(\d{4})(?:[./年-]\s*(\d{1,2})月?)?/gu), (match) => {
      const year = Number(match[1]);
      const month = Number(match[2] ?? 12);
      return year * 12 + month;
    }),
    ...Array.from(value.matchAll(/(\d{1,2})[./-](\d{4})/gu), (match) => {
      const month = Number(match[1]);
      const year = Number(match[2]);
      return year * 12 + month;
    }),
  ];

  return dateKeys.length > 0 ? Math.max(...dateKeys) : Number.NEGATIVE_INFINITY;
}

export function sortResumeExperiencesByPeriod<T extends { period: string | null | undefined }>(
  experiences: readonly T[],
): T[] {
  return experiences
    .map((experience, index) => ({ experience, index }))
    .toSorted((left, right) => {
      const leftPeriod = getPeriodSortKey(left.experience.period);
      const rightPeriod = getPeriodSortKey(right.experience.period);
      return leftPeriod === rightPeriod ? left.index - right.index : rightPeriod - leftPeriod;
    })
    .map(({ experience }) => experience);
}
