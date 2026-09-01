import { resumeProfileSchema } from "@arc/db-schema/interview/types";
import { formatResumeEducationSchoolWithLevel } from "@arc/shared/resume-education";
import type { ResumeLibraryProfileSnapshot } from "@arc/shared/studio-resumes";
import { EMPTY_RESUME_PROFILE_SNAPSHOT } from "@arc/shared/studio-resumes";

function recentFirst<T extends { period?: string | null }>(rows: T[]) {
  return rows.toSorted((left, right) => (right.period ?? "").localeCompare(left.period ?? ""));
}

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Persisted legacy JSON is untrusted and is narrowed by resumeProfileSchema before projection.
export function compactResumeProfileSnapshot(value: unknown): ResumeLibraryProfileSnapshot {
  const parsed = resumeProfileSchema.safeParse(value);
  if (!parsed.success) {
    return EMPTY_RESUME_PROFILE_SNAPSHOT;
  }

  const work = recentFirst(parsed.data.workExperiences).flatMap((item) => {
    const company = item.company?.trim();
    const role = item.role?.trim();
    const primary = company || role;
    return primary
      ? [{ period: item.period?.trim() || null, primary, secondary: company ? role || null : null }]
      : [];
  });
  const education = recentFirst(parsed.data.educationExperiences ?? []).flatMap((item) => {
    const school = item.school?.trim();
    if (!school) {
      return [];
    }
    return [
      {
        period: item.period?.trim() || item.graduationYear?.trim() || null,
        primary:
          formatResumeEducationSchoolWithLevel({
            educationLevel: item.educationLevel?.trim() || null,
            school,
          }) ?? school,
        secondary: item.major?.trim() || null,
      },
    ];
  });
  const projects = recentFirst(parsed.data.projectExperiences).flatMap((item) => {
    const name = item.name?.trim();
    return name
      ? [
          {
            period: item.period?.trim() || null,
            primary: name,
            secondary: item.role?.trim() || null,
          },
        ]
      : [];
  });

  return {
    education: education.slice(0, 3),
    educationHasMore: education.length > 3,
    projects: projects.slice(0, 3),
    projectsHasMore: projects.length > 3,
    work: work.slice(0, 3),
    workHasMore: work.length > 3,
  };
}
