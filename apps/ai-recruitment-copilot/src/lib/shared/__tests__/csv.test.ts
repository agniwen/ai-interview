import { describe, expect, it } from "vitest";
import { parseCsvParam } from "../csv";

describe("parseCsvParam", () => {
  it("trims items and removes empty entries", () => {
    expect(parseCsvParam("u1, u2,,  u3 ")).toEqual(["u1", "u2", "u3"]);
  });

  it("returns an empty array for empty or missing values", () => {
    expect(parseCsvParam("")).toEqual([]);
    expect(parseCsvParam()).toEqual([]);
  });
});
