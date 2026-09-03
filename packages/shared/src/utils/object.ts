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
  // SAFETY: lodashPick receives only own keys from `source`, preserving the Pick<T, K> contract.
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
  // SAFETY: lodashOmit removes only keys declared in K from a shallow copy of source.
  return lodashOmit(lodashPick(source, Object.keys(source)), keys) as Omit<T, K>;
}

/**
 * 浅 merge 多个对象，后者覆盖前者。`undefined` 不会覆盖已有值。
 * Shallow-merge objects; later wins, but `undefined` does not overwrite.
 */
export function mergeDefined<T extends object>(...sources: Partial<T>[]): T {
  const result: Partial<T> = {};
  for (const source of sources) {
    for (const [key, value] of Object.entries(source)) {
      if (value !== undefined) {
        Reflect.set(result, key, value);
      }
    }
  }
  // SAFETY: Callers provide enough partials to construct T; this helper only omits undefined overwrites.
  return result as T;
}
