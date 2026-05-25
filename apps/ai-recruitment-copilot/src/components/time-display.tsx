"use client";

import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";
import { useMemo } from "react";
import { useHydrated } from "@/hooks/use-hydrated";

// 中文：统一锁到东八区（北京时间）展示，不随用户浏览器时区漂移。
// English: pin all timestamp rendering to UTC+8 (Beijing time) instead of
// drifting with whatever the user's browser locale says.
dayjs.extend(utc);
const CN_OFFSET_MINUTES = 8 * 60;

// 表格内创建/更新时间统一展示为 `YY/MM/DD HH:mm`。
// 改用 dayjs format 字符串而不是 Intl.DateTimeFormatOptions——格式更直观、
// 避免不同 locale 下日期分隔符 / 排序漂移；全应用统一一个格式。
// Tables render created/updated timestamps as `YY/MM/DD HH:mm`. Uses dayjs
// format strings instead of Intl.DateTimeFormatOptions for one stable format
// across locales (no separator / order drift).
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

    return dayjs(date).utcOffset(CN_OFFSET_MINUTES).format(options);
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
