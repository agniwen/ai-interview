"use client";

import { IconSparkles, IconUser } from "@tabler/icons-react";
import { addDays, format, startOfWeek } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { humanInterviewFormatMeta } from "@arc/db-schema/studio-interviews";
import type { StudioCalendarEvent } from "@arc/shared/studio-calendar";
import { PageHeader } from "@/components/features/studio/page-header";
import {
  EventCalendar,
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
  CalendarEvent,
  EventCalendarDateRange,
  EventCalendarRangeInfo,
} from "@/components/reui/event-calendar/event-calendar-types";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Frame, FramePanel } from "@/components/ui/frame";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { fetchStudioCalendar } from "@/lib/client/api";
import { studioCalendarKeys } from "@/lib/client/api/query-keys";

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
    agenda: "议程",
    day: "日",
    days: (count) => `${count} 日`,
    month: "月",
    week: "周",
  },
} satisfies Partial<EventCalendarI18nConfig>;

function initialRange(): EventCalendarDateRange {
  const now = new Date();
  const start = startOfWeek(now, { weekStartsOn: 1 });
  return {
    end: addDays(start, 7),
    start,
  };
}

function calendarTitle(event: StudioCalendarEvent): string {
  const candidateNames = event.candidates.map((candidate) => candidate.candidateName).join("、");
  return candidateNames ? `${candidateNames} · ${event.title}` : event.title;
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
  if (event.status === "ended") {
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
  const title = calendarTitle(event);
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

function CalendarEventTooltip({ event }: { event: StudioCalendarEvent | undefined }) {
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

function CalendarViewTabs() {
  const { setView, view } = useEventCalendarView();

  function handleValueChange(value: string | number) {
    if (value === "month" || value === "week" || value === "day") {
      setView(value);
    }
  }

  return (
    <Tabs onValueChange={handleValueChange} value={view}>
      <TabsList aria-label="日历视图">
        <TabsTab value="month">月</TabsTab>
        <TabsTab value="week">周</TabsTab>
        <TabsTab value="day">日</TabsTab>
      </TabsList>
    </Tabs>
  );
}

function CalendarNav() {
  return (
    <EventCalendarNav>
      <TooltipProvider>
        <EventCalendarNavToday />
        <div className="flex items-center">
          <EventCalendarNavPrev />
          <EventCalendarNavNext />
        </div>
        <EventCalendarTitle className="ms-3" />
        <div className="grow" />
        <CalendarViewTabs />
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
        <div className="grid grid-cols-[4rem_repeat(7,minmax(7rem,1fr))] border-b">
          <div className="h-14 border-e" />
          {Array.from({ length: 7 }, (_, index) => (
            <div className="flex h-14 items-center justify-center border-e" key={index}>
              <Skeleton className="h-4 w-16" />
            </div>
          ))}
        </div>
        <div className="grid h-full grid-cols-[4rem_repeat(7,minmax(7rem,1fr))]">
          <div className="flex flex-col justify-around border-e px-3 py-4">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton className="h-3 w-8" key={index} />
            ))}
          </div>
          {Array.from({ length: 7 }, (_, column) => (
            <div
              className="border-e bg-[linear-gradient(to_bottom,var(--border)_1px,transparent_1px)] bg-[size:100%_12.5%]"
              key={column}
            >
              {column === 2 ? <Skeleton className="mx-1 mt-24 h-14" /> : null}
            </div>
          ))}
        </div>
      </FramePanel>
    </output>
  );
}

export function StudioCalendarPage({ slug }: { slug: string }) {
  const [range, setRange] = useState(initialRange);
  const start = range.start.toISOString();
  const end = range.end.toISOString();
  const calendarQuery = useQuery({
    placeholderData: keepPreviousData,
    queryFn: () => fetchStudioCalendar(slug, start, end),
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

  return (
    <div className="mx-auto flex w-full max-w-[96rem] flex-col gap-6">
      <PageHeader
        description="按月、周或日查看 AI 面试计划、实际面试记录与真人面试。日程为只读，面试时间请在候选人详情中调整。"
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
        {calendarQuery.isPending ? (
          <CalendarSkeleton />
        ) : (
          <EventCalendar
            className="h-[min(760px,calc(100vh-12rem))] min-h-[560px] overflow-hidden rounded-lg"
            defaultView="week"
            events={events}
            eventTooltip
            i18n={CALENDAR_I18N}
            interactions={{ drag: false, resize: false, selectSlot: false }}
            loading={calendarQuery.isFetching}
            locale={zhCN}
            onRangeChange={handleRangeChange}
            renderEventIcon={(props) => <CalendarEventIcon {...props} />}
            renderEventTooltip={({ occurrence }) => (
              <CalendarEventTooltip event={occurrence.event.data} />
            )}
            scrollToHour={8}
            views={["month", "week", "day"]}
            weekStartsOn={1}
          >
            <CalendarNav />
            <EventCalendarContent
              render={<FramePanel className="min-h-0 flex-1 overflow-hidden rounded-lg p-0" />}
            />
          </EventCalendar>
        )}
      </Frame>
    </div>
  );
}
