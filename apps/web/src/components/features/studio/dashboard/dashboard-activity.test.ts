import { describe, expect, it } from "vitest";
import { formatActivityTooltip, getActivityChartData } from "./dashboard-activity";

describe("dashboard daily activity chart", () => {
  it("preserves each daily series and zero days without changing the calendar date", () => {
    const rows = [
      { aiCompleted: 1, day: "2026-09-15", humanCompleted: 3, offersSent: 1, resumesAdded: 2 },
      { aiCompleted: 0, day: "2026-09-16", humanCompleted: 0, offersSent: 0, resumesAdded: 0 },
    ];
    const chart = getActivityChartData(rows);
    expect(chart.domain).toEqual(["2026-09-15", "2026-09-16"]);
    expect(chart.data.map((row) => row.value)).toEqual([2, 1, 3, 1, 0, 0, 0, 0]);
    expect(chart.maximum).toBeGreaterThanOrEqual(7);
    expect(chart.ticks[0]).toBe(0);
    expect(chart.ticks.every(Number.isInteger)).toBe(true);
    expect(formatActivityTooltip(rows[0])).toBe(
      "2026-09-15\n新增简历：2\nAI 完成：1\n复面完成：3\nOffer 发出：1",
    );
  });

  it("keeps a non-degenerate integer axis for empty and low-volume activity", () => {
    for (const count of [0, 1]) {
      const chart = getActivityChartData([
        {
          aiCompleted: 0,
          day: "2026-09-16",
          humanCompleted: 0,
          offersSent: 0,
          resumesAdded: count,
        },
      ]);
      expect(chart.ticks).toEqual([0, 1]);
      expect(chart.maximum).toBe(1);
    }
    expect(getActivityChartData([]).ticks).toEqual([0, 1]);
  });
});
