"use client";

import type {
  CandidateTimelineEvent,
  CandidateTimelineEventKind,
  CandidateTimelineEventTone,
  CandidateTimelineResponse,
} from "@arc/shared/studio-resumes";
import {
  BellIcon,
  BotIcon,
  BriefcaseBusinessIcon,
  CalendarClockIcon,
  ClipboardListIcon,
  FileTextIcon,
  HistoryIcon,
  MailIcon,
  UserRoundIcon,
} from "@/components/icons/hugeicons";
import type { ComponentProps, ComponentType, SVGProps } from "react";
import { MarkdownView } from "@/components/features/display/markdown-view";
import { DATE_TIME_DISPLAY_OPTIONS, TimeDisplay } from "@/components/features/display/time-display";
import { Badge } from "@/components/ui/badge";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@arc/shared/utils";

type TimelineIcon = ComponentType<SVGProps<SVGSVGElement>>;
type BadgeVariant = ComponentProps<typeof Badge>["variant"];

const AI_REPORT_DESCRIPTION_MAX_LENGTH = 220;

const KIND_META: Record<CandidateTimelineEventKind, { icon: TimelineIcon; label: string }> = {
  ai_interview: { icon: BotIcon, label: "AI 面试" },
  audit: { icon: HistoryIcon, label: "审计" },
  candidate: { icon: UserRoundIcon, label: "档案" },
  email: { icon: MailIcon, label: "邮件" },
  form: { icon: ClipboardListIcon, label: "表单" },
  human_interview: { icon: CalendarClockIcon, label: "真人复面" },
  notification: { icon: BellIcon, label: "通知" },
  offer: { icon: BriefcaseBusinessIcon, label: "Offer" },
  stage: { icon: FileTextIcon, label: "阶段" },
};

function badgeVariantForTone(tone: CandidateTimelineEventTone): BadgeVariant {
  switch (tone) {
    case "success": {
      return "success";
    }
    case "warning": {
      return "warning";
    }
    case "danger": {
      return "destructive";
    }
    case "info": {
      return "info";
    }
    default: {
      return "outline";
    }
  }
}

function TimelineSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "max-w-full overflow-hidden",
        "xl:border-border/50 xl:border-l xl:pl-6",
        className,
      )}
    >
      <Skeleton className="h-5 w-24" />
      <div className="mt-5 flex flex-col gap-3">
        {Array.from({ length: 5 }).map((_, index) => (
          <Skeleton className="h-24 rounded-xl" key={index} />
        ))}
      </div>
    </div>
  );
}

type CandidateTimelineDensity = "default" | "rail";
type CandidateTimelineScrollMode = "internal" | "page";

function truncateMarkdown(value: string, maxLength: number) {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength).trimEnd()}...`;
}

function shouldRenderDescriptionAsMarkdown(event: CandidateTimelineEvent) {
  return event.title === "AI 报告同步";
}

function TimelineDescription({
  density,
  event,
}: {
  density: CandidateTimelineDensity;
  event: CandidateTimelineEvent;
}) {
  if (!event.description) {
    return null;
  }

  if (shouldRenderDescriptionAsMarkdown(event)) {
    return (
      <MarkdownView
        className={cn(
          "mt-3 min-w-0 max-w-full overflow-hidden break-words text-muted-foreground text-sm",
          "[&_*]:max-w-full [&_a]:break-all [&_code]:break-all",
          "[&_p]:my-1 [&_p]:leading-normal [&_pre]:whitespace-pre-wrap",
        )}
        content={truncateMarkdown(event.description, AI_REPORT_DESCRIPTION_MAX_LENGTH)}
      />
    );
  }

  return (
    <p
      className={cn(
        "mt-3 min-w-0 break-words text-muted-foreground text-sm leading-normal",
        density === "rail" && "line-clamp-2",
      )}
    >
      {event.description}
    </p>
  );
}

function TimelineMetaChip({
  density,
  item,
}: {
  density: CandidateTimelineDensity;
  item: CandidateTimelineEvent["metadata"][number];
}) {
  return (
    <div
      className={cn(
        "inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden rounded-md bg-muted/40 px-2 py-1 text-xs",
        density === "rail" ? "xl:max-w-[15rem]" : "sm:max-w-[18rem]",
      )}
      title={`${item.label}：${item.value}`}
    >
      <dt className="max-w-16 shrink-0 truncate text-muted-foreground">{item.label}</dt>
      <dd className="min-w-0 flex-1 truncate font-medium">{item.value}</dd>
    </div>
  );
}

function TimelineEventItem({
  density = "default",
  event,
  isLast,
}: {
  density?: CandidateTimelineDensity;
  event: CandidateTimelineEvent;
  isLast: boolean;
}) {
  const meta = KIND_META[event.kind];
  const Icon = meta.icon;
  const isRail = density === "rail";
  const metadata = isRail ? event.metadata.slice(0, 2) : event.metadata;

  return (
    <li className={cn("relative grid min-w-0 max-w-full gap-3", isRail ? "pl-8" : "pl-10")}>
      {isLast ? null : (
        <span
          aria-hidden="true"
          className={cn(
            "-translate-x-1/2 absolute w-px bg-border",
            isRail ? "left-3.5 top-3.5 h-[calc(100%+1rem)]" : "left-4 top-4 h-[calc(100%+1rem)]",
          )}
        />
      )}
      <div
        className={cn(
          "-translate-x-1/2 absolute top-0 z-10 flex items-center justify-center rounded-full bg-muted",
          isRail ? "left-3.5 size-7" : "left-4 size-8",
        )}
      >
        <Icon className={cn("text-muted-foreground", isRail ? "size-3.5" : "size-4")} />
      </div>
      <div
        className={cn(
          "min-w-0 max-w-full overflow-hidden rounded-xl border border-muted/60 bg-muted/30",
          isRail ? "p-3" : "p-4",
        )}
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 max-w-full">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h4 className="min-w-0 max-w-full break-words font-medium text-sm">{event.title}</h4>
              <Badge
                className="max-w-24 justify-start truncate"
                title={meta.label}
                variant={badgeVariantForTone(event.tone)}
              >
                <span className="min-w-0 truncate">{meta.label}</span>
              </Badge>
            </div>
            <TimeDisplay
              className="mt-1 block text-muted-foreground text-xs"
              options={DATE_TIME_DISPLAY_OPTIONS}
              value={event.occurredAt}
            />
          </div>
          {event.actorName ? (
            <span className="shrink-0 text-muted-foreground text-xs">
              操作人：{event.actorName}
            </span>
          ) : null}
        </div>
        <TimelineDescription density={density} event={event} />
        {metadata.length > 0 ? (
          <dl className="mt-3 flex min-w-0 max-w-full flex-wrap gap-2 overflow-hidden">
            {metadata.map((item) => (
              <TimelineMetaChip density={density} item={item} key={`${event.id}:${item.label}`} />
            ))}
          </dl>
        ) : null}
      </div>
    </li>
  );
}

export function CandidateTimeline({
  className,
  data,
  density = "default",
  isLoading,
  scrollMode = "internal",
}: {
  className?: string;
  data: CandidateTimelineResponse | null | undefined;
  density?: CandidateTimelineDensity;
  isLoading: boolean;
  scrollMode?: CandidateTimelineScrollMode;
}) {
  const isRail = density === "rail";
  const canUseInternalScroll = isRail && scrollMode === "internal";

  if (isLoading) {
    return <TimelineSkeleton className={className} />;
  }

  const events = data?.events ?? [];

  return (
    <div
      className={cn(
        "max-w-full overflow-hidden",
        isRail && "xl:border-border/50 xl:border-l xl:pl-6",
        canUseInternalScroll && "xl:flex xl:h-full xl:min-h-0 xl:flex-col xl:overflow-hidden",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="font-medium text-sm">候选人时间线</h3>
        </div>
      </div>

      {events.length === 0 ? (
        <Empty className="mt-5 min-h-48">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HistoryIcon />
            </EmptyMedia>
            <EmptyTitle>暂无时间线事件</EmptyTitle>
            <EmptyDescription>候选人产生面试、表单或阶段流转后会显示在这里。</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ol
          className={cn(
            "relative mt-5 flex min-w-0 max-w-full flex-col gap-4",
            canUseInternalScroll && "xl:min-h-0 xl:flex-1 xl:overflow-y-auto xl:pr-1",
          )}
        >
          {events.map((event, index) => (
            <TimelineEventItem
              density={density}
              event={event}
              isLast={index === events.length - 1}
              key={event.id}
            />
          ))}
        </ol>
      )}
    </div>
  );
}
