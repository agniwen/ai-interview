import { IconCalendar } from "@tabler/icons-react";

import { cn } from "@app/shared/utils";
import { DEFAULT_DATE_TIME_FORMAT, formatDateInAppTimeZone, toDate } from "@app/shared/utils/time";

// 表格内创建/更新时间统一展示为 `YY/MM/DD HH:mm`，固定东八区。
// Tables render created/updated timestamps as `YY/MM/DD HH:mm` in Asia/Shanghai.
export const DATE_TIME_DISPLAY_OPTIONS = DEFAULT_DATE_TIME_FORMAT;

type TimeValue = string | number | Date | null | undefined;

export function formatTimeDisplayText(
  value: TimeValue,
  options: string = DATE_TIME_DISPLAY_OPTIONS,
) {
  const date = toDate(value);
  return date ? formatDateInAppTimeZone(date, options) : null;
}

export function TimeDisplay({
  value,
  emptyText = "待定",
  options = DATE_TIME_DISPLAY_OPTIONS,
  as = "time",
  className,
}: {
  value: TimeValue;
  emptyText?: string;
  /** dayjs 格式字符串，默认 `YY/MM/DD HH:mm`。 dayjs format string. */
  options?: string;
  as?: "span" | "time";
  className?: string;
}) {
  const date = toDate(value);
  const dateTime = date?.toISOString();
  const text = date ? (formatTimeDisplayText(date, options) ?? emptyText) : emptyText;

  return (
    <span className={cn(!date && "opacity-60", className)}>
      <span className="inline-flex items-baseline gap-1 whitespace-nowrap align-baseline">
        <IconCalendar
          aria-hidden="true"
          className="size-[1em] shrink-0 self-center text-muted-foreground"
        />
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
}
