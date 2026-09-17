import { describe, expect, it } from "vitest";
import { selectSummarySegment, summarySegmentContext } from "./meeting-summary-segments";

function turn(id: string, text: string, startMs = 0) {
  return { endMs: startMs + 30_000, id, startMs, text };
}
describe("summary segment boundaries", () => {
  it("keeps a condition with its continuation after the soft time limit", () => {
    const turns = [
      turn("1", "介绍方案。"),
      turn("2", "可以上线，但是必须等安全评审", 30_000),
      turn("3", "通过以后，否则继续旧方案。", 60_000),
      turn("4", "下个话题。", 90_000),
    ];
    expect(selectSummarySegment(turns).map((item) => item.id)).toEqual(["1", "2", "3"]);
  });
  it("keeps every character of long unpunctuated speech and carries boundary context", () => {
    const turns = [
      turn("1", "甲".repeat(1500)),
      turn("2", "乙".repeat(1500)),
      turn("3", "实际上并非如此。"),
    ];
    const first = selectSummarySegment(turns);
    const second = selectSummarySegment(turns.slice(first.length));
    expect([...first, ...second].map((item) => item.text).join("")).toBe(
      turns.map((item) => item.text).join(""),
    );
    expect(summarySegmentContext(turns, second)).toEqual(first);
  });
  it("flushes a short unfinished tail without inventing text", () => {
    const turns = [turn("1", "条件是")];
    expect(selectSummarySegment(turns)).toEqual(turns);
  });
});
