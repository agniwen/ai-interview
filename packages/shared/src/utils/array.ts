/**
 * 数组操作工具集。所有函数均为纯函数，不修改输入。
 * Array helpers. All functions are pure—inputs are never mutated.
 */

import type { JsonValue } from "@arc/db-schema/json";
import { isPresent } from "./guards";
import { chunk as lodashChunk, partition as lodashPartition, uniq, uniqBy } from "lodash-es";

type StringArrayCandidate = JsonValue | undefined | (JsonValue | undefined)[];

function isNonEmptyString(value: StringArrayCandidate): value is string {
  return typeof value === "string" && value.length > 0;
}

/**
 * 把任意值规范为数组：
 *   - 已是数组 → 原样返回；
 *   - null / undefined → 返回空数组；
 *   - 单值 → 包成单元素数组。
 *
 * Normalize a value into an array:
 *   - already an array → returned as-is;
 *   - null / undefined → empty array;
 *   - single value → wrapped in a one-element array.
 */
export function ensureArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

/**
 * 把 `unknown` 安全地转换为 string[]：仅保留非空字符串元素。
 * Safely coerce `unknown` to string[], keeping only non-empty string entries.
 */
export function ensureStringArray(value: StringArrayCandidate): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const candidates: StringArrayCandidate[] = value;
  return candidates.filter(isNonEmptyString);
}

/**
 * 数组去重，保留首次出现的顺序。等价比较使用 `===`。
 * Returns a new array with duplicates removed, preserving first-seen order (`===` equality).
 */
export function unique<T>(items: readonly T[]): T[] {
  return uniq(items);
}

/**
 * 通过自定义 key 函数对数组去重。
 * Deduplicate by a custom key extractor.
 */
export function uniqueBy<T, K>(items: readonly T[], keyFn: (item: T) => K): T[] {
  return uniqBy(items, keyFn);
}

/**
 * 把数组按指定大小分片。`size <= 0` 时返回空数组。
 * Chunk an array into pieces of `size`. Returns empty when `size <= 0`.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  return lodashChunk(items, size);
}

/**
 * 把数组按谓词拆分为 `[matched, rest]` 两组。
 * Split an array into `[matched, rest]` based on a predicate.
 */
export function partition<T>(
  items: readonly T[],
  predicate: (item: T, index: number) => boolean,
): [T[], T[]] {
  const [matched, rest] = lodashPartition(
    items.map((item, index) => ({ index, item })),
    ({ index, item }) => predicate(item, index),
  );
  return [matched.map(({ item }) => item), rest.map(({ item }) => item)];
}

/**
 * 过滤掉数组中的 null / undefined，并在类型层面收紧。
 * Filter out null / undefined entries, narrowing the element type accordingly.
 */
export function compact<T>(items: readonly (T | null | undefined)[]): T[] {
  return items.filter(isPresent);
}
