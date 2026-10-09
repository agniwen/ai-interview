"use client";
/* oxlint-disable no-use-before-define -- registry component keeps public component exports above local helpers. */

import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

import { MarkdownView } from "@/components/features/display/markdown-view";
import { Badge } from "@/components/ui/badge";
import { cn } from "@app/shared/utils";

dayjs.extend(customParseFormat);

export interface ExperiencePositionItemType {
  /** Unique identifier for the position. */
  id: string;
  /** The job title or position name. */
  title: string;
  /**
   * Employment period of the position.
   * Use "MM.YYYY" or "YYYY" format. Omit `end` for current roles.
   */
  employmentPeriod: {
    /** Start date, for example "10.2022" or "2020". */
    start: string;
    /** End date; leave undefined for "Present". */
    end?: string;
  };
  /** The type of employment, for example "Full-time", "Part-time", "Contract". */
  employmentType?: string;
  /** A brief markdown description of the position or responsibilities. */
  description?: string;
  /** An icon representing the position. */
  icon?: React.ReactElement;
  /** A list of skills associated with the position. */
  skills?: string[];
  /** Indicates if the position details are expanded in the UI. */
  isExpanded?: boolean;
}

export interface ExperienceItemType {
  /** Unique identifier for the experience item. */
  id: string;
  /** Name of the company where the experience was gained. */
  companyName: string;
  /** URL or path to the company's logo image. */
  companyLogo?: string;
  /** URL to the company's website. */
  companyWebsite?: string;
  /** List of positions held at the company. */
  positions: ExperiencePositionItemType[];
  /** Indicates if this is the user's current employer. */
  isCurrentEmployer?: boolean;
}

export interface WorkExperienceProps {
  className?: string;
  experiences: ExperienceItemType[];
}

export function scrollToWorkExperienceCompany(root: ParentNode | null, companyName: string): void {
  const companySections =
    root?.querySelectorAll<HTMLElement>('[data-slot="work-experience-company"]') ?? [];
  const target = [...companySections].find(
    (section) => section.dataset.companyName === companyName,
  );
  if (!target) {
    return;
  }

  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function WorkExperience({ className, experiences }: WorkExperienceProps) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-8", className)}>
      {experiences.map((experience) => (
        <section
          className="flex scroll-mt-20 flex-col gap-8 pb-8 last:pb-0"
          data-company-name={experience.companyName}
          data-slot="work-experience-company"
          key={experience.id}
        >
          {experience.positions.map((position) => (
            <ExperiencePositionItem experience={experience} key={position.id} position={position} />
          ))}
        </section>
      ))}
    </div>
  );
}

export interface ExperienceItemProps {
  experience: ExperienceItemType;
}

export interface ExperiencePositionItemProps {
  position: ExperiencePositionItemType;
}

function ExperiencePositionItem({
  experience,
  position,
}: ExperienceItemProps & ExperiencePositionItemProps) {
  const { end, start } = position.employmentPeriod;
  const duration = formatWorkExperienceDuration(start, end);

  return (
    <article className="grid min-w-0 grid-cols-[2.5rem_minmax(0,1fr)] gap-x-4 sm:grid-cols-[3rem_minmax(0,1fr)] sm:gap-x-5">
      <div
        aria-hidden="true"
        className="flex size-10 items-center justify-center overflow-hidden rounded-xl border border-border/60 bg-muted/40 text-base font-medium text-muted-foreground sm:size-12"
      >
        {experience.companyLogo ? (
          // oxlint-disable-next-line next/no-img-element -- Company logos are tenant-provided URLs.
          <img alt="" className="size-full object-contain" src={experience.companyLogo} />
        ) : (
          experience.companyName.slice(0, 1).toUpperCase()
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <header className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
          <div className="flex min-w-0 flex-col gap-1.5">
            <h3 className="wrap-break-word text-base font-semibold leading-6">{position.title}</h3>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm leading-6">
              {experience.companyWebsite ? (
                <a
                  className="underline-offset-4 hover:underline"
                  href={experience.companyWebsite}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  {experience.companyName}
                </a>
              ) : (
                <span>{experience.companyName}</span>
              )}
              {position.employmentType ? (
                <span className="text-muted-foreground">{position.employmentType}</span>
              ) : null}
              {!end && experience.isCurrentEmployer ? (
                <Badge variant="secondary">在职</Badge>
              ) : null}
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-x-3 gap-y-1 text-sm leading-6 text-muted-foreground tabular-nums sm:flex-col sm:items-end">
            <span>
              {start} — {end ?? "至今"}
            </span>
            {duration ? <span>{duration}</span> : null}
          </div>
        </header>
        {position.description ? (
          <MarkdownView
            className="text-foreground [&_li]:leading-7 [&_li+li]:mt-2 [&_a]:text-foreground [&_strong]:text-foreground"
            content={position.description}
          />
        ) : null}
        {position.skills && position.skills.length > 0 ? (
          <ul className="flex flex-wrap gap-2">
            {position.skills.map((skill, index) => (
              <li key={`${position.id}-skill-${index}`}>
                <Badge variant="outline">{skill}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}

export function formatWorkExperienceDuration(start: string, end?: string): string {
  const startHasMonth = start.includes(".");
  const endHasMonth = end ? end.includes(".") : true;

  if (!startHasMonth && end && !endHasMonth) {
    const years = Number.parseInt(end, 10) - Number.parseInt(start, 10);
    if (!Number.isFinite(years) || years <= 0) {
      return "";
    }
    return `${years}年`;
  }

  const startDate = parsePeriodDate(start, "first");
  const endDate = end ? parsePeriodDate(end, "last") : dayjs();
  if (!(startDate.isValid() && endDate.isValid())) {
    return "";
  }

  const totalMonths = endDate.diff(startDate, "month") + 1;
  if (!Number.isFinite(totalMonths) || totalMonths <= 0) {
    return "";
  }

  if (totalMonths < 12) {
    return `${totalMonths}个月`;
  }

  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  if (months === 0) {
    return `${years}年`;
  }
  return `${years}年${months}个月`;
}

function parsePeriodDate(str: string, fallbackMonth: "first" | "last"): Dayjs {
  const source = str.includes(".") ? str : `${fallbackMonth === "last" ? "12" : "01"}.${str}`;
  return dayjs(source, "MM.YYYY", true);
}
