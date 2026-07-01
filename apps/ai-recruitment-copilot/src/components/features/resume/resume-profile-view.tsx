import type { ResumeProfile } from "@arc/db-schema/interview/types";
import {
  formatResumeEducationItem,
  sortResumeEducationExperiences,
} from "@arc/shared/resume-education";
import { ResumeEducationDisplayLine } from "@/components/features/resume/resume-education-line";
import type { ExperienceItemType } from "@/components/features/resume/work-experience";
import { WorkExperience } from "@/components/features/resume/work-experience";

interface ResumeProfileViewProps {
  profile: ResumeProfile | null;
}

const PLACEHOLDER = "未发现信息";
const CURRENT_PERIOD_PATTERN = /至今|现在|目前|当前|present|current|now/i;
const MARKDOWN_LIST_PATTERN = /^\s*(?:[-*+•·]|\d+[.)、])\s+/m;

function isPresent(value: string | null | undefined) {
  return Boolean(value && value.trim() && value.trim() !== PLACEHOLDER);
}

type ResumeWorkExperience = ResumeProfile["workExperiences"][number];
type ResumeEducationExperience = NonNullable<ResumeProfile["educationExperiences"]>[number];

function cleanText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed !== PLACEHOLDER ? trimmed : null;
}

function isCurrentEmploymentPeriod(period: string | null): boolean {
  if (!period) {
    return false;
  }
  return CURRENT_PERIOD_PATTERN.test(period);
}

function normalizePeriodDate(input: string): string | null {
  const value = input.trim().replaceAll(/\s+/g, "");
  const yearMonth = value.match(/^(\d{4})[./年-](\d{1,2})月?$/u);
  if (yearMonth) {
    return `${yearMonth[2].padStart(2, "0")}.${yearMonth[1]}`;
  }
  const monthYear = value.match(/^(\d{1,2})[./-](\d{4})$/u);
  if (monthYear) {
    return `${monthYear[1].padStart(2, "0")}.${monthYear[2]}`;
  }
  const yearOnly = value.match(/^(\d{4})$/u);
  return yearOnly ? yearOnly[1] : null;
}

function extractNormalizedPeriodDates(period: string): string[] {
  return Array.from(
    period.matchAll(/(\d{4}[./年-]\s*\d{1,2}月?|\d{1,2}[./-]\d{4}|\d{4})/gu),
    ([match]) => normalizePeriodDate(match),
  ).filter((date): date is string => date !== null);
}

export function parseResumeEmploymentPeriod(
  period: string | null | undefined,
): ExperienceItemType["positions"][number]["employmentPeriod"] {
  const text = cleanText(period);
  if (!text) {
    return { end: "未注明", start: "未注明" };
  }

  const dates = extractNormalizedPeriodDates(text);
  const start = dates[0] ?? text;
  if (isCurrentEmploymentPeriod(text)) {
    return { start };
  }

  return {
    end: dates[1] ?? dates[0] ?? "未注明",
    start,
  };
}

export function formatResumeExperienceDescription(
  summary: string | null | undefined,
): string | undefined {
  const text = cleanText(summary);
  if (!text) {
    return undefined;
  }
  if (MARKDOWN_LIST_PATTERN.test(text)) {
    return text;
  }

  const items = text
    .split(/\r?\n/u)
    .flatMap((line) => line.split(/[。；]/u))
    .map((item) => item.trim())
    .filter(Boolean);

  if (items.length === 0) {
    return undefined;
  }
  return items.map((item) => `- ${item}`).join("\n");
}

export function toWorkExperienceItems(experiences: ResumeWorkExperience[]): ExperienceItemType[] {
  const groups: ExperienceItemType[] = [];
  const groupIndexByCompany = new Map<string, ExperienceItemType>();

  for (const experience of experiences) {
    const companyName = cleanText(experience.company) ?? "未发现公司";
    let group = groupIndexByCompany.get(companyName);
    if (!group) {
      group = {
        companyName,
        id: `company-${groups.length}`,
        isCurrentEmployer: false,
        positions: [],
      };
      groupIndexByCompany.set(companyName, group);
      groups.push(group);
    }

    const period = cleanText(experience.period);
    group.isCurrentEmployer ||= isCurrentEmploymentPeriod(period);
    const description = formatResumeExperienceDescription(experience.summary);
    group.positions.push({
      description,
      employmentPeriod: parseResumeEmploymentPeriod(period),
      id: `${group.id}-position-${group.positions.length}`,
      isExpanded: Boolean(description) && group.positions.length === 0,
      title: cleanText(experience.role) ?? "未发现岗位",
    });
  }

  return groups;
}

function FactRow({ label, value }: { label: string; value: string | number | null }) {
  return (
    <div className="min-w-0">
      <span className="text-muted-foreground text-xs">{label}</span>
      <div className="mt-1 min-w-0 break-words text-sm leading-6">
        {value === null || value === "" ? "—" : value}
      </div>
    </div>
  );
}

function ChipList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">—</p>;
  }
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((item) => (
        <li key={item} className="rounded-full bg-muted px-2.5 py-1 text-xs">
          {item}
        </li>
      ))}
    </ul>
  );
}

function ResumeProfileSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="border-t border-border/50 pt-6">
      <h4 className="mb-3 font-medium text-sm">{title}</h4>
      {children}
    </section>
  );
}

function EducationExperienceList({
  educationExperiences,
}: {
  educationExperiences: ResumeEducationExperience[];
}) {
  if (educationExperiences.length === 0) {
    return <p className="text-muted-foreground text-sm">—</p>;
  }

  return (
    <ul className="flex flex-col gap-3">
      {educationExperiences.map((education, index) => {
        const educationItem = formatResumeEducationItem(education) ?? {
          level: null,
          major: null,
          school: "未发现学校",
        };
        const period = cleanText(education.period) ?? cleanText(education.graduationYear);
        return (
          <li
            className="rounded-xl bg-muted/30 px-4 py-3 border-muted/60 border"
            key={`${education.school ?? "education"}-${index}`}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <ResumeEducationDisplayLine className="text-sm" item={educationItem} />
              {period ? <span className="text-muted-foreground text-xs">{period}</span> : null}
            </div>
            {isPresent(education.summary) ? (
              <p className="mt-1 whitespace-pre-line text-muted-foreground text-sm">
                {education.summary}
              </p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function WorkExperienceTimeline({ experiences }: { experiences: ResumeWorkExperience[] }) {
  const items = toWorkExperienceItems(experiences);

  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">—</p>;
  }

  return <WorkExperience className="w-full" experiences={items} />;
}

export function ResumeProfileView({ profile }: ResumeProfileViewProps) {
  if (!profile) {
    return <p className="text-muted-foreground text-sm">暂无结构化简历，仅有候选人基础信息。</p>;
  }

  const educationExperiences = sortResumeEducationExperiences(profile.educationExperiences);

  return (
    <div className="space-y-8">
      <section className="grid gap-x-8 gap-y-4 md:grid-cols-2">
        <FactRow label="姓名" value={isPresent(profile.name) ? profile.name : null} />
        <FactRow label="性别" value={isPresent(profile.gender) ? profile.gender : null} />
        <FactRow label="年龄" value={profile.age} />
        <FactRow label="工作年限" value={profile.workYears} />
        <FactRow label="邮箱" value={profile.email} />
        <FactRow label="电话" value={profile.phone} />
      </section>

      <ResumeProfileSection title="求职意向">
        <ChipList items={profile.targetRoles} />
      </ResumeProfileSection>

      <ResumeProfileSection title="教育经历">
        {educationExperiences.length > 0 ? (
          <EducationExperienceList educationExperiences={educationExperiences} />
        ) : (
          <ChipList items={profile.schools} />
        )}
      </ResumeProfileSection>

      <ResumeProfileSection title="工作经历">
        <WorkExperienceTimeline experiences={profile.workExperiences} />
      </ResumeProfileSection>

      <ResumeProfileSection title="项目经历">
        {profile.projectExperiences.length === 0 ? (
          <p className="text-muted-foreground text-sm">—</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {profile.projectExperiences.map((proj, index) => (
              <li
                className="rounded-xl bg-muted/30 px-4 py-3 border-muted/60 border"
                key={`${proj.name ?? "project"}-${index}`}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium text-sm">
                    {isPresent(proj.name) ? proj.name : "未命名项目"}
                    {isPresent(proj.role) ? ` · ${proj.role}` : ""}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {isPresent(proj.period) ? proj.period : ""}
                  </span>
                </div>
                {isPresent(proj.summary) ? (
                  <p className="mt-1 whitespace-pre-line text-muted-foreground text-sm">
                    {proj.summary}
                  </p>
                ) : null}
                {proj.techStack.length > 0 ? (
                  <div className="mt-2">
                    <ChipList items={proj.techStack} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </ResumeProfileSection>

      <ResumeProfileSection title="掌握技能">
        <ChipList items={profile.skills} />
      </ResumeProfileSection>

      <ResumeProfileSection title="个人优势">
        {profile.personalStrengths.length === 0 ? (
          <p className="text-muted-foreground text-sm">—</p>
        ) : (
          <ul className="space-y-2 text-sm leading-6">
            {profile.personalStrengths.map((item) => (
              <li className="flex gap-2" key={item}>
                <span className="mt-2 size-1.5 shrink-0 rounded-full bg-muted-foreground/40" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        )}
      </ResumeProfileSection>
    </div>
  );
}
