import type { ResumeProfile } from "@arc/db-schema/interview/types";
import { formatResumeEducationSchoolWithLevel } from "@arc/shared/resume-education";
import type { ResumeLibraryProfileSnapshot } from "@arc/shared/studio-resumes";
import { EMPTY_RESUME_PROFILE_SNAPSHOT } from "@arc/shared/studio-resumes";

/** Library list cards keep the original 3-row cap for work/education. */
const LIBRARY_SNAPSHOT_LIMIT = 3;
/** Duplicate-match cards: recent 3 companies, 2 education rows, 3 projects. */
const DEDUP_WORK_LIMIT = 3;
const DEDUP_EDUCATION_LIMIT = 2;
const DEDUP_PROJECT_LIMIT = 3;
const PROFILE_PLACEHOLDER = "未发现信息";

export interface ResumeProfileSnapshotSource {
  resumeEducationExperiences: unknown;
  resumeEducationGraduationYear: string | null;
  resumeEducationLevel: string | null;
  resumeEducationMajor: string | null;
  resumeEducationPeriod: string | null;
  resumeEducationSchool: string | null;
  resumeProjectExperiences: unknown;
  resumeSchool: string | null;
  resumeWorkCompany: string | null;
  resumeWorkExperiences: unknown;
  resumeWorkPeriod: string | null;
  resumeWorkRole: string | null;
}

function cleanText(value: string | null | undefined) {
  const text = value?.trim();
  return text && text !== PROFILE_PLACEHOLDER ? text : null;
}

function formatPeriod(value: string | null | undefined) {
  const text = cleanText(value);
  if (!text) {
    return null;
  }
  const dateTokens = [...text.matchAll(/(\d{4})\s*[./年-]\s*(\d{1,2})\s*月?/gu)]
    .map(([, year, rawMonth]) => {
      const month = Number(rawMonth);
      return month >= 1 && month <= 12 ? `${year}.${month.toString().padStart(2, "0")}` : null;
    })
    .filter((item): item is string => item !== null);
  if (dateTokens.length === 0) {
    const years = [...text.matchAll(/(?:^|[^\d])(\d{4})(?=$|[^\d])/gu)].map((match) => match[1]);
    if (years.length === 0) {
      return text;
    }
    if (years.length === 1 && /(至今|现在|目前|present|current)/iu.test(text)) {
      return `${years[0]} - 至今`;
    }
    return years.slice(0, 2).join(" - ");
  }
  if (dateTokens.length === 1 && /(至今|现在|目前|present|current)/iu.test(text)) {
    return `${dateTokens[0]} - 至今`;
  }
  return dateTokens.slice(0, 2).join(" - ");
}

function toRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> => typeof item === "object" && item !== null,
      )
    : [];
}

function recordText(record: Record<string, unknown>, key: string) {
  const value = record[key];
  return typeof value === "string" ? cleanText(value) : null;
}

type WorkExperience = ResumeProfile["workExperiences"][number];
type EducationExperience = NonNullable<ResumeProfile["educationExperiences"]>[number];
type ProjectExperience = ResumeProfile["projectExperiences"][number];
type SnapshotLine = ResumeLibraryProfileSnapshot["work"][number];

function buildWorkLines(value: unknown): SnapshotLine[] {
  return toRecords(value).flatMap((item: Partial<WorkExperience> & Record<string, unknown>) => {
    const company = recordText(item, "company");
    const role = recordText(item, "role");
    const primary = company ?? role;
    return primary
      ? [
          {
            period: formatPeriod(recordText(item, "period")),
            primary,
            secondary: company ? role : null,
          },
        ]
      : [];
  });
}

function buildEducationLines(value: unknown): SnapshotLine[] {
  return toRecords(value).flatMap(
    (item: Partial<EducationExperience> & Record<string, unknown>) => {
      const school = recordText(item, "school");
      if (!school) {
        return [];
      }
      const educationLevel = recordText(item, "educationLevel");
      return [
        {
          period:
            formatPeriod(recordText(item, "period")) ??
            formatPeriod(recordText(item, "graduationYear")),
          primary: formatResumeEducationSchoolWithLevel({ educationLevel, school }) ?? school,
          secondary: recordText(item, "major"),
        },
      ];
    },
  );
}

function buildProjectLines(value: unknown): SnapshotLine[] {
  return toRecords(value).flatMap((item: Partial<ProjectExperience> & Record<string, unknown>) => {
    const name = recordText(item, "name");
    if (!name) {
      return [];
    }
    return [
      {
        period: formatPeriod(recordText(item, "period")),
        primary: name,
        secondary: recordText(item, "role"),
      },
    ];
  });
}

function legacyWork(row: ResumeProfileSnapshotSource): SnapshotLine[] {
  const primary = cleanText(row.resumeWorkCompany) ?? cleanText(row.resumeWorkRole);
  return primary
    ? [
        {
          period: formatPeriod(row.resumeWorkPeriod),
          primary,
          secondary: cleanText(row.resumeWorkCompany) ? cleanText(row.resumeWorkRole) : null,
        },
      ]
    : [];
}

function legacyEducation(row: ResumeProfileSnapshotSource): SnapshotLine[] {
  const school = cleanText(row.resumeEducationSchool) ?? cleanText(row.resumeSchool);
  return school
    ? [
        {
          period:
            formatPeriod(row.resumeEducationPeriod) ??
            formatPeriod(row.resumeEducationGraduationYear),
          primary:
            formatResumeEducationSchoolWithLevel({
              educationLevel: cleanText(row.resumeEducationLevel),
              school,
            }) ?? school,
          secondary: cleanText(row.resumeEducationMajor),
        },
      ]
    : [];
}

function dateRank(value: string): number | null {
  const months = [...value.matchAll(/(\d{4})\.(\d{1,2})/gu)].map(([, year, month]) => {
    const parsedMonth = Number(month);
    return Number(year) * 12 + (parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : 1);
  });
  if (months.length > 0) {
    return months.at(-1) ?? null;
  }
  const years = [...value.matchAll(/(?:^|[^\d])(\d{4})(?=$|[^\d])/gu)].map(
    ([, year]) => Number(year) * 12,
  );
  return years.at(-1) ?? null;
}

function sortValue(line: SnapshotLine) {
  if (!line.period) {
    return Number.NEGATIVE_INFINITY;
  }
  if (/(至今|现在|目前|present|current)/iu.test(line.period)) {
    return Number.POSITIVE_INFINITY;
  }
  return dateRank(line.period) ?? Number.NEGATIVE_INFINITY;
}

function sortRecentFirst(lines: SnapshotLine[]) {
  return lines.toSorted((a, b) => sortValue(b) - sortValue(a));
}

function takeSnapshotLines(
  lines: SnapshotLine[],
  limit: number,
): { items: SnapshotLine[]; hasMore: boolean } {
  return {
    hasMore: lines.length > limit,
    items: lines.slice(0, limit),
  };
}

function assembleSnapshot(
  input: {
    education: SnapshotLine[];
    projects: SnapshotLine[];
    work: SnapshotLine[];
  },
  limits: { education: number; projects: number; work: number },
): ResumeLibraryProfileSnapshot {
  const work = takeSnapshotLines(sortRecentFirst(input.work), limits.work);
  const education = takeSnapshotLines(sortRecentFirst(input.education), limits.education);
  const projects = takeSnapshotLines(sortRecentFirst(input.projects), limits.projects);
  return {
    education: education.items,
    educationHasMore: education.hasMore,
    projects: projects.items,
    projectsHasMore: projects.hasMore,
    work: work.items,
    workHasMore: work.hasMore,
  };
}

/** Snapshot for duplicate-match cards (3 companies / 2 education / 3 projects). */
export function buildResumeProfileSnapshotFromProfile(
  profile: ResumeProfile | null | undefined,
): ResumeLibraryProfileSnapshot {
  if (!profile) {
    return EMPTY_RESUME_PROFILE_SNAPSHOT;
  }
  return assembleSnapshot(
    {
      education: buildEducationLines(profile.educationExperiences ?? []),
      projects: buildProjectLines(profile.projectExperiences),
      work: buildWorkLines(profile.workExperiences),
    },
    {
      education: DEDUP_EDUCATION_LIMIT,
      projects: DEDUP_PROJECT_LIMIT,
      work: DEDUP_WORK_LIMIT,
    },
  );
}

/**
 * Snapshot for resume-library list cards.
 * Keeps the compact list projection while making recent projects available to
 * the duplicate-match dialog.
 */
export function buildResumeProfileSnapshot(
  row: ResumeProfileSnapshotSource,
): ResumeLibraryProfileSnapshot {
  const work = buildWorkLines(row.resumeWorkExperiences);
  const education = buildEducationLines(row.resumeEducationExperiences);
  const projects = buildProjectLines(row.resumeProjectExperiences);
  return assembleSnapshot(
    {
      education: education.length > 0 ? education : legacyEducation(row),
      projects,
      work: work.length > 0 ? work : legacyWork(row),
    },
    {
      education: LIBRARY_SNAPSHOT_LIMIT,
      projects: DEDUP_PROJECT_LIMIT,
      work: LIBRARY_SNAPSHOT_LIMIT,
    },
  );
}
