// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { syncScrollProgress } from "./resume-dedup-scroll-model";

function setScrollMetrics(element: HTMLElement, scrollHeight: number, clientHeight: number) {
  Object.defineProperties(element, {
    clientHeight: { configurable: true, value: clientHeight },
    scrollHeight: { configurable: true, value: scrollHeight },
  });
}

describe("ResumeDedupCompareDialog synchronized scrolling", () => {
  it("maps source scroll position to the target percentage", () => {
    const source = document.createElement("div");
    const target = document.createElement("div");
    setScrollMetrics(source, 1000, 200);
    setScrollMetrics(target, 2000, 200);
    source.scrollTop = 400;

    expect(syncScrollProgress(source, target)).toBe(900);
    expect(target.scrollTop).toBe(900);
  });

  it("clamps positions and leaves targets with no scroll range at zero", () => {
    const source = document.createElement("div");
    const target = document.createElement("div");
    setScrollMetrics(source, 1000, 200);
    setScrollMetrics(target, 200, 200);
    source.scrollTop = 1200;

    expect(syncScrollProgress(source, target)).toBe(0);
    expect(target.scrollTop).toBe(0);
  });
});
