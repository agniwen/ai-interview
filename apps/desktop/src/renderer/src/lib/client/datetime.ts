import dayjs from "dayjs";
import "dayjs/locale/zh-cn";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale("zh-cn");

/** Desktop UI 统一按东八区展示。 */
export const APP_TIME_ZONE = "Asia/Shanghai";

/** 默认日期时间：`2026/08/10 23:15` */
export const APP_DATE_TIME_FORMAT = "YYYY/MM/DD HH:mm";

/** 仅日期：`2026/08/10` */
export const APP_DATE_FORMAT = "YYYY/MM/DD";

/** 紧凑日期时间（inbox 等）：`8/10 23:15` */
export const APP_DATE_TIME_SHORT_FORMAT = "M/D HH:mm";

type DateInput = string | number | Date | null | undefined;

/**
 * Parse an instant and project it into Asia/Shanghai for display.
 * 将时刻解析后投影到东八区，供 UI 展示。
 */
export function appDayjs(value: DateInput) {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = dayjs(value);
  if (!parsed.isValid()) {
    return null;
  }
  return parsed.tz(APP_TIME_ZONE);
}

export function formatAppDateTime(
  value: DateInput,
  format: string = APP_DATE_TIME_FORMAT,
  empty = "—",
): string {
  const date = appDayjs(value);
  return date ? date.format(format) : empty;
}

export function formatAppDate(value: DateInput, empty = "—"): string {
  return formatAppDateTime(value, APP_DATE_FORMAT, empty);
}

export function formatAppDateTimeShort(value: DateInput, empty = "—"): string {
  return formatAppDateTime(value, APP_DATE_TIME_SHORT_FORMAT, empty);
}

export { dayjs };
