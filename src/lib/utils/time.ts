/**
 * 日期与时间工具。
 * Date / time helpers.
 *
 * 全部基于浏览器原生 Intl，无三方 moment / dayjs 依赖。
 * Built on the native Intl APIs—no moment / dayjs runtime dependency.
 */

/**
 * 默认 `formatDate` 选项：`YYYY-MM-DD HH:mm`。
 * Default options for `formatDate`: `YYYY-MM-DD HH:mm`.
 */
const DEFAULT_DATE_TIME_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  hour: "2-digit",
  hour12: false,
  minute: "2-digit",
  month: "2-digit",
  year: "numeric",
};

/**
 * 仅日期的默认选项。
 * Default options for date-only formatting.
 */
const DEFAULT_DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
};

/**
 * `formatRelativeTime` 内部使用的时间单位阈值。
 * Threshold table used by `formatRelativeTime`.
 */
const RELATIVE_TIME_THRESHOLDS: { unit: Intl.RelativeTimeFormatUnit; seconds: number }[] = [
  { seconds: 60, unit: "second" },
  { seconds: 3600, unit: "minute" },
  { seconds: 86_400, unit: "hour" },
  { seconds: 2_592_000, unit: "day" },
  { seconds: 31_536_000, unit: "month" },
  { seconds: Number.POSITIVE_INFINITY, unit: "year" },
];

/**
 * 将时间值规范为 Date；解析失败返回 null。
 * Normalize a value into a Date; returns null when parsing fails.
 */
export function toDate(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * 友好格式化日期：默认 `2026-04-27 15:30`。
 * Format a date in a friendly way; defaults to `2026-04-27 15:30`.
 */
export function formatDate(
  value: string | number | Date | null | undefined,
  options: Intl.DateTimeFormatOptions = DEFAULT_DATE_TIME_OPTIONS,
  locale = "zh-CN",
): string {
  const date = toDate(value);
  if (!date) {
    return "—";
  }
  return new Intl.DateTimeFormat(locale, options).format(date);
}

/**
 * 仅日期（无时间）：默认 `2026-04-27`。
 * Date-only formatting; defaults to `2026-04-27`.
 */
export function formatDateOnly(
  value: string | number | Date | null | undefined,
  locale = "zh-CN",
): string {
  return formatDate(value, DEFAULT_DATE_OPTIONS, locale);
}

/**
 * 相对时间（"3 分钟前"）。基于 Intl.RelativeTimeFormat。
 * Relative time formatting ("3 minutes ago"). Uses Intl.RelativeTimeFormat.
 */
export function formatRelativeTime(
  value: string | number | Date | null | undefined,
  reference: Date = new Date(),
  locale = "zh-CN",
): string {
  const date = toDate(value);
  if (!date) {
    return "—";
  }
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  const deltaSeconds = Math.round((date.getTime() - reference.getTime()) / 1000);
  const absSeconds = Math.abs(deltaSeconds);

  // Pick the largest unit whose threshold the diff fits into.
  // 选择能覆盖该差值的最大时间单位（秒 → 分 → 时 → 天 → 月 → 年）。
  for (let index = 0; index < RELATIVE_TIME_THRESHOLDS.length; index += 1) {
    const { unit, seconds } = RELATIVE_TIME_THRESHOLDS[index];
    if (absSeconds < seconds) {
      const divisor = index === 0 ? 1 : RELATIVE_TIME_THRESHOLDS[index - 1].seconds;
      return formatter.format(Math.round(deltaSeconds / divisor), unit);
    }
  }
  return formatter.format(0, "second");
}

/**
 * 计算两个时间点之间的秒数（end - start）。任意一方非法时返回 0。
 * Compute seconds between two timestamps (end - start). Returns 0 on invalid input.
 */
export function diffSeconds(
  start: string | number | Date | null | undefined,
  end: string | number | Date | null | undefined,
): number {
  const startDate = toDate(start);
  const endDate = toDate(end);
  if (!startDate || !endDate) {
    return 0;
  }
  return Math.round((endDate.getTime() - startDate.getTime()) / 1000);
}
