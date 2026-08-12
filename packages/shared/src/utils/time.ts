/**
 * 日期与时间工具。
 * Date / time helpers.
 *
 * 日期格式化基于 dayjs（全应用统一 `YY/MM/DD HH:mm`）；相对时间仍走原生 Intl
 * 以保持 zh-CN 下"3 分钟前 / 昨天"等本地化文案。
 * Date formatting goes through dayjs (unified `YY/MM/DD HH:mm` across the
 * app); relative time still uses Intl.RelativeTimeFormat for the localized
 * "3 minutes ago" phrasing.
 */

import dayjs from "dayjs";
import timezone from "dayjs/plugin/timezone.js";
import utc from "dayjs/plugin/utc.js";

dayjs.extend(utc);
dayjs.extend(timezone);

/**
 * 产品默认展示时区（东八区）。
 * Product display timezone (UTC+8).
 */
export const APP_TIME_ZONE = "Asia/Shanghai";

/**
 * 默认 `formatDate` 格式：`YY/MM/DD HH:mm`。
 * Default `formatDate` pattern.
 */
export const DEFAULT_DATE_TIME_FORMAT = "YY/MM/DD HH:mm";

/**
 * 仅日期默认格式：`YY/MM/DD`。
 * Default date-only pattern.
 */
export const DEFAULT_DATE_FORMAT = "YY/MM/DD";

/** Auto-generated meeting titles embed `YYMMDDHHmm` after this prefix. */
export const DEFAULT_MEETING_TITLE_PREFIX = "录制记录-";

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
 * 友好格式化日期：默认 `YY/MM/DD HH:mm`（浏览器本地时区）。
 * Format a date in a friendly way; defaults to `YY/MM/DD HH:mm` (runtime local tz).
 */
export function formatDate(
  value: string | number | Date | null | undefined,
  format: string = DEFAULT_DATE_TIME_FORMAT,
): string {
  const date = toDate(value);
  if (!date) {
    return "—";
  }
  return dayjs(date).format(format);
}

/**
 * 按产品时区（Asia/Shanghai）格式化。
 * Format in the product timezone (Asia/Shanghai).
 */
export function formatDateInAppTimeZone(
  value: string | number | Date | null | undefined,
  format: string = DEFAULT_DATE_TIME_FORMAT,
): string {
  const date = toDate(value);
  if (!date) {
    return "—";
  }
  return dayjs(date).tz(APP_TIME_ZONE).format(format);
}

/**
 * 仅日期（无时间）：默认 `YY/MM/DD`。
 * Date-only formatting; defaults to `YY/MM/DD`.
 */
export function formatDateOnly(value: string | number | Date | null | undefined): string {
  return formatDate(value, DEFAULT_DATE_FORMAT);
}

/**
 * 默认会议标题：`录制记录-YYMMDDHHmm`（东八区）。
 * Default meeting title stamp in Asia/Shanghai.
 */
export function formatDefaultMeetingTitle(
  startedAt: string | number | Date | null | undefined,
): string {
  const stamp = formatDateInAppTimeZone(startedAt, "YYMMDDHHmm");
  if (stamp === "—") {
    return `${DEFAULT_MEETING_TITLE_PREFIX}未知时间`;
  }
  return `${DEFAULT_MEETING_TITLE_PREFIX}${stamp}`;
}

/**
 * 会议展示标题：移除自动附加的 `-YYMMDDHHmm` 后缀。
 * Meeting display title: remove the automatically appended `-YYMMDDHHmm` suffix.
 */
export function meetingDisplayTitle(title: string): string {
  return title.replace(/-\d{10}$/, "");
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
