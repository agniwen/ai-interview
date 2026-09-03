import { expandRecurrence } from "@/components/reui/event-calendar/event-calendar-recurrence";
import type {
  CalendarEvent,
  CalendarView,
  EventCalendarDateRange,
  EventCalendarOccurrence,
  EventCalendarOffDaysConfig,
  EventCalendarResource,
  EventCalendarSegment,
} from "@/components/reui/event-calendar/event-calendar-types";
import { TZDate } from "@date-fns/tz";
import {
  addDays,
  addMonths,
  addWeeks,
  differenceInCalendarDays,
  differenceInMinutes,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";

type WeekStartsOn = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** Packing-effective minimum in minutes so tiny events do not stack invisibly. */
const MIN_PACK_SLOT = 30;

/** The instant re-expressed in the display time zone (TZDate extends Date). */
function toZoned(date: Date, timeZone: string): TZDate {
  return new TZDate(date.getTime(), timeZone);
}

/** Zoned midnight of the day containing the instant. */
function zonedStartOfDay(date: Date, timeZone: string): TZDate {
  return startOfDay(toZoned(date, timeZone));
}

/** Stable per-day key in the display time zone. */
function getDayKey(date: Date, timeZone: string): string {
  return format(toZoned(date, timeZone), "yyyy-MM-dd");
}

/** Day length in minutes; 1380/1500 on DST transition days - never assume 1440. */
function getDayTotalMinutes(dayStart: Date, timeZone: string): number {
  const next = zonedStartOfDay(addDays(toZoned(dayStart, timeZone), 1), timeZone);
  return differenceInMinutes(next, dayStart);
}

function snapMinutes(minutes: number, snap: number): number {
  return Math.round(minutes / snap) * snap;
}

interface ViewRangeOptions {
  timeZone: string;
  weekStartsOn: WeekStartsOn;
  dayCount: number;
  agendaDayCount: number;
  fixedWeeks: boolean;
}

interface ViewDateRanges {
  visibleRange: EventCalendarDateRange;
  activeRange: EventCalendarDateRange;
}

function getViewDateRange(view: CalendarView, date: Date, opts: ViewRangeOptions): ViewDateRanges {
  const { timeZone, weekStartsOn, dayCount, agendaDayCount, fixedWeeks } = opts;
  const zoned = toZoned(date, timeZone);

  if (view === "month") {
    const activeStart = startOfMonth(zoned);
    const activeEnd = startOfMonth(addMonths(zoned, 1));
    const visibleStart = startOfWeek(activeStart, { weekStartsOn });
    let visibleEnd: Date;
    if (fixedWeeks) {
      visibleEnd = addDays(visibleStart, 42);
    } else {
      visibleEnd = startOfWeek(addDays(activeEnd, -1), { weekStartsOn });
      visibleEnd = addWeeks(visibleEnd, 1);
    }
    return {
      activeRange: { end: activeEnd, start: activeStart },
      visibleRange: { end: visibleEnd, start: visibleStart },
    };
  }

  if (view === "week") {
    const start = startOfWeek(zoned, { weekStartsOn });
    const range = { end: addWeeks(start, 1), start };
    return { activeRange: range, visibleRange: range };
  }

  if (view === "day" || view === "resource") {
    const start = startOfDay(zoned);
    const range = { end: addDays(start, 1), start };
    return { activeRange: range, visibleRange: range };
  }

  if (view === "days") {
    const start = startOfDay(zoned);
    const range = { end: addDays(start, Math.max(1, dayCount)), start };
    return { activeRange: range, visibleRange: range };
  }

  // agenda
  const start = startOfDay(zoned);
  const range = { end: addDays(start, Math.max(1, agendaDayCount)), start };
  return { activeRange: range, visibleRange: range };
}

/** The anchor date stepped one period forward or backward for the view. */
function stepDate(
  view: CalendarView,
  date: Date,
  direction: 1 | -1,
  opts: Pick<ViewRangeOptions, "timeZone" | "dayCount" | "agendaDayCount">,
): Date {
  const zoned = toZoned(date, opts.timeZone);
  if (view === "month") {
    return addMonths(zoned, direction);
  }
  if (view === "week") {
    return addWeeks(zoned, direction);
  }
  if (view === "day" || view === "resource") {
    return addDays(zoned, direction);
  }
  if (view === "days") {
    return addDays(zoned, direction * Math.max(1, opts.dayCount));
  }
  return addDays(zoned, direction * Math.max(1, opts.agendaDayCount));
}

function rangesIntersect(a: EventCalendarDateRange, b: EventCalendarDateRange): boolean {
  return a.start < b.end && a.end > b.start;
}

function eventsOverlap(a: { start: Date; end: Date }, b: { start: Date; end: Date }): boolean {
  return a.start < b.end && a.end > b.start;
}

/**
 * The one canonical multi-day segmentation. Splits an occurrence into per-day
 * segments clamped to the range. Rules (unit-tested in M1): exclusive end - an
 * event ending exactly at zoned midnight emits NO segment for that day;
 * zero-duration events emit one min-height segment; allDay compares date-only
 * in the display zone.
 */
function segmentOccurrence<TData>(
  occurrence: EventCalendarOccurrence<TData>,
  range: EventCalendarDateRange,
  timeZone: string,
): EventCalendarSegment<TData>[] {
  const occStart = occurrence.start;
  const occEnd = occurrence.end;
  const isZeroLength = occEnd.getTime() === occStart.getTime();

  const clampStart = occStart > range.start ? occStart : range.start;
  const clampEnd = occEnd < range.end ? occEnd : range.end;
  if (clampEnd < clampStart) {
    return [];
  }
  if (clampEnd.getTime() === clampStart.getTime() && !isZeroLength) {
    return [];
  }

  const segments: EventCalendarSegment<TData>[] = [];
  let cursor = zonedStartOfDay(clampStart, timeZone);

  while (cursor < clampEnd || (isZeroLength && segments.length === 0)) {
    const next = zonedStartOfDay(addDays(toZoned(cursor, timeZone), 1), timeZone);
    const segStart = clampStart > cursor ? clampStart : cursor;
    const segEnd = clampEnd < next ? clampEnd : next;

    const emptySeg = segEnd.getTime() <= segStart.getTime();
    if (!emptySeg || isZeroLength) {
      const isStart = segStart.getTime() === occStart.getTime();
      const isEnd = segEnd.getTime() === occEnd.getTime();
      segments.push({
        continuesAfter: !isEnd,
        continuesBefore: !isStart,
        day: cursor,
        endMin: occurrence.allDay
          ? undefined
          : Math.max(differenceInMinutes(segEnd, cursor), differenceInMinutes(segStart, cursor)),
        isEnd,
        isStart,
        occurrence,
        startMin: occurrence.allDay ? undefined : differenceInMinutes(segStart, cursor),
      });
    }
    if (isZeroLength) {
      break;
    }
    cursor = next;
  }

  return segments;
}

/** True when the occurrence should render as a bar (all-day row / month lanes). */
function isBarOccurrence(occurrence: EventCalendarOccurrence): boolean {
  return occurrence.allDay || spansMultipleDays(occurrence);
}

function spansMultipleDays(occ: { start: Date; end: Date }): boolean {
  // An event ending exactly at the next midnight is still single-day
  // (exclusive end), so compare against a strictly-later instant.
  return occ.end.getTime() - occ.start.getTime() > 24 * 60 * 60 * 1000;
}

interface PackedPosition {
  column: number;
  columnCount: number;
  columnSpan: number;
}

/**
 * Google-style overlap packing for one day's timed segments.
 * Mutates column/columnCount/columnSpan on the segments, in place.
 * z resolution happens at render: event.zIndex verbatim, else 10 + column.
 */
function packTimedSegments<TData>(segments: EventCalendarSegment<TData>[]): void {
  if (segments.length === 0) {
    return;
  }

  interface Working {
    seg: EventCalendarSegment<TData>;
    startMin: number;
    effEnd: number;
  }

  const items: Working[] = segments
    .map((seg) => {
      const startMin = seg.startMin ?? 0;
      const endMin = seg.endMin ?? startMin;
      return {
        effEnd: Math.max(endMin, startMin + MIN_PACK_SLOT),
        seg,
        startMin,
      };
    })
    .toSorted(
      (a, b) =>
        a.startMin - b.startMin ||
        b.effEnd - b.startMin - (a.effEnd - a.startMin) ||
        a.seg.occurrence.key.localeCompare(b.seg.occurrence.key),
    );

  // Sweep into connected clusters
  const clusters: Working[][] = [];
  let current: Working[] = [];
  let clusterEnd = -Infinity;
  for (const item of items) {
    if (item.startMin >= clusterEnd) {
      current = [];
      clusters.push(current);
      clusterEnd = -Infinity;
    }
    current.push(item);
    clusterEnd = Math.max(clusterEnd, item.effEnd);
  }

  for (const cluster of clusters) {
    // Greedy column assignment
    const colEnds: number[] = [];
    const byColumn = new Map<number, Working[]>();
    for (const item of cluster) {
      let col = colEnds.findIndex((end) => end <= item.startMin);
      if (col === -1) {
        col = colEnds.length;
        colEnds.push(0);
      }
      colEnds[col] = item.effEnd;
      item.seg.column = col;
      const bucket = byColumn.get(col) ?? [];
      bucket.push(item);
      byColumn.set(col, bucket);
    }
    const columnCount = colEnds.length;

    // Partial-overlap expansion: widen rightward into free columns
    for (const item of cluster) {
      let span = 1;
      const col = item.seg.column ?? 0;
      while (col + span < columnCount) {
        const occupants = byColumn.get(col + span) ?? [];
        const blocked = occupants.some((o) => o.startMin < item.effEnd && o.effEnd > item.startMin);
        if (blocked) {
          break;
        }
        span++;
      }
      item.seg.columnCount = columnCount;
      item.seg.columnSpan = span;
    }
  }
}

/**
 * Greedy lane packing for bar segments within one week row (7 columns).
 * Mutates lane/rowIndex/colStart/colSpan on the segments, in place.
 */
/**
 * Build the laned month-row bars for one week: consecutive-day segments of
 * the same occurrence merge into ONE bar (colStart -> colSpan) stacked into
 * lanes. Returns NEW segment objects - the shared per-day segments (also
 * rendered by the all-day rows and day cells) must stay pristine: mutating
 * their isEnd/continues flags gave the first-day chip a whole-bar shape and
 * a bogus end resize handle in the week all-day row, where dragging it
 * collapsed the event to a single day.
 */
function packWeekRowLanes<TData>(
  segments: EventCalendarSegment<TData>[],
  rowIndex: number,
  rowStart: Date,
  timeZone: string,
): EventCalendarSegment<TData>[] {
  interface Bar {
    seg: EventCalendarSegment<TData>;
    colStart: number;
    colSpan: number;
    isStart: boolean;
    isEnd: boolean;
    lane: number;
  }

  const bars: Bar[] = segments.map((seg) => {
    const dayIndex = Math.round(
      (zonedStartOfDay(seg.day, timeZone).getTime() -
        zonedStartOfDay(rowStart, timeZone).getTime()) /
        (24 * 60 * 60 * 1000),
    );
    return {
      colSpan: 1,
      colStart: Math.max(0, Math.min(6, dayIndex)),
      isEnd: seg.isEnd,
      isStart: seg.isStart,
      lane: 0,
      seg,
    };
  });

  // Merge consecutive-day segments of the same occurrence into one bar per row
  const merged = new Map<string, Bar>();
  for (const bar of bars) {
    const { key } = bar.seg.occurrence;
    const existing = merged.get(key);
    if (existing) {
      const start = Math.min(existing.colStart, bar.colStart);
      const end = Math.max(existing.colStart + existing.colSpan, bar.colStart + bar.colSpan);
      existing.colStart = start;
      existing.colSpan = end - start;
      existing.isStart = existing.isStart || bar.isStart;
      existing.isEnd = existing.isEnd || bar.isEnd;
    } else {
      merged.set(key, bar);
    }
  }

  const rowBars = [...merged.values()].toSorted(
    (a, b) =>
      a.colStart - b.colStart ||
      b.colSpan - a.colSpan ||
      a.seg.occurrence.key.localeCompare(b.seg.occurrence.key),
  );

  const lanes: boolean[][] = [];
  for (const bar of rowBars) {
    let lane = 0;
    for (;;) {
      lanes[lane] ??= new Array(7).fill(false);
      const row = lanes[lane];
      let free = true;
      for (let c = bar.colStart; c < bar.colStart + bar.colSpan; c++) {
        if (row[c]) {
          free = false;
          break;
        }
      }
      if (free) {
        break;
      }
      lane++;
    }
    for (let c = bar.colStart; c < bar.colStart + bar.colSpan; c++) {
      lanes[lane][c] = true;
    }
    bar.lane = lane;
  }

  return rowBars.map((bar) => ({
    ...bar.seg,
    colSpan: bar.colSpan,
    colStart: bar.colStart,
    continuesAfter: !bar.isEnd,
    continuesBefore: !bar.isStart,
    isEnd: bar.isEnd,
    isStart: bar.isStart,
    lane: bar.lane,
    rowIndex,
  }));
}

interface EventCalendarDayBucket<TData = unknown> {
  allDay: EventCalendarSegment<TData>[];
  timed: EventCalendarSegment<TData>[];
}

interface EventCalendarWeekRow<TData = unknown> {
  rowIndex: number;
  rowStart: Date;
  /** Laned bar segments (one per occurrence per row). */
  bars: EventCalendarSegment<TData>[];
}

interface EventCalendarIndex<TData = unknown> {
  occurrences: EventCalendarOccurrence<TData>[];
  byDay: Map<string, EventCalendarDayBucket<TData>>;
  weekRows: EventCalendarWeekRow<TData>[];
}

interface BuildIndexOptions<TData> {
  timeZone: string;
  weekStartsOn: WeekStartsOn;
  eventOrder?: (a: EventCalendarOccurrence<TData>, b: EventCalendarOccurrence<TData>) => number;
  getOccurrences?: (
    event: CalendarEvent<TData>,
    range: EventCalendarDateRange,
    ctx: { timeZone: string },
  ) => { start: Date; end: Date }[] | null;
}

function defaultEventOrder(a: EventCalendarOccurrence, b: EventCalendarOccurrence): number {
  return (
    a.start.getTime() - b.start.getTime() ||
    b.end.getTime() - b.start.getTime() - (a.end.getTime() - a.start.getTime()) ||
    a.key.localeCompare(b.key)
  );
}

function buildEventIndex<TData>(
  events: CalendarEvent<TData>[],
  visibleRange: EventCalendarDateRange,
  opts: BuildIndexOptions<TData>,
): EventCalendarIndex<TData> {
  const { timeZone, weekStartsOn } = opts;
  const order = opts.eventOrder ?? defaultEventOrder;

  // RECURRENCE-ID override replacement: an event carrying recurringEventId +
  // originalStart is an edited single occurrence of that series. The parent's
  // expansion drops the replaced instant; the override renders as its own
  // occurrence through the normal path below.
  const overrideTimes = new Map<string, Set<number>>();
  for (const event of events) {
    if (!event.recurringEventId || !event.originalStart) {
      continue;
    }
    let times = overrideTimes.get(event.recurringEventId);
    if (!times) {
      overrideTimes.set(event.recurringEventId, (times = new Set()));
    }
    times.add(event.originalStart.getTime());
  }

  const occurrences: EventCalendarOccurrence<TData>[] = [];
  for (const event of events) {
    const custom = opts.getOccurrences?.(event, visibleRange, { timeZone });
    if (custom) {
      custom.forEach((occ, i) => {
        if (!rangesIntersect({ end: occ.end, start: occ.start }, visibleRange)) {
          return;
        }
        occurrences.push({
          allDay: event.allDay ?? false,
          end: occ.end,
          event,
          eventId: event.id,
          isRecurring: true,
          key: `${event.id}::${occ.start.toISOString()}`,
          recurrenceIndex: i,
          start: occ.start,
        });
      });
      continue;
    }
    const replaced = overrideTimes.get(event.id);
    const expanded = expandRecurrence(event, visibleRange, { timeZone });
    occurrences.push(
      ...(replaced ? expanded.filter((occ) => !replaced.has(occ.start.getTime())) : expanded),
    );
  }
  occurrences.sort(order);

  const byDay = new Map<string, EventCalendarDayBucket<TData>>();
  const barSegmentsByRow = new Map<number, EventCalendarSegment<TData>[]>();
  const firstRowStart = startOfWeek(toZoned(visibleRange.start, timeZone), {
    weekStartsOn,
  });

  for (const occurrence of occurrences) {
    const segments = segmentOccurrence(occurrence, visibleRange, timeZone);
    const bar = isBarOccurrence(occurrence);
    for (const seg of segments) {
      const key = getDayKey(seg.day, timeZone);
      let bucket = byDay.get(key);
      if (!bucket) {
        bucket = { allDay: [], timed: [] };
        byDay.set(key, bucket);
      }
      if (bar) {
        bucket.allDay.push(seg);
        // calendar-day math, not a fixed 168h divisor: DST transition weeks
        // are 167/169h long and the fixed divisor mis-buckets every later
        // Sunday one row early (which then clamps into the wrong column)
        const rowIndex = Math.floor(
          differenceInCalendarDays(toZoned(seg.day, timeZone), firstRowStart) / 7,
        );
        const rowBucket = barSegmentsByRow.get(rowIndex) ?? [];
        rowBucket.push(seg);
        barSegmentsByRow.set(rowIndex, rowBucket);
      } else {
        bucket.timed.push(seg);
      }
    }
  }

  for (const bucket of byDay.values()) {
    packTimedSegments(bucket.timed);
  }

  const weekRows: EventCalendarWeekRow<TData>[] = [];
  for (const [rowIndex, segs] of barSegmentsByRow) {
    const rowStart = addWeeks(firstRowStart, rowIndex);
    weekRows.push({
      bars: packWeekRowLanes(segs, rowIndex, rowStart, timeZone),
      rowIndex,
      rowStart,
    });
  }
  weekRows.sort((a, b) => a.rowIndex - b.rowIndex);

  return { byDay, occurrences, weekRows };
}

/** Cache key for index memoization; cheap string compare. */
function getRangeKey(range: EventCalendarDateRange): string {
  return `${range.start.getTime()}-${range.end.getTime()}`;
}

/** Depth-first flatten of the resource tree (parents included). */
function flattenResources(
  resources: EventCalendarResource[],
  depth = 0,
): { resource: EventCalendarResource; depth: number }[] {
  const rows: { resource: EventCalendarResource; depth: number }[] = [];
  for (const resource of resources) {
    rows.push({ depth, resource });
    if (resource.children?.length) {
      rows.push(...flattenResources(resource.children, depth + 1));
    }
  }
  return rows;
}

const DEFAULT_WEEKEND_DAYS = [0, 6];

/** Resolves whether a day is an off day (non-working) in the display zone. */
function resolveOffDay(
  day: Date,
  timeZone: string,
  config: boolean | EventCalendarOffDaysConfig | undefined,
): boolean {
  if (!config) {
    return false;
  }
  const resolved: EventCalendarOffDaysConfig = config === true ? {} : config;
  const weekendDays = resolved.weekendDays ?? DEFAULT_WEEKEND_DAYS;
  const zoned = toZoned(day, timeZone);
  if (weekendDays.includes(zoned.getDay())) {
    return true;
  }
  if (resolved.dates?.length) {
    const key = getDayKey(day, timeZone);
    if (resolved.dates.some((date) => getDayKey(date, timeZone) === key)) {
      return true;
    }
  }
  return resolved.isOffDay?.(day) ?? false;
}

export {
  buildEventIndex,
  defaultEventOrder,
  eventsOverlap,
  flattenResources,
  getDayKey,
  getDayTotalMinutes,
  getRangeKey,
  getViewDateRange,
  isBarOccurrence,
  MIN_PACK_SLOT,
  packTimedSegments,
  packWeekRowLanes,
  rangesIntersect,
  resolveOffDay,
  segmentOccurrence,
  snapMinutes,
  spansMultipleDays,
  stepDate,
  toZoned,
  zonedStartOfDay,
};
export type {
  BuildIndexOptions,
  EventCalendarDayBucket,
  EventCalendarIndex,
  EventCalendarWeekRow,
  ViewDateRanges,
  ViewRangeOptions,
  WeekStartsOn,
};
