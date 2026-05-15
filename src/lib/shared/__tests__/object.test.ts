// 对象工具的纯函数测试 / Pure-function tests for the object helpers.

import { describe, expect, it } from "vitest";
import { mergeDefined, omit, pick } from "@/lib/shared/utils/object";

describe("pick", () => {
  it("picks the listed keys", () => {
    const source = { a: 1, b: 2, c: 3 };
    expect(pick(source, ["a", "c"])).toEqual({ a: 1, c: 3 });
  });

  it("ignores keys that don't exist on the source (hasOwn-based)", () => {
    const source = { a: 1 } as { a: number; b?: number };
    expect(pick(source, ["a", "b"])).toEqual({ a: 1 });
  });

  it("ignores inherited properties", () => {
    const parent = { inherited: 1 };
    const child = Object.create(parent) as { inherited?: number; own?: number };
    child.own = 2;
    expect(pick(child as { own: number }, ["own"])).toEqual({ own: 2 });
    // 继承属性即便键名匹配也不被拾取 / inherited keys are skipped even if listed
    expect(pick(child, ["inherited" as never])).toEqual({});
  });

  it("preserves own properties whose value is undefined", () => {
    const source = { a: undefined, b: 2 } as { a: undefined; b: number };
    const result = pick(source, ["a", "b"]);
    expect(result).toEqual({ a: undefined, b: 2 });
    expect(Object.hasOwn(result, "a")).toBe(true);
  });

  it("returns {} when keys list is empty", () => {
    expect(pick({ a: 1 }, [])).toEqual({});
  });

  it("does not mutate the source", () => {
    const source = { a: 1, b: 2 };
    pick(source, ["a"]);
    expect(source).toEqual({ a: 1, b: 2 });
  });
});

describe("omit", () => {
  it("removes the listed keys", () => {
    expect(omit({ a: 1, b: 2, c: 3 }, ["b"])).toEqual({ a: 1, c: 3 });
  });

  it("returns a shallow copy when keys list is empty", () => {
    const source = { a: 1, b: 2 };
    const result = omit(source, []);
    expect(result).toEqual(source);
    expect(result).not.toBe(source);
  });

  it("ignores keys not present on the source", () => {
    expect(omit({ a: 1 }, ["b" as never])).toEqual({ a: 1 });
  });

  it("does not mutate the source", () => {
    const source = { a: 1, b: 2 };
    omit(source, ["a"]);
    expect(source).toEqual({ a: 1, b: 2 });
  });
});

describe("mergeDefined", () => {
  it("later sources win over earlier sources", () => {
    // 显式给 T，否则会从第一个实参推导出 { a; b }，第二个里多出来的 c 会被报为多余属性。
    // Pin T explicitly — otherwise it's inferred from the first arg, and `c` is rejected as excess.
    expect(
      mergeDefined<{ a: number; b: number; c: number }>({ a: 1, b: 1 }, { b: 2, c: 3 }),
    ).toEqual({ a: 1, b: 2, c: 3 });
  });

  it("undefined values do NOT overwrite earlier values", () => {
    expect(mergeDefined<{ a: number; b: number }>({ a: 1, b: 2 }, { a: undefined })).toEqual({
      a: 1,
      b: 2,
    });
  });

  it("null DOES overwrite (only undefined is treated as 'absent')", () => {
    expect(mergeDefined<{ a: number | null }>({ a: 1 }, { a: null })).toEqual({ a: null });
  });

  it("returns {} when called with no sources", () => {
    expect(mergeDefined()).toEqual({});
  });

  it("returns {} when every source is empty", () => {
    expect(mergeDefined({}, {})).toEqual({});
  });

  it("preserves false / 0 / empty-string values", () => {
    expect(
      mergeDefined<{ a: number; b: boolean; c: string }>({}, { a: 0, b: false, c: "" }),
    ).toEqual({
      a: 0,
      b: false,
      c: "",
    });
  });
});
