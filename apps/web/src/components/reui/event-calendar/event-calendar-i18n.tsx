import type {
  CalendarView,
  EventCalendarDateRange,
} from "@/components/reui/event-calendar/event-calendar-types";
import { format, isSameMonth, isSameYear } from "date-fns";
import type { Locale } from "date-fns";

interface EventCalendarI18nConfig {
  labels: {
    today: string;
    previous: string;
    next: string;
    addEvent: string;
    allDay: string;
    more: (count: number) => string;
    noEvents: string;
    loading: string;
    event: string;
    events: (count: number) => string;
    selectView: string;
    week: (weekNumber: number) => string;
    resources: string;
    goToDate: string;
    /** Cursor hint while a drag/resize hovers a rejected position. */
    dropNotAllowed: string;
    /** Aria-label suffix on chip segments that continue past the cell. */
    continues: string;
    /** Agenda label for the first day of a multi-day event. */
    timeFrom: (time: string) => string;
    /** Agenda label for the last day of a multi-day event. */
    timeUntil: (time: string) => string;
    /** View-switcher shortcut hint characters, per view. */
    viewShortcuts: Record<CalendarView, string>;
    /** Aria-label of the agenda day collapse/expand toggle. */
    toggleDayEvents: (count: number, expanded: boolean) => string;
    /** Aria-label of the agenda event details toggle. */
    eventDetails: (title: string) => string;
    /** Compact "+N" overflow (agenda summary dot stack). */
    moreCompact: (count: number) => string;
    /** Joins a bounded from-to time span. */
    timeRange: (from: string, to: string) => string;
  };
  viewNames: {
    month: string;
    week: string;
    day: string;
    days: (count: number) => string;
    agenda: string;
    resource: string;
  };
  /** date-fns format strings, applied with the calendar `locale`. */
  formats: {
    monthTitle: string;
    /** Undefined = smart cross-month range via functions.formatTitle. */
    weekTitle?: string;
    dayTitle: string;
    /** Undefined = smart range label via functions.formatTitle. */
    agendaTitle?: string;
    monthDayHeader: string;
    /** Narrow variant used by the month view below the compact breakpoint. */
    monthDayHeaderNarrow: string;
    timeGridDayHeader: string;
    agendaDayHeader: string;
    /** Agenda date-gutter day number. */
    agendaDayNumber: string;
    /** Agenda date-gutter weekday label. */
    agendaWeekday: string;
    /** "+N more" popover day header. */
    moreDayHeader: string;
    /** Month cell aria-label date. */
    monthCellAriaLabel: string;
    /** Time-grid day column aria-label date. */
    dayAria: string;
    /** Undefined = the resource view title falls back to dayTitle. */
    resourceTitle?: string;
    timeGutter: string;
    /** Sub-hour gutter labels (interval below 60 minutes). */
    timeGutterMinute: string;
    eventTime: string;
    monthCellDay: string;
  };
  functions: {
    formatTitle: (
      view: CalendarView,
      ctx: {
        date: Date;
        activeRange: EventCalendarDateRange;
        visibleRange: EventCalendarDateRange;
        locale?: Locale;
      },
    ) => string;
    formatEventTime: (start: Date, end: Date, allDay: boolean) => string;
    formatDayRange: (range: EventCalendarDateRange) => string;
    /** Chip native tooltip text; return undefined to drop the attribute. */
    formatEventLabel?: (title: string, timeLabel: string) => string | undefined;
    /** Chip aria-label composition. */
    formatEventAriaLabel?: (title: string, timeLabel: string, continues: boolean) => string;
  };
}

const DEFAULT_LABELS: EventCalendarI18nConfig["labels"] = {
  addEvent: "Add event",
  allDay: "All day",
  continues: "continues",
  dropNotAllowed: "Can't place here",
  event: "event",
  eventDetails: (title) => title,
  events: (count) => (count === 1 ? "1 event" : `${count} events`),
  goToDate: "Go to date",
  loading: "Loading events",
  more: (count) => `+${count} more`,
  moreCompact: (count) => `+${count}`,
  next: "Next",
  noEvents: "No events",
  previous: "Previous",
  resources: "Resources",
  selectView: "Select view",
  timeFrom: (time) => `From ${time}`,
  timeRange: (from, to) => `${from} - ${to}`,
  timeUntil: (time) => `Until ${time}`,
  today: "Today",
  toggleDayEvents: (count) => (count === 1 ? "1 event" : `${count} events`),
  viewShortcuts: {
    agenda: "A",
    day: "D",
    days: "5",
    month: "M",
    resource: "G",
    week: "W",
  },
  week: (weekNumber) => `W${weekNumber}`,
};

const DEFAULT_VIEW_NAMES: EventCalendarI18nConfig["viewNames"] = {
  agenda: "Agenda",
  day: "Day",
  days: (count) => `${count} days`,
  month: "Month",
  resource: "Time Grid",
  week: "Week",
};

const DEFAULT_FORMATS: EventCalendarI18nConfig["formats"] = {
  agendaDayHeader: "EEEE, MMMM d",
  agendaDayNumber: "d",
  agendaTitle: undefined,
  agendaWeekday: "EEE",
  dayAria: "PPPP",
  dayTitle: "EEEE, MMMM d, yyyy",
  eventTime: "h:mm a",
  monthCellAriaLabel: "PPPP",
  monthCellDay: "d",
  monthDayHeader: "EEE",
  monthDayHeaderNarrow: "EEEEE",
  monthTitle: "MMMM yyyy",
  moreDayHeader: "EEEE, MMMM d",
  resourceTitle: undefined,
  timeGridDayHeader: "EEE d",
  timeGutter: "h a",
  timeGutterMinute: "h:mm a",
  weekTitle: undefined,
};

/**
 * Default formatting functions BOUND to a config's labels/formats, so that
 * `formats` overrides flow into the default renderers (a consumer overriding
 * formats.monthTitle without replacing formatTitle still sees it applied).
 */
function makeDefaultFunctions(
  cfg: Pick<EventCalendarI18nConfig, "labels" | "formats">,
): EventCalendarI18nConfig["functions"] {
  return {
    formatDayRange: (range) => {
      const rangeEnd = new Date(range.end.getTime() - 1);
      return `${format(range.start, "MMM d")} - ${format(rangeEnd, "MMM d")}`;
    },
    formatEventTime: (start, end, allDay) => {
      if (allDay) {
        return cfg.labels.allDay;
      }
      const fmt = cfg.formats.eventTime;
      // Multi-day timed events carry the date on both sides
      if (end.getTime() - start.getTime() > 24 * 60 * 60 * 1000) {
        return `${format(start, `MMM d, ${fmt}`)} - ${format(end, `MMM d, ${fmt}`)}`;
      }
      return `${format(start, fmt)} - ${format(end, fmt)}`;
    },
    formatTitle: (view, { date, activeRange, locale }) => {
      const opts = { locale };
      if (view === "month") {
        return format(date, cfg.formats.monthTitle, opts);
      }
      if (view === "resource") {
        return format(date, cfg.formats.resourceTitle ?? cfg.formats.dayTitle, opts);
      }
      if (view === "day") {
        return format(date, cfg.formats.dayTitle, opts);
      }
      if (view === "week" && cfg.formats.weekTitle) {
        return format(date, cfg.formats.weekTitle, opts);
      }
      if (view === "agenda" && cfg.formats.agendaTitle) {
        return format(date, cfg.formats.agendaTitle, opts);
      }
      // week / days / agenda: smart range label, last day is activeRange.end - 1ms
      const rangeEnd = new Date(activeRange.end.getTime() - 1);
      const { start } = activeRange;
      if (isSameMonth(start, rangeEnd)) {
        return `${format(start, "MMMM d", opts)} - ${format(rangeEnd, "d, yyyy", opts)}`;
      }
      if (isSameYear(start, rangeEnd)) {
        return `${format(start, "MMM d", opts)} - ${format(rangeEnd, "MMM d, yyyy", opts)}`;
      }
      return `${format(start, "MMM d, yyyy", opts)} - ${format(rangeEnd, "MMM d, yyyy", opts)}`;
    },
  };
}

const DEFAULT_EVENT_CALENDAR_I18N: EventCalendarI18nConfig = {
  formats: DEFAULT_FORMATS,
  functions: makeDefaultFunctions({
    formats: DEFAULT_FORMATS,
    labels: DEFAULT_LABELS,
  }),
  labels: DEFAULT_LABELS,
  viewNames: DEFAULT_VIEW_NAMES,
};

/**
 * Shallow merge per nested object, matching the filters.tsx i18n contract:
 * a partial override replaces individual keys, never whole sections. Default
 * functions are re-bound to the MERGED labels/formats; explicit `functions`
 * overrides still win.
 */
function mergeEventCalendarI18n(
  overrides?: Partial<EventCalendarI18nConfig>,
): EventCalendarI18nConfig {
  if (!overrides) {
    return DEFAULT_EVENT_CALENDAR_I18N;
  }
  const labels = { ...DEFAULT_LABELS, ...overrides.labels };
  const viewNames = { ...DEFAULT_VIEW_NAMES, ...overrides.viewNames };
  const formats = { ...DEFAULT_FORMATS, ...overrides.formats };
  return {
    formats,
    functions: {
      ...makeDefaultFunctions({ formats, labels }),
      ...overrides.functions,
    },
    labels,
    viewNames,
  };
}

export { DEFAULT_EVENT_CALENDAR_I18N, mergeEventCalendarI18n };
export type { EventCalendarI18nConfig };
