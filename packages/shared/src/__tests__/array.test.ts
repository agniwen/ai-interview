// 数组工具的纯函数测试 / Pure-function tests for the array helpers.

import { describe, expect, it } from "vitest";
import {
  chunk,
  compact,
  ensureArray,
  ensureStringArray,
  partition,
  unique,
  uniqueBy,
} from "@app/shared/utils/array";

describe("ensureArray", () => {
  it("passes arrays through unchanged (same reference)", () => {
    const input = [1, 2];
    expect(ensureArray(input)).toBe(input);
  });

  it("returns empty array for null / undefined", () => {
    // 用 typed const 绕过 oxfmt 自动剥裸 `undefined` 实参的格式化规则。
    // Use a typed const so oxfmt doesn't strip the bare `undefined` argument.
    const absent = undefined;
    expect(ensureArray(null)).toEqual([]);
    expect(ensureArray(absent)).toEqual([]);
  });

  it("wraps single values into a one-element array", () => {
    expect(ensureArray("a")).toEqual(["a"]);
    expect(ensureArray(0)).toEqual([0]);
    expect(ensureArray(false)).toEqual([false]);
  });

  it("preserves empty array", () => {
    expect(ensureArray([])).toEqual([]);
  });
});

describe("ensureStringArray", () => {
  it("returns [] for non-array input", () => {
    expect(ensureStringArray("abc")).toEqual([]);
    expect(ensureStringArray(null)).toEqual([]);
    expect(ensureStringArray({ length: 1 })).toEqual([]);
  });

  it("keeps only non-empty strings, dropping other types and empty strings", () => {
    expect(ensureStringArray(["a", "", "b", 1, null, undefined, " "])).toEqual(["a", "b", " "]);
  });

  it("returns [] for empty array", () => {
    expect(ensureStringArray([])).toEqual([]);
  });
});

describe("unique", () => {
  it("removes duplicates and preserves first-seen order", () => {
    expect(unique([1, 2, 1, 3, 2])).toEqual([1, 2, 3]);
  });

  it("uses === equality (different object references stay distinct)", () => {
    const a = { id: 1 };
    const b = { id: 1 };
    expect(unique([a, b, a])).toEqual([a, b]);
  });

  it("handles empty array", () => {
    expect(unique([])).toEqual([]);
  });
});

describe("uniqueBy", () => {
  it("deduplicates by extracted key, keeping the first occurrence", () => {
    const items = [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
      { id: 1, name: "c" },
    ];
    expect(uniqueBy(items, (item) => item.id)).toEqual([
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ]);
  });

  it("can use composite keys", () => {
    const items = [
      { a: 1, b: 1 },
      { a: 1, b: 2 },
      { a: 1, b: 1 },
    ];
    expect(uniqueBy(items, (item) => `${item.a}-${item.b}`)).toEqual([
      { a: 1, b: 1 },
      { a: 1, b: 2 },
    ]);
  });
});

describe("chunk", () => {
  it("returns [] when size <= 0", () => {
    expect(chunk([1, 2, 3], 0)).toEqual([]);
    expect(chunk([1, 2, 3], -1)).toEqual([]);
  });

  it("splits into equal pieces", () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });

  it("leaves a smaller tail when the array doesn't divide evenly", () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns a single chunk when size >= length", () => {
    expect(chunk([1, 2], 5)).toEqual([[1, 2]]);
  });

  it("returns [] for empty input", () => {
    expect(chunk([], 3)).toEqual([]);
  });
});

describe("partition", () => {
  it("splits into [matched, rest] by predicate", () => {
    const [evens, odds] = partition([1, 2, 3, 4], (item) => item % 2 === 0);
    expect(evens).toEqual([2, 4]);
    expect(odds).toEqual([1, 3]);
  });

  it("passes the index to the predicate", () => {
    const indices: number[] = [];
    partition(["a", "b", "c"], (_item, index) => {
      indices.push(index);
      return false;
    });
    expect(indices).toEqual([0, 1, 2]);
  });

  it("returns two empty arrays for empty input", () => {
    expect(partition([], () => true)).toEqual([[], []]);
  });
});

describe("compact", () => {
  it("removes null and undefined", () => {
    expect(compact([1, null, 2, undefined, 3])).toEqual([1, 2, 3]);
  });

  it("preserves falsy-but-present values (0, '', false)", () => {
    expect(compact([0, "", false, null])).toEqual([0, "", false]);
  });

  it("returns [] when everything is nil", () => {
    expect(compact([null, undefined])).toEqual([]);
  });
});
