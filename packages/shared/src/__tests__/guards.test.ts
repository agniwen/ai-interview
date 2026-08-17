// 类型守卫真值表测试 / Truth-table tests for type guards.

import { describe, expect, it } from "vitest";
import {
  hasOwn,
  isArray,
  isBoolean,
  isNil,
  isNonEmptyArray,
  isNonEmptyString,
  isNumber,
  isPlainObject,
  isPresent,
  isString,
} from "@arc/shared/utils/guards";

describe("isString", () => {
  it.each([
    ["", true],
    ["abc", true],
    [123, false],
    [null, false],
    [undefined, false],
    [{}, false],
  ])("isString(%p) → %p", (value, expected) => {
    expect(isString(value)).toBe(expected);
  });
});

describe("isNonEmptyString", () => {
  it.each([
    ["abc", true],
    [" a ", true],
    ["", false],
    ["   ", false],
    ["\n\t", false],
    [0, false],
    [null, false],
  ])("isNonEmptyString(%p) → %p", (value, expected) => {
    expect(isNonEmptyString(value)).toBe(expected);
  });
});

describe("isNumber", () => {
  it("accepts finite numbers including 0 and negatives", () => {
    expect(isNumber(0)).toBe(true);
    expect(isNumber(-1.5)).toBe(true);
    expect(isNumber(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it("rejects NaN and Infinity", () => {
    expect(isNumber(Number.NaN)).toBe(false);
    expect(isNumber(Number.POSITIVE_INFINITY)).toBe(false);
    expect(isNumber(Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it("rejects numeric strings", () => {
    expect(isNumber("1")).toBe(false);
  });
});

describe("isBoolean", () => {
  it.each([
    [true, true],
    [false, true],
    [0, false],
    [1, false],
    ["true", false],
    [null, false],
  ])("isBoolean(%p) → %p", (value, expected) => {
    expect(isBoolean(value)).toBe(expected);
  });
});

describe("isArray", () => {
  it("accepts arrays including empty", () => {
    expect(isArray([])).toBe(true);
    expect(isArray([1, 2])).toBe(true);
  });

  it("rejects array-likes and other types", () => {
    expect(isArray({ length: 0 })).toBe(false);
    expect(isArray("abc")).toBe(false);
    expect(isArray(null)).toBe(false);
  });
});

describe("isNonEmptyArray", () => {
  it("accepts arrays with at least one element", () => {
    expect(isNonEmptyArray([1])).toBe(true);
    expect(isNonEmptyArray([undefined])).toBe(true);
  });

  it("rejects empty array and non-arrays", () => {
    expect(isNonEmptyArray([])).toBe(false);
    expect(isNonEmptyArray(null)).toBe(false);
    expect(isNonEmptyArray("a")).toBe(false);
  });
});

describe("isPlainObject", () => {
  it("accepts object literals and null-prototype objects", () => {
    expect(isPlainObject({})).toBe(true);
    expect(isPlainObject({ a: 1 })).toBe(true);
    expect(isPlainObject(Object.create(null))).toBe(true);
  });

  it("rejects null, arrays, dates and class instances", () => {
    expect(isPlainObject(null)).toBe(false);
    expect(isPlainObject([])).toBe(false);
    expect(isPlainObject(new Date())).toBe(false);
    class Foo {
      bar = 1;
    }
    expect(isPlainObject(new Foo())).toBe(false);
  });

  it("rejects primitives", () => {
    expect(isPlainObject("a")).toBe(false);
    expect(isPlainObject(1)).toBe(false);
    expect(isPlainObject(true)).toBe(false);
  });
});

describe("hasOwn", () => {
  it("returns true for own enumerable properties", () => {
    expect(hasOwn({ a: 1 }, "a")).toBe(true);
  });

  it("returns false for inherited properties", () => {
    const parent = { inherited: 1 };
    // SAFETY: The test uses the standard object returned by Object.create only for inherited-key behavior.
    const child = Object.create(parent) as object;
    expect(hasOwn(child, "inherited")).toBe(false);
  });

  it("returns true for own property with undefined value", () => {
    expect(hasOwn({ a: undefined }, "a")).toBe(true);
  });
});

describe("isNil", () => {
  it.each([
    [null, true],
    [undefined, true],
    [0, false],
    ["", false],
    [false, false],
    [Number.NaN, false],
  ])("isNil(%p) → %p", (value, expected) => {
    expect(isNil(value)).toBe(expected);
  });
});

describe("isPresent", () => {
  it("rejects null and undefined", () => {
    const absent = undefined;
    expect(isPresent(null)).toBe(false);
    expect(isPresent(absent)).toBe(false);
  });

  it("accepts falsy-but-defined values", () => {
    expect(isPresent(0)).toBe(true);
    expect(isPresent("")).toBe(true);
    expect(isPresent(false)).toBe(true);
  });

  it("works as Array.filter predicate to narrow types", () => {
    const mixed: (number | null | undefined)[] = [1, null, 2, undefined, 0];
    const cleaned = mixed.filter(isPresent);
    expect(cleaned).toEqual([1, 2, 0]);
  });
});
