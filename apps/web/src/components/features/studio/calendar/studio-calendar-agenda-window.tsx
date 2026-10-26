import { addDays, format, startOfDay } from "date-fns";
import type { EventCalendarDateRange } from "@/components/reui/event-calendar/event-calendar-types";

// 面试管理的列表模式是固定窗口：过去两周、今天、未来两周。
// The interview list shows a fixed window: 14 days back, today and 14 days ahead.
export const AGENDA_DAYS_AROUND_TODAY = 14;
export const AGENDA_DAY_COUNT = AGENDA_DAYS_AROUND_TODAY * 2 + 1;

export function agendaWindowRange(now: Date = new Date()): EventCalendarDateRange {
  const start = startOfDay(addDays(now, -AGENDA_DAYS_AROUND_TODAY));
  return {
    end: addDays(start, AGENDA_DAY_COUNT),
    start,
  };
}

/** 列表窗口写成具体日期，相对说明弱化显示。 */
export function AgendaWindowLabel() {
  const { start } = agendaWindowRange();
  const last = addDays(start, AGENDA_DAY_COUNT - 1);
  return (
    <span className="font-medium text-sm tabular-nums">
      {format(start, "M月d日")} – {format(last, "M月d日")}
      <span className="ms-2 font-normal text-muted-foreground">
        今天前后 {AGENDA_DAYS_AROUND_TODAY} 天
      </span>
    </span>
  );
}
