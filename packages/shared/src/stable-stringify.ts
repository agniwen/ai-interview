// 与候选人作答 schema 共用的稳定 stringify。键序排序后输出，保证内容相同
// 但键序不同的对象哈希一致。
// Stable stringify shared with the answer schema. Sorts object keys so two
// objects with the same content but different key order hash identically.
import { z } from "zod";

export const jsonValueSchema = z.json();

export type JsonValue =
  | boolean
  | null
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };

export function stableStringify(value: JsonValue): string {
  if (value === null || !(value instanceof Object)) {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(",")}]`;
  }
  const entries = Object.entries(value).toSorted(([a], [b]) => {
    if (a < b) {
      return -1;
    }
    return a > b ? 1 : 0;
  });
  return `{${entries
    .map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`)
    .join(",")}}`;
}
