"use client";

import { IconChevronRight, IconSparkles, IconUser } from "@tabler/icons-react";
import { addDays, format, isFirstDayOfMonth, isLastDayOfMonth, isSameDay } from "date-fns";
import { zhCN } from "date-fns/locale";
import { useMemo, useRef, useState } from "react";
import type { ReactElement } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { humanInterviewFormatMeta } from "@app/db-schema/studio-interviews";
import type {
  StudioCalendarCandidate,
  StudioCalendarEvent,
  StudioCalendarEventStatus,
} from "@app/shared/studio-calendar";
import { interviewCalendarJobNames } from "@app/shared/interview-calendar";
import { cn } from "@app/shared/utils";
import { PageHeader } from "@/components/features/studio/page-header";
import {
  AGENDA_DAY_COUNT,
  AgendaWindowLabel,
  agendaWindowRange,
} from "./studio-calendar-agenda-window";
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
import { Skeleton } from "@/components/ui/skeleton";
import { SkeletonReveal } from "@/components/ui/skeleton-reveal";
import { Tabs, TabsList, TabsTab } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { fetchStudioCalendar } from "@/lib/client/api";
import { studioCalendarKeys } from "@/lib/client/api/query-keys";
import { AiInterviewEventHoverCard } from "./ai-interview-event-hover-card";
import { CandidateAvatar } from "@/components/features/studio/candidate-avatar-image";
import { JobDescriptionHoverCard } from "@/components/features/studio/job-descriptions/job-description-hover-card";
import { InterviewEvaluationHoverCard, PersonAvatar } from "./interview-evaluation-hover-card";

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

// 色调与招聘台阶段徽标一致：AI 面试用紫色，真人面试（复面 / 终面）用天蓝。
const EVENT_TYPE_META = {
  ai: { className: "bg-purple-tint text-purple-ink", icon: IconSparkles, label: "AI 面试" },
  human: { className: "bg-sky-tint text-sky-ink", icon: IconUser, label: "真人面试" },
} as const satisfies Record<
  StudioCalendarEvent["kind"],
  { className: string; icon: typeof IconUser; label: string }
>;

function CalendarEventTypeBadge({
  className,
  event,
}: {
  className?: string;
  event: StudioCalendarEvent;
}) {
  const { className: toneClassName, icon: Icon, label } = EVENT_TYPE_META[event.kind];
  return (
    <Badge className={cn("w-22", toneClassName, className)}>
      <Icon aria-hidden="true" />
      {label}
    </Badge>
  );
}

// 表头与每一行共用的列宽，保证宽屏下逐列对齐。/ Column tracks shared by the header and every row.
const AGENDA_COLUMNS_CLASS =
  "lg:grid-cols-[4.5rem_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,0.9fr)_5.5rem_4.5rem_4rem_1rem]";

const AGENDA_COLUMNS = ["时间", "候选人", "岗位", "面试官", "类型", "状态", "评价"] as const;

function CalendarAgendaHeader() {
  const { view } = useEventCalendarView();
  if (view !== "agenda") {
    return null;
  }
  return (
    <div
      aria-hidden="true"
      className={cn(
        "hidden gap-x-4 border-b px-4 py-2.5 font-medium text-muted-foreground text-xs lg:grid",
        AGENDA_COLUMNS_CLASS,
      )}
      data-slot="calendar-agenda-header"
    >
      {AGENDA_COLUMNS.map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  );
}

function CalendarInterviewers({ event }: { event: StudioCalendarEvent }) {
  if (event.kind === "ai") {
    return (
      <span className="flex min-w-0 items-center gap-1.5">
        <PersonAvatar avatarUrl={null} kind="ai" seed="ai" />
        <span className="truncate">AI 面试官</span>
      </span>
    );
  }
  if (event.interviewers.length === 0) {
    return <span className="truncate">面试官待确认</span>;
  }
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="flex shrink-0 -space-x-1">
        {event.interviewers.slice(0, 3).map((interviewer) => (
          <span className="rounded-full ring-2 ring-background" key={interviewer.id}>
            <PersonAvatar avatarUrl={interviewer.avatarUrl} seed={interviewer.id} />
          </span>
        ))}
      </span>
      <span className="truncate">
        {uniqueText(event.interviewers.map((interviewer) => interviewer.name))}
      </span>
    </span>
  );
}

function CalendarAgendaEvent({
  occurrence,
  slug,
}: EventCalendarRenderEventProps<StudioCalendarEvent> & { slug: string }) {
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
  const [firstCandidate] = event.candidates;
  // 多位候选人属于同一岗位时才挂岗位预览。/ Only preview the job when every candidate shares it.
  const jobDescriptionIds = new Set(
    event.candidates.map((candidate) => candidate.jobDescriptionId),
  );
  const [sharedJobDescriptionId] = jobDescriptionIds.size === 1 ? [...jobDescriptionIds] : [null];

  return (
    <div
      className={cn(
        "grid w-full min-w-0 grid-cols-[4rem_minmax(0,1fr)] items-center gap-x-4 gap-y-1.5",
        AGENDA_COLUMNS_CLASS,
      )}
    >
      <div className="self-start tabular-nums lg:self-center">
        <div className="font-medium text-sm leading-5">{format(occurrence.start, "HH:mm")}</div>
        <div className="text-muted-foreground text-xs">{durationMinutes} 分钟</div>
      </div>
      <div className="min-w-0">
        <div
          className="flex min-w-0 items-center gap-1.5 font-medium text-sm"
          title={candidateNames || event.title}
        >
          {firstCandidate ? (
            <CandidateAvatar
              className="size-4.5"
              label={firstCandidate.candidateName}
              recordId={firstCandidate.interviewRecordId}
              seed={firstCandidate.candidateName.trim() || "未命名候选人"}
              source="resumes"
              version={firstCandidate.candidateAvatarVersion}
            />
          ) : null}
          <span className="truncate">{candidateNames || event.title}</span>
          {roundLabels ? (
            <span className="shrink-0 font-normal text-muted-foreground text-xs">
              {roundLabels}
            </span>
          ) : null}
        </div>
        <div className="truncate text-muted-foreground text-xs lg:hidden">
          {jobNames} · {interviewerNames}
        </div>
      </div>
      <div className="hidden min-w-0 text-muted-foreground text-sm lg:block" title={jobNames}>
        {sharedJobDescriptionId ? (
          <JobDescriptionHoverCard
            className="block max-w-full truncate decoration-foreground/20 hover:decoration-foreground/60"
            jobDescriptionId={sharedJobDescriptionId}
            name={jobNames}
            triggerElement="span"
          />
        ) : (
          <span className="block truncate">{jobNames}</span>
        )}
      </div>
      <div
        className="hidden min-w-0 text-muted-foreground text-sm lg:block"
        title={interviewerNames}
      >
        <CalendarInterviewers event={event} />
      </div>
      <div className="col-start-2 flex min-w-0 flex-wrap items-center gap-2 lg:contents">
        <CalendarEventTypeBadge className="w-22 justify-center" event={event} />
        <Badge className="w-fit" dot variant={status.variant}>
          {status.label}
        </Badge>
        <div className="flex flex-wrap gap-1">
          {event.candidates.map((candidate) => (
            <InterviewEvaluationHoverCard
              candidate={candidate}
              key={candidate.roundId}
              kind={event.kind}
              slug={slug}
            />
          ))}
        </div>
      </div>
      <IconChevronRight
        aria-hidden="true"
        className="hidden size-4 text-muted-foreground/60 transition-colors group-hover/ec-event:text-foreground lg:block"
      />
    </div>
  );
}

function CalendarAgendaDayHeader({ count, day }: { count: number; day: Date }) {
  const now = new Date();
  let relativeLabel: "昨天" | "今天" | "明天" | null = null;
  if (isSameDay(day, now)) {
    relativeLabel = "今天";
  } else if (isSameDay(day, addDays(now, -1))) {
    relativeLabel = "昨天";
  } else if (isSameDay(day, addDays(now, 1))) {
    relativeLabel = "明天";
  }
  const dateLabel = format(day, "M月d日（EEE）", { locale: zhCN });

  return (
    <div className="flex w-full items-center gap-2 text-sm">
      <span className="font-medium">
        {relativeLabel ? `${relativeLabel} · ` : ""}
        {dateLabel}
      </span>
      <span className="text-muted-foreground font-normal text-xs tabular-nums">{count} 场</span>
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
  return EVENT_TYPE_META[event.kind].label;
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
  const { icon: Icon } = EVENT_TYPE_META[event.kind];

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

// 列表 / 日历切换时，左侧导航与内容区按视图重新挂载并轻微淡入。
// / Leading nav and content remount per mode and fade in lightly on a list/calendar switch.
const VIEW_ENTER_CLASS =
  "animate-in fade-in-0 slide-in-from-bottom-1 duration-200 ease-[var(--ease-smooth-out)] motion-reduce:animate-none";

type CalendarRangeView = "month" | "week" | "day";

function CalendarRangeControls({
  onViewChange,
}: {
  onViewChange: (view: CalendarRangeView) => void;
}) {
  const { view } = useEventCalendarView();

  return (
    <div className="flex min-w-0 items-center gap-3" data-slot="calendar-range-view-row">
      <Tabs
        onValueChange={(value) => {
          if (value === "month" || value === "week" || value === "day") {
            onViewChange(value);
          }
        }}
        value={view}
      >
        <TabsList aria-label="日历范围">
          <TabsTab value="month">月</TabsTab>
          <TabsTab value="week">周</TabsTab>
          <TabsTab value="day">日</TabsTab>
        </TabsList>
      </Tabs>
      <EventCalendarTitle className="border-s ps-3 font-medium" />
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
  const { setView, view } = useEventCalendarView();
  const { goTo, today } = useEventCalendarNavigation();
  const lastCalendarView = useRef<CalendarRangeView>("week");
  const mode = view === "agenda" ? "list" : "calendar";

  function handleRangeViewChange(value: CalendarRangeView) {
    lastCalendarView.current = value;
    setView(value);
  }

  function handlePrimaryValueChange(value: string | number) {
    if (value === "list") {
      setView("agenda");
      goTo(agendaWindowRange().start);
      return;
    }
    if (value === "calendar") {
      setView(lastCalendarView.current);
      today();
    }
  }

  return (
    <EventCalendarNav className="gap-y-3 px-0 pt-0 pb-3">
      <TooltipProvider>
        <div
          className={cn("flex h-9 min-w-0 flex-wrap items-center gap-2", VIEW_ENTER_CLASS)}
          data-slot="calendar-nav-leading"
          key={mode}
        >
          {mode === "list" ? (
            <AgendaWindowLabel />
          ) : (
            <>
              <EventCalendarNavToday />
              <div className="flex items-center gap-1">
                <EventCalendarNavPrev />
                <EventCalendarNavNext />
              </div>
              <CalendarRangeControls onViewChange={handleRangeViewChange} />
            </>
          )}
        </div>
        <div className="ms-auto shrink-0" data-slot="calendar-primary-view-row">
          <Tabs onValueChange={handlePrimaryValueChange} value={mode}>
            <TabsList aria-label="日程展示方式">
              <TabsTab value="list">列表</TabsTab>
              <TabsTab value="calendar">日历</TabsTab>
            </TabsList>
          </Tabs>
        </div>
      </TooltipProvider>
    </EventCalendarNav>
  );
}

function CalendarBody() {
  const { view } = useEventCalendarView();
  const mode = view === "agenda" ? "list" : "calendar";

  return (
    <div
      className={cn(
        "flex min-h-0 flex-1 flex-col overflow-hidden lg:rounded-xl lg:border lg:bg-background",
        VIEW_ENTER_CLASS,
      )}
      key={mode}
    >
      <CalendarAgendaHeader />
      <EventCalendarContent render={<div className="min-h-0 flex-1 overflow-hidden" />} />
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <output
      aria-label="正在加载面试日程"
      className="flex h-[min(760px,calc(100vh-12rem))] min-h-[560px] flex-col overflow-hidden rounded-lg"
    >
      <div className="flex flex-wrap items-center gap-2 pb-3">
        <Skeleton className="h-8 w-14" />
        <Skeleton className="size-8" />
        <Skeleton className="size-8" />
        <Skeleton className="ms-1 h-5 w-40" />
        <div className="grow" />
        <Skeleton className="h-8 w-44" />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border bg-background">
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
      </div>
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

/**
 * 日历视图沿用 AI 面试预览，真人面试使用 tooltip；列表视图的评价预览挂在评价徽标上。
 * / Calendar views keep the AI preview and the human tooltip; list rows preview from the badge.
 */
function renderCalendarEventPreview({
  event,
  slug,
  trigger,
  view,
}: {
  event: StudioCalendarEvent | undefined;
  slug: string;
  trigger: ReactElement;
  view: CalendarView;
}) {
  if (!event) {
    return null;
  }
  if (view === "agenda") {
    // 列表行本身不挂预览或 tooltip，评价详情只在评价徽标上展开。
    // / List rows carry no preview or tooltip; evaluation details open from the badge only.
    return trigger;
  }
  return event.kind === "ai" ? (
    <AiInterviewEventHoverCard event={event} slug={slug} trigger={trigger} />
  ) : null;
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
  const [range, setRange] = useState(() => agendaWindowRange());
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
        description="列表展示今天前后 3 天的面试；日程只读，面试时间需在候选人详情中调整。"
        title="面试管理"
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
      <div className="min-w-0">
        <SkeletonReveal
          loading={calendarQuery.isPending && !calendarQuery.data}
          skeleton={<CalendarSkeleton />}
        >
          <EventCalendar
            agendaDayCount={AGENDA_DAY_COUNT}
            defaultDate={range.start}
            className="h-[min(760px,calc(100vh-12rem))] min-h-[560px] overflow-hidden rounded-lg"
            classNames={{
              // 移动端每条日程是一张卡片；宽屏是只有行分隔线的表格。`border-b!` 覆盖列表默认去掉
              // 末行底线的规则，让表格收尾、最后一张卡片也完整。
              // / Cards on mobile, a row-divided table on wide screens; `border-b!` keeps the last
              // row's divider that the agenda list strips by default.
              agendaDayHeader:
                "border-b-0 bg-background/95 px-1 pt-4 pb-2 backdrop-blur-sm lg:border-b lg:bg-muted/40 lg:px-4 lg:py-2",
              agendaItem:
                "mb-2 rounded-lg border border-b! bg-background px-3 py-3 lg:mb-0 lg:rounded-none lg:border-x-0 lg:border-t-0 lg:px-4 lg:py-3",
              agendaView: "border-t-0",
            }}
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
            renderAgendaEvent={(props) => <CalendarAgendaEvent {...props} slug={slug} />}
            renderEventPreview={({ occurrence, trigger, view }) =>
              renderCalendarEventPreview({ event: occurrence.event.data, slug, trigger, view })
            }
            renderEventTooltip={({ occurrence }) => (
              <CalendarEventTooltip event={occurrence.event.data} />
            )}
            renderDayHeader={(props) => <CalendarDayHeader {...props} />}
            scrollToHour={8}
            navButtonVariant="outline"
            views={["agenda", "month", "week", "day"]}
            weekStartsOn={1}
          >
            <CalendarNav />
            <CalendarBody />
          </EventCalendar>
        </SkeletonReveal>
      </div>
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
