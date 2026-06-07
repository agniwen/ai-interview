// 把 Drizzle 返回的 Date 列序列化为 ISO 字符串供前端使用；
// 支持可空字段（如 scheduledAt）以保持 null 语义。
// Serialize a Drizzle Date column to an ISO string for the wire DTO;
// the nullable overload preserves null semantics for optional timestamps.
export function serializeDate(value: Date | string): string;
export function serializeDate(value: Date | string | null): string | null;
export function serializeDate(value: Date | string | null): string | null {
  if (value === null) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : value;
}
