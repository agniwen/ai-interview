/**
 * 数组操作工具集。所有函数均为纯函数，不修改输入。
 * Array helpers. All functions are pure—inputs are never mutated.
 */

import { isPresent } from "./guards";

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
export function ensureStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === "string" && item.length > 0);
}

/**
 * 数组去重，保留首次出现的顺序。等价比较使用 `===`。
 * Returns a new array with duplicates removed, preserving first-seen order (`===` equality).
 */
export function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/**
 * 通过自定义 key 函数对数组去重。
 * Deduplicate by a custom key extractor.
 */
export function uniqueBy<T, K>(items: readonly T[], keyFn: (item: T) => K): T[] {
  const seen = new Set<K>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

/**
 * 把数组按指定大小分片。`size <= 0` 时返回空数组。
 * Chunk an array into pieces of `size`. Returns empty when `size <= 0`.
 */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (size <= 0) {
    return [];
  }
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

/**
 * 把数组按谓词拆分为 `[matched, rest]` 两组。
 * Split an array into `[matched, rest]` based on a predicate.
 */
export function partition<T>(
  items: readonly T[],
  predicate: (item: T, index: number) => boolean,
): [T[], T[]] {
  const matched: T[] = [];
  const rest: T[] = [];
  for (const [index, item] of items.entries()) {
    if (predicate(item, index)) {
      matched.push(item);
    } else {
      rest.push(item);
    }
  }
  return [matched, rest];
}

/**
 * 过滤掉数组中的 null / undefined，并在类型层面收紧。
 * Filter out null / undefined entries, narrowing the element type accordingly.
 */
export function compact<T>(items: readonly (T | null | undefined)[]): T[] {
  return items.filter(isPresent);
}
