"use client";

import dayjs from "dayjs";
import { useMemo } from "react";
import { useHydrated } from "@/hooks/use-hydrated";

// 表格内创建/更新时间统一展示为 `YY/MM/DD HH:mm`。
// 改用 dayjs format 字符串而不是 Intl.DateTimeFormatOptions——格式更直观、
// 避免不同 locale 下日期分隔符 / 排序漂移；hydration 后按浏览器当前时区展示。
// Tables render created/updated timestamps as `YY/MM/DD HH:mm`. Uses dayjs
// format strings instead of Intl.DateTimeFormatOptions for one stable format
// across locales (no separator / order drift), in the browser's current
// timezone after hydration.
export const DATE_TIME_DISPLAY_OPTIONS = "YY/MM/DD HH:mm";

export const TIME_DISPLAY_OPTIONS = "HH:mm";

type TimeValue = string | number | Date | null | undefined;

function normalizeDate(value: TimeValue) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getDateTimeAttribute(value: TimeValue) {
  const date = normalizeDate(value);
  return date ? date.toISOString() : undefined;
}

export function formatTimeDisplayText(
  value: TimeValue,
  options: string = DATE_TIME_DISPLAY_OPTIONS,
) {
  const date = normalizeDate(value);
  return date ? dayjs(date).format(options) : null;
}

export function TimeDisplay({
  value,
  emptyText = "待定",
  pendingText = "--",
  options = DATE_TIME_DISPLAY_OPTIONS,
  as = "time",
  className,
}: {
  value: TimeValue;
  emptyText?: string;
  pendingText?: string;
  /** dayjs 格式字符串，默认 `YY/MM/DD HH:mm`。 dayjs format string. */
  options?: string;
  as?: "span" | "time";
  className?: string;
}) {
  const isHydrated = useHydrated();
  const dateTime = useMemo(() => getDateTimeAttribute(value), [value]);
  const text = useMemo(() => {
    const date = normalizeDate(value);

    if (!date) {
      return emptyText;
    }

    if (!isHydrated) {
      return pendingText;
    }

    return formatTimeDisplayText(date, options) ?? emptyText;
  }, [emptyText, isHydrated, options, pendingText, value]);

  if (as === "span") {
    return <span className={className}>{text}</span>;
  }

  return (
    <time className={className} dateTime={dateTime}>
      {text}
    </time>
  );
}
