import { describe, expect, it } from "vitest";
import {
  formatBusinessInterviewLabel,
  getNextBusinessInterviewLabel,
  parseBusinessInterviewNumber,
} from "./human-interview-rounds";

describe("business interview labels", () => {
  it("retains a cancelled CEO round without consuming a business round", () => {
    expect(
      getNextBusinessInterviewLabel([
        { label: "业务一面", outcome: "pass", status: "completed" },
        { label: "CEO面试", outcome: null, status: "cancelled" },
      ]),
    ).toBe("CEO面试");
    expect(
      getNextBusinessInterviewLabel([
        { label: "业务一面", outcome: "pass", status: "completed" },
        { label: "CEO面试", outcome: "pass", status: "completed" },
      ]),
    ).toBe("业务二面");
  });
  it.each([
    [1, "业务一面"],
    [2, "业务二面"],
    [3, "业务三面"],
    [10, "业务十面"],
    [11, "业务十一面"],
    [20, "业务二十面"],
  ])("formats round %s", (number, label) => {
    expect(formatBusinessInterviewLabel(Number(number))).toBe(label);
    expect(parseBusinessInterviewNumber(String(label))).toBe(number);
  });
  it("reuses the cancelled round label without advancing", () => {
    expect(
      getNextBusinessInterviewLabel([
        { label: "业务一面", outcome: "pass", status: "completed" },
        { label: "业务二面", outcome: null, status: "cancelled" },
        { label: "业务二面", outcome: null, status: "cancelled" },
      ]),
    ).toBe("业务二面");
  });
  it("retains a cancelled custom label and advances only after passing", () => {
    expect(
      getNextBusinessInterviewLabel([{ label: "架构复面", outcome: null, status: "cancelled" }]),
    ).toBe("架构复面");
    expect(
      getNextBusinessInterviewLabel([{ label: "技术复面", outcome: "pass", status: "completed" }]),
    ).toBe("业务二面");
    expect(getNextBusinessInterviewLabel([])).toBe("业务一面");
  });
});
