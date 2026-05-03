/**
 * 通用 TypeScript 类型工具集合。
 * Common TypeScript type utilities shared across the app.
 *
 * 仅包含与具体业务无关的纯类型工具；业务领域类型请放到对应模块。
 * Only domain-agnostic helpers live here; domain types belong with their feature modules.
 */

/**
 * 表示某个值可能为 null。
 * Represents a value that may be null.
 */
export type Nullable<T> = T | null;

/**
 * 表示某个值可能为 null 或 undefined（即"可缺省"）。
 * Represents a value that may be null or undefined (i.e. potentially missing).
 */
export type Maybe<T> = T | null | undefined;

/**
 * 强制 T 中指定的 K 字段变为必填。
 * Make specified keys K of T required while leaving others as-is.
 */
export type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

/**
 * 取对象 T 的全部值类型的并集。
 * Union of all value types contained in object T.
 */
export type ValueOf<T> = T[keyof T];

/**
 * 把 T 的所有字段都变为可选 + 深层递归。
 * Recursively make all fields of T optional.
 */
export type DeepPartial<T> = T extends (...args: unknown[]) => unknown
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

/**
 * Promise 的解包工具：从 `Promise<T>` 中提取 `T`。
 * Unwraps the resolved value type of a Promise.
 */
export type Awaited<T> = T extends Promise<infer R> ? R : T;

/**
 * 异步操作的结果包装：成功 / 失败的判别联合。
 * Discriminated union representing the outcome of an async operation.
 */
export type AsyncResult<T, E = Error> = { ok: true; data: T } | { ok: false; error: E };

/**
 * 严格的对象字面量约束（避免被 widen 成 `Record<string, unknown>`）。
 * A strict literal object constraint to prevent widening.
 */
export type Dict<T = unknown> = Readonly<Record<string, T>>;

/**
 * 以字符串字面量类型作为枚举键的键值对。
 * A key/value record keyed by a string literal union.
 */
export type RecordOf<K extends string, V> = Record<K, V>;

/**
 * 返回函数 F 的参数元组。
 * Tuple of parameters of function F.
 */
export type ParamsOf<F> = F extends (...args: infer P) => unknown ? P : never;

/**
 * 返回函数 F 的返回类型。
 * Return type of function F.
 */
export type ReturnOf<F> = F extends (...args: unknown[]) => infer R ? R : never;
