import type { ResumeProfile } from "@app/db-schema/interview/types";
import {
  resumeEducationExperienceSchema,
  resumeProjectExperienceSchema,
  resumeWorkExperienceSchema,
} from "@app/db-schema/interview/types";
import { z } from "zod";
import { formatResumeEducationSchoolWithLevel } from "@app/shared/resume-education";
import type { ResumeLibraryProfileSnapshot } from "@app/shared/studio-resumes";
import { EMPTY_RESUME_PROFILE_SNAPSHOT } from "@app/shared/studio-resumes";
/** Duplicate-match cards: recent 3 companies, 2 education rows, 3 projects. */
const DEDUP_WORK_LIMIT = 3;
const DEDUP_EDUCATION_LIMIT = 2;
const DEDUP_PROJECT_LIMIT = 3;
const PROFILE_PLACEHOLDER = "未发现信息";

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

type SnapshotLine = ResumeLibraryProfileSnapshot["work"][number];
const workExperiencesSchema = z.array(resumeWorkExperienceSchema.partial());
const educationExperiencesSchema = z.array(resumeEducationExperienceSchema.partial());
const projectExperiencesSchema = z.array(resumeProjectExperienceSchema.partial());
type WorkExperienceInput = z.infer<typeof workExperiencesSchema>[number];
type EducationExperienceInput = z.infer<typeof educationExperiencesSchema>[number];
type ProjectExperienceInput = z.infer<typeof projectExperiencesSchema>[number];

function buildWorkLines(items: WorkExperienceInput[]): SnapshotLine[] {
  return items.flatMap((item) => {
    const company = cleanText(item.company);
    const role = cleanText(item.role);
    const primary = company ?? role;
    return primary
      ? [
          {
            period: formatPeriod(item.period),
            primary,
            secondary: company ? role : null,
          },
        ]
      : [];
  });
}

function buildEducationLines(items: EducationExperienceInput[]): SnapshotLine[] {
  return items.flatMap((item) => {
    const school = cleanText(item.school);
    if (!school) {
      return [];
    }
    const educationLevel = cleanText(item.educationLevel);
    return [
      {
        period: formatPeriod(item.period) ?? formatPeriod(item.graduationYear),
        primary: formatResumeEducationSchoolWithLevel({ educationLevel, school }) ?? school,
        secondary: cleanText(item.major),
      },
    ];
  });
}

function buildProjectLines(items: ProjectExperienceInput[]): SnapshotLine[] {
  return items.flatMap((item) => {
    const name = cleanText(item.name);
    if (!name) {
      return [];
    }
    return [
      {
        period: formatPeriod(item.period),
        primary: name,
        secondary: cleanText(item.role),
      },
    ];
  });
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

function takeSnapshotLines(lines: SnapshotLine[], limit: number): SnapshotLinesResult {
  return {
    hasMore: lines.length > limit,
    items: lines.slice(0, limit),
  };
}

interface SnapshotLinesResult {
  hasMore: boolean;
  items: SnapshotLine[];
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
