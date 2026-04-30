/**
 * 类型守卫与原始类型判断工具。
 * Type guards and primitive checks.
 *
 * 这些守卫用于在运行时安全地缩小 `unknown` / 联合类型，并让 TS 推导出更精确的类型。
 * Use these to safely narrow `unknown` / union types at runtime so TS can refine them.
 */

/**
 * 是否为字符串。
 * Whether a value is a string.
 */
export function isString(value: unknown): value is string {
  return typeof value === "string";
}

/**
 * 是否为非空字符串（trim 之后仍有内容）。
 * Whether a value is a non-empty string after trimming.
 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * 是否为有限数字（排除 NaN / Infinity）。
 * Whether a value is a finite number (excluding NaN / Infinity).
 */
export function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * 是否为布尔值。
 * Whether a value is a boolean.
 */
export function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

/**
 * 是否为数组。同 Array.isArray 的别名，用于与其他 guards 在调用风格上保持一致。
 * Whether a value is an array. Alias of Array.isArray for stylistic consistency.
 */
export function isArray<T = unknown>(value: unknown): value is T[] {
  return Array.isArray(value);
}

/**
 * 是否为非空数组。
 * Whether a value is a non-empty array.
 */
export function isNonEmptyArray<T = unknown>(value: unknown): value is [T, ...T[]] {
  return Array.isArray(value) && value.length > 0;
}

/**
 * 是否为普通对象（plain object）。`null`、数组与类实例均会返回 `false`。
 * Whether a value is a plain object (rejects null, arrays, class instances).
 */
export function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object") {
    return false;
  }
  const proto = Object.getPrototypeOf(value) as unknown;
  return proto === Object.prototype || proto === null;
}

/**
 * 是否拥有自身属性 key（绕过 prototype 查找的安全 hasOwn）。
 * Safe `hasOwn` check that ignores prototype chain.
 */
export function hasOwn<K extends PropertyKey>(
  object: object,
  key: K,
): object is Record<K, unknown> {
  return Object.hasOwn(object, key);
}

/**
 * 是否为 null 或 undefined。
 * Whether a value is null or undefined.
 */
export function isNil(value: unknown): value is null | undefined {
  return value === null || value === undefined;
}

/**
 * 是否既非 null 也非 undefined（用于 `.filter` 缩窄数组类型）。
 * Whether a value is neither null nor undefined—useful as `.filter` predicate.
 */
export function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}
