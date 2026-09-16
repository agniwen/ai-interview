"use client";

import { IconChevronRight, IconSparkles, IconUser } from "@tabler/icons-react";
import {
  addDays,
  format,
  isFirstDayOfMonth,
  isLastDayOfMonth,
  isSameDay,
  startOfDay,
} from "date-fns";
import { zhCN } from "date-fns/locale";
import { useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { humanInterviewFormatMeta } from "@app/db-schema/studio-interviews";
import type {
  StudioCalendarCandidate,
  StudioCalendarEvent,
  StudioCalendarEventStatus,
} from "@app/shared/studio-calendar";
import { interviewCalendarJobNames } from "@app/shared/interview-calendar";
import { PageHeader } from "@/components/features/studio/page-header";
import {
  EventCalendar,
  useEventCalendarNavigation,
  useEventCalendarView,
} from "@/components/reui/event-calendar/event-calendar";
import type { EventCalendarRenderEventProps } from "@/components/reui/event-calendar/event-calendar";
import { EventCalendarContent } from "@/components/reui/event-calendar/event-calendar-content";
import { DEFAULT_EVENT_CALENDAR_I18N } from "@/components/reui/event-calendar/event-calendar-i18n";
import type { EventCalendarI18nConfig } from "@/components/reui/event-calendar/event-calendar-i18n";
import {
  EventCalendarNav,
  EventCalendarNavNext,
  EventCalendarNavPrev,
  EventCalendarNavToday,
  EventCalendarTitle,
} from "@/components/reui/event-calendar/event-calendar-nav";
import type {
  CalendarView,
  CalendarEvent,
  EventCalendarDateRange,
  EventCalendarRangeInfo,
} from "@/components/reui/event-calendar/event-calendar-types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Frame, FramePanel } from "@/components/ui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { fetchStudioCalendar } from "@/lib/client/api";
import { studioCalendarKeys } from "@/lib/client/api/query-keys";
import { AiInterviewEventHoverCard } from "./ai-interview-event-hover-card";

const CALENDAR_I18N = {
  labels: {
    ...DEFAULT_EVENT_CALENDAR_I18N.labels,
    allDay: "全天",
    event: "个日程",
    events: (count) => `${count} 个日程`,
    goToDate: "跳转到日期",
    loading: "正在加载日程",
    more: (count) => `还有 ${count} 项`,
    next: "下一页",
    noEvents: "当前时间范围内没有面试日程",
    previous: "上一页",
    selectView: "选择视图",
    today: "今天",
  },
  viewNames: {
    ...DEFAULT_EVENT_CALENDAR_I18N.viewNames,
    agenda: "列表",
    day: "日",
    days: (count) => `${count} 日`,
    month: "月",
    week: "周",
  },
} satisfies Partial<EventCalendarI18nConfig>;

function initialRange(): EventCalendarDateRange {
  const start = startOfDay(new Date());
  return {
    end: addDays(start, 30),
    start,
  };
}

const EVENT_STATUS_META = {
  ended: { label: "已结束", variant: "success" },
  in_progress: { label: "进行中", variant: "warning" },
  not_held: { label: "未进行", variant: "outline" },
  scheduled: { label: "待开始", variant: "info" },
} as const satisfies Record<
  StudioCalendarEventStatus,
  { label: string; variant: "success" | "warning" | "outline" | "info" }
>;

function uniqueText(values: (string | null | undefined)[]): string {
  return [...new Set(values.filter((value): value is string => Boolean(value?.trim())))].join("、");
}

function agendaEventTypeText(event: StudioCalendarEvent): string {
  if (event.kind === "ai") {
    return event.source === "result" ? "AI 面试记录" : "AI 面试计划";
  }
  const formatLabel = humanInterviewFormatMeta[event.format].label;
  if (event.format === "onsite" && event.location) {
    return `真人面试 · ${formatLabel} · ${event.location}`;
  }
  return `真人面试 · ${formatLabel}`;
}

function CalendarAgendaEvent({ occurrence }: EventCalendarRenderEventProps<StudioCalendarEvent>) {
  const event = occurrence.event.data;
  if (!event) {
    return null;
  }
  const candidateNames = uniqueText(event.candidates.map((candidate) => candidate.candidateName));
  const roundLabels = uniqueText(event.candidates.map((candidate) => candidate.roundLabel));
  const jobNames = interviewCalendarJobNames(event.candidates) || "未关联岗位";
  const interviewerNames =
    event.kind === "human"
      ? uniqueText(event.interviewers.map((interviewer) => interviewer.name)) || "面试官待确认"
      : "AI 面试官";
  const durationMinutes = Math.max(
    1,
    Math.round((occurrence.end.getTime() - occurrence.start.getTime()) / 60_000),
  );
  const status = EVENT_STATUS_META[event.status];
  const typeText = agendaEventTypeText(event);

  return (
    <div className="grid w-full min-w-0 grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-1 lg:grid-cols-[5rem_minmax(12rem,1.4fr)_minmax(10rem,1fr)_minmax(8rem,0.9fr)_minmax(7rem,0.7fr)_auto]">
      <div className="self-start tabular-nums">
        <div className="font-semibold text-base leading-5">{format(occurrence.start, "HH:mm")}</div>
        <div className="text-muted-foreground text-xs">{durationMinutes} 分钟</div>
      </div>
      <div className="min-w-0">
        <div className="truncate font-medium" title={candidateNames || event.title}>
          {candidateNames || event.title}
          {roundLabels ? <span className="ms-2 text-primary text-xs">{roundLabels}</span> : null}
        </div>
        <div className="truncate text-muted-foreground text-xs lg:hidden">
          {jobNames} · {interviewerNames} · {typeText}
        </div>
      </div>
      <div className="hidden min-w-0 truncate text-muted-foreground lg:block" title={jobNames}>
        {jobNames}
      </div>
      <div
        className="hidden min-w-0 truncate text-muted-foreground lg:block"
        title={interviewerNames}
      >
        {interviewerNames}
      </div>
      <div className="hidden min-w-0 truncate text-muted-foreground lg:block" title={typeText}>
        {typeText}
      </div>
      <div className="col-start-2 flex w-fit items-center gap-1.5 lg:col-start-auto">
        <Badge variant={status.variant}>{status.label}</Badge>
        <IconChevronRight
          aria-hidden="true"
          className="size-4 text-muted-foreground transition-colors group-hover/ec-event:text-foreground"
        />
      </div>
    </div>
  );
}

function CalendarAgendaDayHeader({ count, day }: { count: number; day: Date }) {
  const now = new Date();
  let relativeLabel: "今天" | "明天" | null = null;
  if (isSameDay(day, now)) {
    relativeLabel = "今天";
  } else if (isSameDay(day, addDays(now, 1))) {
    relativeLabel = "明天";
  }
  const dateLabel = format(day, "M月d日（EEE）", { locale: zhCN });

  return (
    <div className="flex w-full items-baseline justify-between gap-3">
      <span className="font-semibold">
        {relativeLabel ? `${relativeLabel} · ` : ""}
        {dateLabel}
      </span>
      <span className="text-muted-foreground font-normal text-xs">{count} 场</span>
    </div>
  );
}

function calendarEventColor(event: StudioCalendarEvent): string {
  return event.kind === "human"
    ? "var(--calendar-human-interview)"
    : "var(--calendar-ai-interview)";
}

function calendarEventForeground(event: StudioCalendarEvent): string {
  return event.kind === "human"
    ? "var(--calendar-human-interview-foreground)"
    : "var(--calendar-ai-interview-foreground)";
}

function calendarEventSurfaceClassName(event: StudioCalendarEvent): string {
  if (event.status === "ended" || event.status === "not_held") {
    return "bg-(--ec-event-color)/10 text-(--ec-event-foreground) inset-ring-(--ec-event-color)/30 hover:bg-(--ec-event-color)/15 data-selected:bg-(--ec-event-color)/15 dark:bg-(--ec-event-color)/15 dark:inset-ring-(--ec-event-color)/40 dark:hover:bg-(--ec-event-color)/20 dark:data-selected:bg-(--ec-event-color)/20 [&_.text-muted-foreground]:text-(--ec-event-foreground)/75";
  }
  return "bg-(--ec-event-color)/5 text-(--ec-event-foreground) inset-ring-(--ec-event-color)/15 hover:bg-(--ec-event-color)/10 data-selected:bg-(--ec-event-color)/10 dark:bg-(--ec-event-color)/10 dark:inset-ring-(--ec-event-color)/20 dark:hover:bg-(--ec-event-color)/15 dark:data-selected:bg-(--ec-event-color)/15 [&_.text-muted-foreground]:text-(--ec-event-foreground)/65";
}

function calendarEventTypeLabel(event: StudioCalendarEvent): string {
  if (event.kind === "human") {
    return "真人面试";
  }
  return event.source === "result" ? "AI 面试记录" : "AI 面试计划";
}

function toCalendarEvent(event: StudioCalendarEvent): CalendarEvent<StudioCalendarEvent> {
  const { title } = event;
  return {
    ariaLabel: `${calendarEventTypeLabel(event)}，${title}，${format(new Date(event.startAt), "yyyy年M月d日 HH:mm")} 至 ${format(new Date(event.endAt), "yyyy年M月d日 HH:mm")}`,
    className: calendarEventSurfaceClassName(event),
    color: calendarEventColor(event),
    data: event,
    end: new Date(event.endAt),
    foreground: calendarEventForeground(event),
    id: event.id,
    readOnly: true,
    start: new Date(event.startAt),
    title,
  };
}

function CalendarEventIcon({ occurrence }: EventCalendarRenderEventProps<StudioCalendarEvent>) {
  const event = occurrence.event.data;
  if (!event) {
    return null;
  }
  const Icon = event.kind === "human" ? IconUser : IconSparkles;

  return (
    <Icon aria-hidden="true" className="size-3 shrink-0" data-calendar-event-icon={event.kind} />
  );
}

export function CalendarEventTooltip({ event }: { event: StudioCalendarEvent | undefined }) {
  if (!event) {
    return null;
  }
  const candidates = event.candidates.map((candidate) => candidate.candidateName).join("、");
  const interviewers =
    event.kind === "human"
      ? event.interviewers.map((interviewer) => interviewer.name).join("、")
      : "";

  return (
    <div className="flex max-w-72 flex-col gap-1.5">
      <div className="font-medium">{event.title}</div>
      <div>类型：{calendarEventTypeLabel(event)}</div>
      {candidates ? <div>候选人：{candidates}</div> : null}
      <div>面试岗位：{interviewCalendarJobNames(event.candidates) || "未关联岗位"}</div>
      {interviewers ? <div>面试官：{interviewers}</div> : null}
      {event.kind === "human" ? (
        <div>形式：{humanInterviewFormatMeta[event.format].label}</div>
      ) : null}
      {event.kind === "human" && event.location ? <div>地点：{event.location}</div> : null}
      <div>开始：{format(new Date(event.startAt), "yyyy年M月d日 HH:mm")}</div>
      <div>结束：{format(new Date(event.endAt), "yyyy年M月d日 HH:mm")}</div>
    </div>
  );
}

function CalendarViewControls() {
  const { setView, view } = useEventCalendarView();
  const { today } = useEventCalendarNavigation();
  const lastCalendarView = useRef<"month" | "week" | "day">("week");

  function handleCalendarValueChange(value: string | number) {
    if (value === "month" || value === "week" || value === "day") {
      lastCalendarView.current = value;
      setView(value);
    }
  }

  function handlePrimaryValueChange(value: string | number) {
    if (value === "list") {
      setView("agenda");
      today();
      return;
    }
    if (value === "calendar") {
      setView(lastCalendarView.current);
    }
  }

  return (
    <div
      className="flex min-w-0 flex-col items-end justify-center gap-1.5"
      data-slot="calendar-view-controls"
    >
      <div data-slot="calendar-primary-view-row">
        <Tabs
          onValueChange={handlePrimaryValueChange}
          value={view === "agenda" ? "list" : "calendar"}
        >
          <TabsList aria-label="日程展示方式">
            <TabsTab value="list">列表</TabsTab>
            <TabsTab value="calendar">日历</TabsTab>
          </TabsList>
        </Tabs>
      </div>
      {view === "agenda" ? null : (
        <div data-slot="calendar-range-view-row">
          <Tabs onValueChange={handleCalendarValueChange} value={view}>
            <TabsList aria-label="日历范围">
              <TabsTab value="month">月</TabsTab>
              <TabsTab value="week">周</TabsTab>
              <TabsTab value="day">日</TabsTab>
            </TabsList>
          </Tabs>
        </div>
      )}
    </div>
  );
}

function CalendarDayHeader({
  day,
  isToday,
  view,
}: {
  day: Date;
  isToday: boolean;
  view: CalendarView;
}) {
  const formatWithMonth = view === "week" && (isFirstDayOfMonth(day) || isLastDayOfMonth(day));
  const weekday = format(day, "EEE", { locale: zhCN });
  const date = format(day, formatWithMonth ? "M.d" : "d", { locale: zhCN });
  const label = format(day, view === "month" ? "EEE" : "EEE d", {
    locale: zhCN,
  });
  const todayClassName =
    "-my-0.5 rounded-md bg-primary/10 px-1.5 py-0.5 font-semibold text-primary";

  if (view === "week") {
    return (
      <span
        className={`inline-flex flex-col items-center leading-tight ${isToday ? todayClassName : ""}`}
      >
        <span>{weekday}</span>
        <span>{date}</span>
      </span>
    );
  }

  return <span className={isToday ? `inline-flex ${todayClassName}` : undefined}>{label}</span>;
}

function CalendarNav() {
  const { view } = useEventCalendarView();

  return (
    <EventCalendarNav>
      <TooltipProvider>
        {view === "agenda" ? (
          <div className="px-2 font-medium text-sm">今天起 · 未来 30 天</div>
        ) : (
          <>
            <EventCalendarNavToday />
            <div className="flex items-center">
              <EventCalendarNavPrev />
              <EventCalendarNavNext />
            </div>
            <EventCalendarTitle className="ms-3" />
          </>
        )}
        <div className="grow" />
        <CalendarViewControls />
      </TooltipProvider>
    </EventCalendarNav>
  );
}

function CalendarSkeleton() {
  return (
    <output
      aria-label="正在加载面试日程"
      className="flex h-[min(760px,calc(100vh-12rem))] min-h-[560px] flex-col overflow-hidden rounded-lg"
    >
      <div className="flex flex-wrap items-center gap-2 px-2 py-2">
        <Skeleton className="h-8 w-14" />
        <Skeleton className="size-8" />
        <Skeleton className="size-8" />
        <Skeleton className="ms-1 h-5 w-40" />
        <div className="grow" />
        <Skeleton className="h-8 w-44" />
      </div>
      <FramePanel className="min-h-0 flex-1 overflow-hidden rounded-lg p-0">
        <div className="flex flex-col">
          {Array.from({ length: 3 }, (_, group) => (
            <div key={group}>
              <div className="flex items-center justify-between border-b bg-muted/60 px-4 py-2">
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-3 w-10" />
              </div>
              {Array.from({ length: group === 0 ? 2 : 1 }, (_value, row) => (
                <div className="grid grid-cols-[5rem_1fr] gap-3 border-b px-4 py-3" key={row}>
                  <Skeleton className="h-8 w-14" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-48" />
                    <Skeleton className="h-3 w-64 max-w-full" />
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </FramePanel>
    </output>
  );
}

function CalendarCandidatePicker({
  event,
  onOpenChange,
  onSelect,
}: {
  event: StudioCalendarEvent | null;
  onOpenChange: (open: boolean) => void;
  onSelect: (candidate: StudioCalendarCandidate) => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={event !== null}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>选择要查看的候选人</DialogTitle>
          <DialogDescription>这场面试包含多位候选人，请选择对应的招聘信息。</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          {event?.candidates.map((candidate) => (
            <Button
              className="h-auto justify-between gap-4 px-4 py-3 text-left"
              key={candidate.roundId}
              onClick={() => onSelect(candidate)}
              type="button"
              variant="outline"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{candidate.candidateName}</span>
                <span className="block truncate text-muted-foreground text-xs">
                  {candidate.jobDescriptionName || "未关联岗位"} · {candidate.roundLabel}
                </span>
              </span>
              <IconChevronRight aria-hidden="true" className="size-4 shrink-0" />
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function StudioCalendarPage({
  fetchCalendar = fetchStudioCalendar,
  onOpenAgendaEvent,
  slug,
}: {
  fetchCalendar?: typeof fetchStudioCalendar;
  onOpenAgendaEvent: (event: StudioCalendarEvent, candidate: StudioCalendarCandidate) => void;
  slug: string;
}) {
  const [range, setRange] = useState(initialRange);
  const [candidatePickerEvent, setCandidatePickerEvent] = useState<StudioCalendarEvent | null>(
    null,
  );
  const start = range.start.toISOString();
  const end = range.end.toISOString();
  const calendarQuery = useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => fetchCalendar(slug, start, end),
    queryKey: studioCalendarKeys.range(slug, start, end),
    staleTime: 30_000,
  });
  const events = useMemo(
    () => (calendarQuery.data?.events ?? []).map(toCalendarEvent),
    [calendarQuery.data?.events],
  );

  function handleRangeChange({ range: nextRange }: EventCalendarRangeInfo) {
    setRange((current) =>
      current.start.getTime() === nextRange.start.getTime() &&
      current.end.getTime() === nextRange.end.getTime()
        ? current
        : nextRange,
    );
  }

  function openAgendaEvent(event: StudioCalendarEvent) {
    const [candidate] = event.candidates;
    if (!candidate) {
      return;
    }
    if (event.candidates.length === 1) {
      onOpenAgendaEvent(event, candidate);
      return;
    }
    setCandidatePickerEvent(event);
  }

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      <PageHeader
        description="默认展示今天起未来 30 天的相关面试；日程只读，面试时间需在候选人详情中调整。"
        title="日程管理"
      />
      {calendarQuery.isError ? (
        <Alert variant="destructive">
          <AlertTitle>日程加载失败</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>暂时无法获取面试日程，请稍后重试。</span>
            <Button
              onClick={() => calendarQuery.refetch()}
              size="sm"
              type="button"
              variant="outline"
            >
              重新加载
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      <Frame className="min-w-0 rounded-xl">
        <SkeletonReveal
          loading={calendarQuery.isPending && !calendarQuery.data}
          skeleton={<CalendarSkeleton />}
        >
          <EventCalendar
            agendaDayCount={30}
            className="h-[min(760px,calc(100vh-12rem))] min-h-[560px] overflow-hidden rounded-lg"
            defaultView="agenda"
            events={events}
            eventTooltip
            i18n={CALENDAR_I18N}
            interactions={{ drag: false, resize: false, selectSlot: false }}
            loading={calendarQuery.isFetching}
            locale={zhCN}
            onEventClick={(occurrence, clickEvent) => {
              if (
                !(clickEvent.currentTarget instanceof HTMLElement) ||
                clickEvent.currentTarget.dataset.view !== "agenda"
              ) {
                return;
              }
              const event = occurrence.event.data;
              if (event) {
                clickEvent.preventDefault();
                openAgendaEvent(event);
              }
            }}
            onRangeChange={handleRangeChange}
            renderEventIcon={(props) => <CalendarEventIcon {...props} />}
            renderAgendaDayHeader={({ count, day }) => (
              <CalendarAgendaDayHeader count={count} day={day} />
            )}
            renderAgendaEvent={(props) => <CalendarAgendaEvent {...props} />}
            renderEventPreview={({ occurrence, trigger }) =>
              occurrence.event.data?.kind === "ai" ? (
                <AiInterviewEventHoverCard
                  event={occurrence.event.data}
                  slug={slug}
                  trigger={trigger}
                />
              ) : null
            }
            renderEventTooltip={({ occurrence }) => (
              <CalendarEventTooltip event={occurrence.event.data} />
            )}
            renderDayHeader={(props) => <CalendarDayHeader {...props} />}
            scrollToHour={8}
            views={["agenda", "month", "week", "day"]}
            weekStartsOn={1}
          >
            <CalendarNav />
            <EventCalendarContent
              render={<FramePanel className="min-h-0 flex-1 overflow-hidden rounded-lg p-0" />}
            />
          </EventCalendar>
        </SkeletonReveal>
      </Frame>
      <CalendarCandidatePicker
        event={candidatePickerEvent}
        onOpenChange={(open) => !open && setCandidatePickerEvent(null)}
        onSelect={(candidate) => {
          const event = candidatePickerEvent;
          setCandidatePickerEvent(null);
          if (event) {
            onOpenAgendaEvent(event, candidate);
          }
        }}
      />
    </div>
  );
}
