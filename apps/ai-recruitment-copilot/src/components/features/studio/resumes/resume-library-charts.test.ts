import { describe, expect, it } from "vitest";
import {
  buildFunnelLayout,
  buildPipelineFunnel,
  buildUploaderRanking,
} from "./resume-library-charts";

describe("resume library chart models", () => {
  it("keeps the recruiting funnel readable while approaching real retention deeper down", () => {
    const funnel = buildPipelineFunnel([
      { count: 1444, outcome: "in_pipeline", stage: "screening" },
      { count: 130, outcome: "in_pipeline", stage: "ai_interview" },
      { count: 6, outcome: "in_pipeline", stage: "human_interview" },
      { count: 2, outcome: "in_pipeline", stage: "offer" },
      { count: 0, outcome: "hired", stage: "closed" },
      { count: 10, outcome: "rejected", stage: "closed" },
    ]);

    expect(funnel.stages.map(({ label, value }) => ({ label, value }))).toEqual([
      { label: "已入库", value: 1592 },
      { label: "进入 AI 面试", value: 148 },
      { label: "进入真人复面", value: 18 },
      { label: "进入 Offer", value: 12 },
      { label: "已结案", value: 10 },
    ]);
    expect(funnel.stages.map((stage) => stage.widthRatio)).toEqual(
      funnel.stages.map((stage) => stage.widthRatio).toSorted((left, right) => right - left),
    );
    const widths = funnel.stages.map((stage) => stage.widthRatio);
    expect(widths[0]).toBeCloseTo(1, 3);
    expect(widths[1]).toBeCloseTo(0.461, 3);
    expect(widths[2]).toBeCloseTo(0.179, 3);
    expect(widths[3]).toBeCloseTo(0.133, 3);
    expect(widths[4]).toBeCloseTo(0.112, 3);

    const finalVisualRetention = (widths[4] ?? 0) / (widths[3] ?? 1);
    const finalActualRetention = 10 / 12;
    expect(Math.abs(finalVisualRetention - finalActualRetention)).toBeLessThan(0.02);

    const layout = buildFunnelLayout(funnel.stages);
    const firstStageThickness = (layout.points[0]?.y2 ?? 0) - (layout.points[0]?.y1 ?? 0);
    expect(firstStageThickness).toBeCloseTo(76, 3);

    const finalThicknesses = layout.points
      .filter((point) => point.id === "closed")
      .map((point) => point.y2 - point.y1);
    const finalTopThickness = finalThicknesses[0] ?? 0;
    const finalBaseThickness = finalThicknesses.at(-1) ?? 0;
    expect(finalBaseThickness / finalTopThickness).toBeCloseTo(0.72, 3);
    expect(finalBaseThickness).toBeGreaterThan(0);
  });

  it("aggregates uploader totals for each Beijing calendar range and returns the top five", () => {
    const dailyAdded = [
      {
        byUser: [
          { count: 2, userId: "a", userImage: "https://example.com/a.png", userName: "安然" },
          { count: 1, userId: "b", userImage: null, userName: "白露" },
        ],
        count: 3,
        day: "2026-08-17",
      },
      {
        byUser: [
          { count: 4, userId: "b", userImage: null, userName: "白露" },
          { count: 3, userId: "c", userImage: null, userName: "陈晨" },
          { count: 2, userId: "d", userImage: null, userName: "杜衡" },
          { count: 2, userId: "e", userImage: null, userName: "方圆" },
          { count: 1, userId: "f", userImage: null, userName: "高远" },
        ],
        count: 12,
        day: "2026-08-22",
      },
      {
        byUser: [
          { count: 5, userId: "a", userImage: "https://example.com/a.png", userName: "安然" },
          { count: 2, userId: "c", userImage: null, userName: "陈晨" },
        ],
        count: 7,
        day: "2026-08-23",
      },
    ];

    expect(buildUploaderRanking(dailyAdded, "today", "2026-08-23")).toMatchObject({
      participantCount: 2,
      rows: [
        { count: 5, userId: "a", userImage: "https://example.com/a.png" },
        { count: 2, userId: "c" },
      ],
      total: 7,
    });
    expect(buildUploaderRanking(dailyAdded, "yesterday", "2026-08-23").total).toBe(12);
    expect(buildUploaderRanking(dailyAdded, "week", "2026-08-23")).toMatchObject({
      participantCount: 6,
      rows: [
        { count: 7, userId: "a" },
        { count: 5, userId: "b" },
        { count: 5, userId: "c" },
        { count: 2, userId: "d" },
        { count: 2, userId: "e" },
      ],
      total: 22,
    });
    expect(buildUploaderRanking(dailyAdded, "month", "2026-08-23").total).toBe(22);
  });
});
