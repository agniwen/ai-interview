/**
 * 对象操作工具集。所有函数均为纯函数。
 * Object helpers. All functions are pure.
 */

import { hasOwn } from "./guards";

/**
 * 从对象中挑选指定的若干键。
 * Pick the listed keys from an object.
 */
export function pick<T extends object, K extends keyof T>(
  source: T,
  keys: readonly K[],
): Pick<T, K> {
  const result = {} as Pick<T, K>;
  for (const key of keys) {
    if (hasOwn(source, key)) {
      result[key] = source[key];
    }
  }
  return result;
}

/**
 * 从对象中剔除指定的若干键。
 * Omit the listed keys from an object.
 */
export function omit<T extends object, K extends keyof T>(
  source: T,
  keys: readonly K[],
): Omit<T, K> {
  const banned = new Set<PropertyKey>(keys);
  const result = {} as Omit<T, K>;
  for (const key of Object.keys(source) as (keyof T)[]) {
    if (!banned.has(key)) {
      (result as Record<string, unknown>)[key as string] = source[key];
    }
  }
  return result;
}

/**
 * 浅 merge 多个对象，后者覆盖前者。`undefined` 不会覆盖已有值。
 * Shallow-merge objects; later wins, but `undefined` does not overwrite.
 */
export function mergeDefined<T extends object>(...sources: Partial<T>[]): T {
  const result = {} as T;
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined) {
        (result as Record<string, unknown>)[key] = value;
      }
    }
  }
  return result;
}
