import { z } from "zod";
import { formatDateInAppTimeZone } from "./utils/time";

export interface CalendarDateRange {
  from: string;
  to: string;
}

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(value);
  if (!match) {
    return false;
  }
  const [, year, month, day] = match;
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    date.getUTCFullYear() === Number(year) &&
    date.getUTCMonth() === Number(month) - 1 &&
    date.getUTCDate() === Number(day)
  );
}

const calendarDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/u, "日期必须是 YYYY-MM-DD 格式。")
  .refine(isCalendarDate, "日期无效。");

export const createdAtDateQuerySchema = z
  .object({
    createdFrom: calendarDateSchema.optional(),
    createdTo: calendarDateSchema.optional(),
  })
  .refine(
    (value) => !value.createdFrom || !value.createdTo || value.createdFrom <= value.createdTo,
    {
      message: "开始日期不能晚于结束日期。",
      path: ["createdTo"],
    },
  );

export function shanghaiCalendarDayStart(value: string): Date {
  return new Date(`${value}T00:00:00+08:00`);
}

export function nextShanghaiCalendarDayStart(value: string): Date {
  return new Date(shanghaiCalendarDayStart(value).getTime() + 86_400_000);
}

function addCalendarDays(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

function customDateRange(value: string): CalendarDateRange | null {
  const match = /^custom:(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/u.exec(value);
  if (!match) {
    return null;
  }
  const [, from, to] = match;
  return isCalendarDate(from) && isCalendarDate(to) && from <= to ? { from, to } : null;
}

export function dateRangeFilterBounds(
  value: string,
  now: Date = new Date(),
): CalendarDateRange | null {
  if (value === "") {
    return null;
  }
  const today = formatDateInAppTimeZone(now, "YYYY-MM-DD");
  if (value === "today") {
    return { from: today, to: today };
  }
  if (value === "yesterday") {
    const yesterday = addCalendarDays(today, -1);
    return { from: yesterday, to: yesterday };
  }
  if (value === "last_7_days") {
    return { from: addCalendarDays(today, -6), to: today };
  }
  return customDateRange(value);
}

function formatRangeDate(date: string): string {
  return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
}

export function dateRangeFilterLabel(value: string, placeholder = "选择日期范围"): string {
  if (value === "today") {
    return "今天";
  }
  if (value === "yesterday") {
    return "昨天";
  }
  if (value === "last_7_days") {
    return "最近 7 天";
  }
  const range = customDateRange(value);
  if (!range) {
    return placeholder;
  }
  const fromYear = range.from.slice(2, 4);
  const toYear = range.from.slice(0, 4) === range.to.slice(0, 4) ? "" : `${range.to.slice(2, 4)}年`;
  return `${fromYear}年${formatRangeDate(range.from)}-${toYear}${formatRangeDate(range.to)}`;
}
