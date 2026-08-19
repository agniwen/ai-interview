import type { ResumeProfile } from "@arc/db-schema/interview/types";
import {
  formatResumeEducationSchoolWithLevel,
  sortResumeEducationExperiences,
} from "@arc/shared/resume-education";
import { IconBriefcase2, IconSchool } from "@tabler/icons-react";
import { EmptyValue } from "@/components/features/display/empty-value";

const PLACEHOLDER = "未发现信息";
const CURRENT_PERIOD_PATTERN = /至今|现在|目前|当前|present|current|now/i;

type WorkExperience = ResumeProfile["workExperiences"][number];
type EducationExperience = NonNullable<ResumeProfile["educationExperiences"]>[number];

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed !== PLACEHOLDER ? trimmed : null;
}

function getPeriodSortKey(period: string | null | undefined): number {
  const value = cleanText(period);
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  if (CURRENT_PERIOD_PATTERN.test(value)) {
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

export function sortCareerWorkExperiences(
  experiences: readonly WorkExperience[],
): WorkExperience[] {
  return experiences
    .map((experience, index) => ({ experience, index }))
    .toSorted((left, right) => {
      const leftPeriod = getPeriodSortKey(left.experience.period);
      const rightPeriod = getPeriodSortKey(right.experience.period);
      return leftPeriod === rightPeriod ? left.index - right.index : rightPeriod - leftPeriod;
    })
    .map(({ experience }) => experience);
}

function CareerSection({
  children,
  icon: Icon,
  title,
}: {
  children: React.ReactNode;
  icon: typeof IconBriefcase2;
  title: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 font-medium text-sm">
        <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        {title}
      </h3>
      {children}
    </section>
  );
}

function WorkHistory({
  experiences,
  onWorkExperienceSelect,
}: {
  experiences: readonly WorkExperience[];
  onWorkExperienceSelect: (companyName: string) => void;
}) {
  const sortedExperiences = sortCareerWorkExperiences(experiences);
  if (sortedExperiences.length === 0) {
    return <EmptyValue className="text-sm" />;
  }

  return (
    <ol className="flex flex-col gap-4">
      {sortedExperiences.map((experience, index) => {
        const role = cleanText(experience.role);
        const period = cleanText(experience.period);
        const company = cleanText(experience.company);
        const companyName = company ?? "未发现公司";
        return (
          <li
            className="min-w-0"
            key={[experience.company, experience.role, experience.period, index].join("\u001F")}
          >
            <button
              className="group/work-entry w-full min-w-0 cursor-pointer rounded-md py-1.5 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onWorkExperienceSelect(companyName)}
              type="button"
            >
              <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3">
                <div
                  className="min-w-0 transition-transform duration-150 ease-out group-hover/work-entry:translate-x-1.5 group-focus-visible/work-entry:translate-x-1.5 motion-reduce:transform-none motion-reduce:transition-none"
                  data-slot="work-entry-copy"
                >
                  <p className="min-w-0 wrap-break-word font-medium text-sm">
                    {company ?? <EmptyValue />}
                  </p>
                  <p className="mt-1 min-w-0 wrap-break-word text-muted-foreground text-xs">
                    {role ?? <EmptyValue />}
                  </p>
                </div>
                <span className="col-start-2 row-start-1 shrink-0 text-muted-foreground text-xs tabular-nums transition-transform duration-150 ease-out group-hover/work-entry:-translate-x-1.5 group-focus-visible/work-entry:-translate-x-1.5 motion-reduce:transform-none motion-reduce:transition-none">
                  {period ?? <EmptyValue />}
                </span>
              </div>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function EducationHistory({
  educationExperiences,
  schools,
}: {
  educationExperiences: readonly EducationExperience[] | null | undefined;
  schools: readonly string[];
}) {
  const sortedEducation = sortResumeEducationExperiences(educationExperiences);
  const entries =
    sortedEducation.length > 0
      ? sortedEducation
      : schools.map((school) => ({
          degree: null,
          educationLevel: null,
          graduationYear: null,
          major: null,
          period: null,
          school,
          summary: null,
        }));

  if (entries.length === 0) {
    return <EmptyValue className="text-sm" />;
  }

  return (
    <ol className="flex flex-col gap-4">
      {entries.map((education, index) => {
        const period = cleanText(education.period) ?? cleanText(education.graduationYear);
        const schoolWithLevel = formatResumeEducationSchoolWithLevel(education);
        const major = cleanText(education.major);
        return (
          <li
            className="min-w-0"
            key={[
              education.school,
              education.educationLevel,
              education.degree,
              education.period,
              index,
            ].join("\u001F")}
          >
            <div className="flex min-w-0 items-baseline justify-between gap-3">
              <p className="min-w-0 wrap-break-word font-medium text-sm">
                {schoolWithLevel ?? <EmptyValue />}
              </p>
              <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                {period ?? <EmptyValue />}
              </span>
            </div>
            <p className="mt-1 min-w-0 wrap-break-word text-muted-foreground text-xs">
              {major ?? <EmptyValue />}
            </p>
          </li>
        );
      })}
    </ol>
  );
}

export function CandidateCareerSummary({
  onWorkExperienceSelect,
  profile,
}: {
  onWorkExperienceSelect: (companyName: string) => void;
  profile: ResumeProfile | null;
}) {
  if (!profile) {
    return <p className="text-muted-foreground text-sm">暂无结构化履历信息。</p>;
  }

  return (
    <div className="flex min-w-0 flex-col gap-7" data-slot="candidate-career-summary">
      <CareerSection icon={IconBriefcase2} title="工作经历">
        <WorkHistory
          experiences={profile.workExperiences}
          onWorkExperienceSelect={onWorkExperienceSelect}
        />
      </CareerSection>
      <CareerSection icon={IconSchool} title="教育经历">
        <EducationHistory
          educationExperiences={profile.educationExperiences}
          schools={profile.schools}
        />
      </CareerSection>
    </div>
  );
}
