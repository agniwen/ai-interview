"use client";

import { useHydrated } from "@/hooks/use-hydrated";

type DateTimeValue = Date | string | null | undefined;
type LocalDateTimeFormat = "compact-zh" | "default" | "long-zh";

const FORMATTERS = {
  "compact-zh": new Intl.DateTimeFormat("zh-CN", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
  }),
  default: new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    year: "numeric",
  }),
  "long-zh": new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "long",
    timeStyle: "short",
  }),
} satisfies Record<LocalDateTimeFormat, Intl.DateTimeFormat>;

function normalizeDate(value: DateTimeValue) {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value : new Date(value);
}

export function LocalDateTimeText({
  fallback = "—",
  format = "default",
  value,
}: {
  fallback?: string;
  format?: LocalDateTimeFormat;
  value: DateTimeValue;
}) {
  const isHydrated = useHydrated();
  const date = normalizeDate(value);

  if (!(isHydrated && date) || Number.isNaN(date.getTime())) {
    return <span>{fallback}</span>;
  }

  return <span>{FORMATTERS[format].format(date)}</span>;
}
