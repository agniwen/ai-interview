/**
 * 数字与文本格式化工具。
 * Number / text formatting helpers.
 *
 * 这里的函数应保持"无 I/O、无副作用"，输入决定输出。
 * Functions here should remain side-effect-free—output is purely a function of input.
 */

/**
 * 将值格式化为字符串展示；为 null / undefined / 空串时返回占位符。
 * Format a value for display, falling back to a placeholder for null / undefined / empty string.
 *
 * @param value 待格式化的值 / The value to format.
 * @param fallback 占位符，默认 "未发现信息" / Placeholder, defaults to "未发现信息".
 */
export function formatDisplayValue(
  value: string | number | null | undefined,
  fallback = "未发现信息",
): string {
  if (value === null || value === undefined) {
    return fallback;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : fallback;
  }
  return String(value);
}

/**
 * 截断长字符串并追加省略号。
 * Truncate a string and append an ellipsis.
 */
export function truncate(input: string, max: number, suffix = "..."): string {
  if (input.length <= max) {
    return input;
  }
  if (max <= suffix.length) {
    return input.slice(0, max);
  }
  return input.slice(0, max - suffix.length) + suffix;
}

/**
 * 千分位格式化数字。
 * Format a number with grouped thousands.
 */
export function formatNumber(value: number, locale = "zh-CN"): string {
  return new Intl.NumberFormat(locale).format(value);
}

/**
 * 格式化字节大小为可读字符串（KB / MB / GB）。
 * Format a byte size to a human-readable string (KB / MB / GB).
 */
export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) {
    return "—";
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  const units = ["KB", "MB", "GB", "TB"];
  let size = bytes / 1024;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(fractionDigits)} ${units[unitIndex]}`;
}

/**
 * 两位数补零。
 * Two-digit zero-padding.
 */
function padTwo(value: number): string {
  return value.toString().padStart(2, "0");
}

/**
 * 把秒数格式化为 `mm:ss` / `hh:mm:ss`。
 * Format a number of seconds as `mm:ss` (or `hh:mm:ss` when applicable).
 */
export function formatElapsedSeconds(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return hours > 0
    ? `${padTwo(hours)}:${padTwo(minutes)}:${padTwo(seconds)}`
    : `${padTwo(minutes)}:${padTwo(seconds)}`;
}

/**
 * 0..1 范围的小数转百分比文案。
 * Format a 0..1 ratio as a percentage string.
 */
export function formatPercent(ratio: number, fractionDigits = 0): string {
  if (!Number.isFinite(ratio)) {
    return "—";
  }
  return `${(ratio * 100).toFixed(fractionDigits)}%`;
}
