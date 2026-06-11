/**
 * 对象操作工具集。所有函数均为纯函数。
 * Object helpers. All functions are pure.
 */

import { omit as lodashOmit, pick as lodashPick } from "lodash-es";

/**
 * 从对象中挑选指定的若干键。
 * Pick the listed keys from an object.
 */
export function pick<T extends object, K extends keyof T>(
  source: T,
  keys: readonly K[],
): Pick<T, K> {
  return lodashPick(
    source,
    keys.filter((key) => Object.hasOwn(source, key)),
  ) as Pick<T, K>;
}

/**
 * 从对象中剔除指定的若干键。
 * Omit the listed keys from an object.
 */
export function omit<T extends object, K extends keyof T>(
  source: T,
  keys: readonly K[],
): Omit<T, K> {
  return lodashOmit(lodashPick(source, Object.keys(source)), keys) as Omit<T, K>;
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
