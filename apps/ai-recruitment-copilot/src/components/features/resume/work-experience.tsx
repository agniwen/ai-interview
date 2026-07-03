"use client";

import { IconBriefcase2, IconInfinity } from "@tabler/icons-react";
/* oxlint-disable no-use-before-define -- registry component keeps public component exports above local helpers. */

import dayjs from "dayjs";
import type { Dayjs } from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";

import type { ComponentProps } from "react";
import { useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import type { ChevronsUpDownIconHandle } from "@/components/icons/chevrons-up-down-icon";
import { ChevronsUpDownIcon } from "@/components/icons/chevrons-up-down-icon";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { cn } from "@arc/shared/utils";

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

export function WorkExperience({ className, experiences }: WorkExperienceProps) {
  return (
    <div
      className={cn(
        "relative bg-background px-4 text-foreground",
        experiences.length > 1 &&
          "before:absolute before:top-7 before:bottom-7 before:left-7 before:w-px before:bg-border",
        className,
      )}
    >
      {experiences.map((experience) => (
        <ExperienceItem experience={experience} key={experience.id} />
      ))}
    </div>
  );
}

export interface ExperienceItemProps {
  experience: ExperienceItemType;
}

export function ExperienceItem({ experience }: ExperienceItemProps) {
  return (
    <div className="relative flex flex-col gap-4 py-4">
      <div className="not-prose flex items-center gap-3">
        <div className="relative z-[1] flex size-6 shrink-0 items-center justify-center bg-background">
          {experience.companyLogo ? (
            // oxlint-disable-next-line next/no-img-element -- Company logos can be arbitrary external URLs; next/image would require tenant-specific allowlists.
            <img
              alt={experience.companyName}
              aria-hidden
              className="size-6 rounded-full"
              src={experience.companyLogo}
            />
          ) : (
            <span
              aria-hidden
              className="flex size-6 items-center justify-center rounded-full border border-border bg-muted/60 font-medium text-[10px] text-muted-foreground"
            >
              {experience.companyName.slice(0, 1).toUpperCase()}
            </span>
          )}
        </div>

        <h3 className="font-semibold text-lg leading-snug">
          {experience.companyWebsite ? (
            <a
              className="link"
              href={experience.companyWebsite}
              rel="noopener noreferrer"
              target="_blank"
            >
              {experience.companyName}
            </a>
          ) : (
            experience.companyName
          )}
        </h3>

        {experience.isCurrentEmployer && (
          <span aria-label="Current Employer" className="relative flex items-center justify-center">
            <span className="absolute inline-flex size-3 animate-ping rounded-full bg-sky-500 opacity-50" />
            <span className="relative inline-flex size-2 rounded-full bg-sky-500" />
          </span>
        )}
      </div>

      <div className="relative flex flex-col gap-4 before:absolute before:left-3 before:h-full before:w-px before:bg-border">
        {experience.positions.map((position) => (
          <ExperiencePositionItem key={position.id} position={position} />
        ))}
      </div>
    </div>
  );
}

export interface ExperiencePositionItemProps {
  position: ExperiencePositionItemType;
}

export function ExperiencePositionItem({ position }: ExperiencePositionItemProps) {
  const chevronsUpDownIconRef = useRef<ChevronsUpDownIconHandle>(null);

  const handleOpenChange = useCallback((open: boolean) => {
    const controls = chevronsUpDownIconRef.current;
    if (!controls) {
      return;
    }

    if (open) {
      controls.startAnimation();
    } else {
      controls.stopAnimation();
    }
  }, []);

  const { end, start } = position.employmentPeriod;
  const isOngoing = !end;
  const duration = formatWorkExperienceDuration(start, end);

  return (
    <Collapsible
      defaultOpen={position.isExpanded}
      disabled={!position.description}
      onOpenChange={handleOpenChange}
      render={<div className="relative" />}
    >
      <CollapsibleTrigger
        className={cn(
          "group/experience-position not-prose block w-full text-left select-none",
          "relative before:absolute before:-top-1 before:-right-1 before:-bottom-1.5 before:left-7 before:rounded-lg hover:before:bg-muted/30",
          "data-disabled:before:content-none",
        )}
      >
        <div className="relative z-[1] mb-1 flex items-start gap-3 text-base">
          <div
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-lg",
              "border border-muted-foreground/15 bg-muted text-muted-foreground ring-1 ring-border ring-offset-1 ring-offset-background",
              "[&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
            )}
          >
            {position.icon ?? <IconBriefcase2 />}
          </div>

          <h4 className="flex-1 text-balance font-medium text-foreground">{position.title}</h4>

          <div className="shrink-0 text-muted-foreground group-disabled/experience-position:hidden [&_svg]:h-lh [&_svg]:w-4">
            <ChevronsUpDownIcon ref={chevronsUpDownIconRef} duration={0.15} />
          </div>
        </div>

        <dl className="relative z-[1] flex items-center gap-2 pl-9 text-muted-foreground text-sm">
          {position.employmentType && (
            <>
              <div>
                <dt className="sr-only">Employment Type</dt>
                <dd>{position.employmentType}</dd>
              </div>

              <Separator
                className="data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
                orientation="vertical"
              />
            </>
          )}

          <div>
            <dt className="sr-only">Employment Period</dt>
            <dd className="flex items-center gap-0.5 tabular-nums">
              <span>{start}</span>
              <span className="font-mono">—</span>
              {isOngoing ? (
                <IconInfinity aria-label="Present" className="size-4.5 translate-y-[0.5px]" />
              ) : (
                <span>{end}</span>
              )}
            </dd>
          </div>

          {duration && (
            <>
              <Separator
                className="data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
                orientation="vertical"
              />
              <div>
                <dt className="sr-only">Duration</dt>
                <dd className="tabular-nums">{duration}</dd>
              </div>
            </>
          )}
        </dl>
      </CollapsibleTrigger>

      <CollapsibleContent className="overflow-hidden">
        {position.description && (
          <Prose className="pt-2 pl-9">
            <ReactMarkdown>{position.description}</ReactMarkdown>
          </Prose>
        )}
      </CollapsibleContent>

      {Array.isArray(position.skills) && position.skills.length > 0 && (
        <ul className="not-prose flex flex-wrap gap-1.5 pt-3 pl-9">
          {position.skills.map((skill, index) => (
            <li className="flex" key={`${position.id}-skill-${index}`}>
              <Skill>{skill}</Skill>
            </li>
          ))}
        </ul>
      )}
    </Collapsible>
  );
}

function Prose({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "max-w-none text-muted-foreground text-sm",
        "[&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        "[&_p]:my-2 [&_p]:leading-relaxed",
        "[&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_li]:my-1 [&_li]:pl-1",
        "[&_a]:break-words [&_a]:text-foreground [&_a]:underline [&_a]:decoration-current/30 [&_a]:underline-offset-3",
        "[&_code]:rounded-md [&_code]:border [&_code]:bg-muted/50 [&_code]:px-1 [&_code]:py-px [&_code]:font-normal [&_code]:text-sm",
        "[&_strong]:font-medium [&_strong]:text-foreground",
        "[&_blockquote]:my-2 [&_blockquote]:border-l [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function Skill({ className, ...props }: ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border bg-muted/50 px-1.5 py-0.5 font-mono text-muted-foreground text-xs",
        className,
      )}
      {...props}
    />
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
