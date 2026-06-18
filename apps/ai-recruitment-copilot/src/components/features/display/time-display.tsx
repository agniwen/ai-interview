"use client";

import dayjs from "dayjs";
import { CalendarIcon } from "@/components/icons/hugeicons";
import { useMemo } from "react";
import { useHydrated } from "@/hooks/use-hydrated";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

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

const TOOLTIP_TIME_ZONES = [
  { label: "中国时区", timeZone: "Asia/Shanghai" },
  { label: "英国时区", timeZone: "Europe/London" },
  { label: "日韩时区", timeZone: "Asia/Tokyo" },
  { label: "美国时区（纽约）", timeZone: "America/New_York" },
] as const;

const TOOLTIP_TIME_FORMATTER_OPTIONS = {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "2-digit",
  year: "numeric",
} satisfies Intl.DateTimeFormatOptions;

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

function formatTimeInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    ...TOOLTIP_TIME_FORMATTER_OPTIONS,
    timeZone,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year?.slice(-2)}/${values.month}/${values.day} ${values.hour}:${values.minute}`;
}

export function formatTimeDisplayTooltipRows(value: TimeValue) {
  const date = normalizeDate(value);
  if (!date) {
    return [];
  }

  return TOOLTIP_TIME_ZONES.map((zone) => ({
    label: zone.label,
    text: formatTimeInTimeZone(date, zone.timeZone),
  }));
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
  const tooltipRows = useMemo(
    () => (isHydrated ? formatTimeDisplayTooltipRows(value) : []),
    [isHydrated, value],
  );
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

  const content = (
    <span className={className}>
      <span className="inline-flex items-center gap-1 whitespace-nowrap align-baseline">
        <CalendarIcon aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        {as === "span" ? (
          <span className="whitespace-nowrap">{text}</span>
        ) : (
          <time className="whitespace-nowrap" dateTime={dateTime}>
            {text}
          </time>
        )}
      </span>
    </span>
  );

  if (tooltipRows.length === 0) {
    return content;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{content}</TooltipTrigger>
      <TooltipContent className="min-w-48 px-3 py-2" side="top">
        <div className="grid gap-1">
          {tooltipRows.map((row) => (
            <div className="grid grid-cols-[auto_1fr] gap-3" key={row.label}>
              <span className="text-background/70">{row.label}</span>
              <span className="text-right tabular-nums">{row.text}</span>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
