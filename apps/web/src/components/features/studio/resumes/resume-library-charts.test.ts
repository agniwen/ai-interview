import { describe, expect, it } from "vitest";
import {
  buildBoardFlowRow,
  buildBoardStatusSummary,
  buildPipelineRow,
  buildUploaderRanking,
} from "./resume-library-charts";

describe("resume library chart models", () => {
  it("builds the single stacked pipeline bar from current-stage counts", () => {
    const pipeline = buildPipelineRow([
      { count: 1444, outcome: "in_pipeline", stage: "screening" },
      { count: 130, outcome: "in_pipeline", stage: "ai_interview" },
      { count: 6, outcome: "in_pipeline", stage: "second_interview" },
      { count: 2, outcome: "in_pipeline", stage: "offer" },
      { count: 0, outcome: "hired", stage: "closed" },
      { count: 10, outcome: "rejected", stage: "closed" },
    ]);

    expect(pipeline).toMatchObject({ active: 1582, total: 1592 });
    expect(pipeline.stackRows.map(({ label, value }) => ({ label, value }))).toEqual([
      { label: "简历筛选", value: 1444 },
      { label: "面试", value: 136 },
      { label: "Offer协商", value: 2 },
      { label: "入职办理", value: 0 },
      { label: "已结束", value: 10 },
    ]);
    const visibleRows = pipeline.stackRows.filter((row) => row.value > 0);
    expect(visibleRows.every((row) => row.visualShare >= 0.035)).toBe(true);
    expect(pipeline.stackRows.reduce((sum, row) => sum + row.visualShare, 0)).toBeCloseTo(1, 8);
    expect(pipeline.stackRows[0]?.visualShare).toBeGreaterThan(
      pipeline.stackRows[1]?.visualShare ?? 0,
    );
  });

  it("groups every closed outcome under the top-level closed stage", () => {
    const pipeline = buildPipelineRow([
      { count: 8, outcome: "archived", stage: "closed" },
      { count: 2, outcome: "hired", stage: "closed" },
    ]);

    expect(pipeline).toMatchObject({ active: 0, total: 10 });
    expect(pipeline.counts.closed).toBe(10);
  });

  it("builds submenu flow segments from its child tabs", () => {
    const flow = buildBoardFlowRow([
      { count: 2, label: "流水提供", view: "offer:income" },
      { count: 3, label: "谈薪", view: "offer:negotiating" },
      { count: 4, label: "发 Offer", view: "offer:send" },
      { count: 1, label: "背调", view: "offer:background" },
    ]);

    expect(flow.total).toBe(10);
    expect(flow.stackRows.map(({ label, value }) => ({ label, value }))).toEqual([
      { label: "流水提供", value: 2 },
      { label: "谈薪", value: 3 },
      { label: "发 Offer", value: 4 },
      { label: "背调", value: 1 },
    ]);
    expect(flow.stackRows.map((row) => row.color)).toEqual([
      "var(--pipeline-screening)",
      "var(--pipeline-ai-interview)",
      "var(--pipeline-human-interview)",
      "var(--pipeline-offer)",
    ]);
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

  it("calculates the status shares shown by a recruiting submenu", () => {
    const summary = buildBoardStatusSummary([
      { count: 2, label: "流水提供", view: "offer:income" },
      { count: 3, label: "谈薪", view: "offer:negotiating" },
      { count: 4, label: "发 Offer", view: "offer:send" },
      { count: 1, label: "背调", view: "offer:background" },
    ]);
    expect(summary).toMatchObject({
      largestPercent: 40,
      slices: [
        { key: "offer:income", label: "流水提供", percent: 20, value: 2 },
        { key: "offer:negotiating", label: "谈薪", percent: 30, value: 3 },
        { key: "offer:send", label: "发 Offer", percent: 40, value: 4 },
        { key: "offer:background", label: "背调", percent: 10, value: 1 },
      ],
      total: 10,
    });
    expect(summary.slices.map((slice) => slice.fill)).toEqual([
      "var(--chart-1)",
      "var(--chart-2)",
      "var(--chart-3)",
      "var(--chart-4)",
    ]);
  });
});
