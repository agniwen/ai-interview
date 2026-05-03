"use client";

import { useMemo } from "react";
import { useHydrated } from "@/hooks/use-hydrated";

export const DATE_TIME_DISPLAY_OPTIONS = {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "2-digit",
} satisfies Intl.DateTimeFormatOptions;

export const TIME_DISPLAY_OPTIONS = {
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
} satisfies Intl.DateTimeFormatOptions;

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
  locale = "zh-CN",
  options = DATE_TIME_DISPLAY_OPTIONS,
  as = "time",
  className,
}: {
  value: TimeValue;
  emptyText?: string;
  pendingText?: string;
  locale?: string;
  options?: Intl.DateTimeFormatOptions;
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

    return new Intl.DateTimeFormat(locale, options).format(date);
  }, [emptyText, isHydrated, locale, options, pendingText, value]);

  if (as === "span") {
    return <span className={className}>{text}</span>;
  }

  return (
    <time className={className} dateTime={dateTime}>
      {text}
    </time>
  );
}
