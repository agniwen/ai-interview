export interface ResumeEducationLineInput {
  degree?: string | null;
  educationLevel?: string | null;
  major?: string | null;
  school?: string | null;
}

export interface ResumeEducationDisplayItem {
  level: string | null;
  major: string | null;
  school: string;
}

const PLACEHOLDER = "未发现信息";

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed !== PLACEHOLDER ? trimmed : null;
}

function educationLevelRank(education: ResumeEducationLineInput): number {
  const label = [education.educationLevel, education.degree]
    .map(cleanText)
    .filter(Boolean)
    .join(" ");
  if (!label) {
    return 99;
  }
  if (label.includes("硕") || label.includes("研究生")) {
    return 0;
  }
  if (label.includes("本") || label.includes("学士")) {
    return 1;
  }
  if (label.includes("大专") || label.includes("专科") || label.includes("高职")) {
    return 2;
  }
  return 99;
}

export function sortResumeEducationExperiences<T extends ResumeEducationLineInput>(
  educationExperiences: readonly T[] | null | undefined,
): T[] {
  return (educationExperiences ?? [])
    .map((education, index) => ({ education, index }))
    .toSorted((left, right) => {
      const rankDiff = educationLevelRank(left.education) - educationLevelRank(right.education);
      return rankDiff === 0 ? left.index - right.index : rankDiff;
    })
    .map(({ education }) => education);
}

export function formatResumeEducationItem(
  education: ResumeEducationLineInput,
): ResumeEducationDisplayItem | null {
  const school = cleanText(education.school);
  if (!school) {
    return null;
  }

  return {
    level: cleanText(education.educationLevel) ?? cleanText(education.degree),
    major: cleanText(education.major),
    school,
  };
}

export function formatResumeEducationLine(education: ResumeEducationLineInput): string | null {
  const item = formatResumeEducationItem(education);
  if (!item) {
    return null;
  }

  const schoolWithLevel = [item.level, item.school].filter(Boolean).join(" ");
  return [schoolWithLevel, item.major].filter(Boolean).join(" · ");
}

export function formatResumeEducationLines(
  educationExperiences: readonly ResumeEducationLineInput[] | null | undefined,
): string[] {
  return [
    ...new Set(
      sortResumeEducationExperiences(educationExperiences)
        .map(formatResumeEducationLine)
        .filter((item): item is string => item !== null),
    ),
  ];
}

export function formatResumeEducationItems(
  educationExperiences: readonly ResumeEducationLineInput[] | null | undefined,
): ResumeEducationDisplayItem[] {
  const seen = new Set<string>();
  const items: ResumeEducationDisplayItem[] = [];
  for (const education of sortResumeEducationExperiences(educationExperiences)) {
    const item = formatResumeEducationItem(education);
    if (!item) {
      continue;
    }
    const key = [item.level, item.school, item.major].join("\u0000");
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    items.push(item);
  }
  return items;
}
