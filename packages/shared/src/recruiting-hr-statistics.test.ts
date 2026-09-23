import { describe, expect, it } from "vitest";
import {
  aggregateHrStatistics,
  hrStatisticsQuerySchema,
  resolveHrStatisticRanges,
} from "./recruiting-hr-statistics";
import type { HrStatisticEntry } from "./recruiting-hr-statistics";

const now = new Date("2026-09-23T07:00:00.000Z");
const entry = (
  id: string,
  metric: HrStatisticEntry["metric"],
  at: string,
  hrId: string | null = "hr-1",
): HrStatisticEntry => ({
  at,
  candidateName: id,
  departmentId: "department-1",
  hrId,
  id,
  jobId: "job-1",
  metric,
  recordId: metric === "resumes" ? null : id,
});

describe("HR 统计的对比时间", () => {
  it("接口接受本季度和上季度筛选", () => {
    expect(hrStatisticsQuerySchema.parse({ period: "quarter" }).period).toBe("quarter");
    expect(hrStatisticsQuerySchema.parse({ period: "last_quarter" }).period).toBe("last_quarter");
  });

  it("拒绝起始日期在未来的自定义范围", () => {
    const future = { from: "2099-10-01", period: "custom", to: "2099-10-31" } as const;
    expect(hrStatisticsQuerySchema.safeParse(future).success).toBe(false);
    expect(() => resolveHrStatisticRanges(future, now)).toThrow("开始日期不能晚于今天");
  });

  it("进行中的本周对比上周相同进度", () => {
    const ranges = resolveHrStatisticRanges({ period: "week" }, now);
    expect(ranges.current.from).toBe("2026-09-21");
    expect(ranges.current.end).toBe(now.toISOString());
    expect(ranges.previous.from).toBe("2026-09-14");
    expect(ranges.previous.end).toBe("2026-09-16T07:00:00.000Z");
  });

  it("自定义完整自然周对比前一个自然周", () => {
    const ranges = resolveHrStatisticRanges(
      { from: "2026-09-07", period: "custom", to: "2026-09-13" },
      now,
    );
    expect(ranges.comparison).toBe("complete_week");
    expect([ranges.previous.from, ranges.previous.to]).toEqual(["2026-08-31", "2026-09-06"]);
  });

  it("完整自然月按上一个日历月比较，不强行等天数", () => {
    const ranges = resolveHrStatisticRanges(
      { from: "2026-08-01", period: "custom", to: "2026-08-31" },
      now,
    );
    expect(ranges.comparison).toBe("complete_month");
    expect([ranges.previous.from, ranges.previous.to]).toEqual(["2026-07-01", "2026-07-31"]);
  });

  it("本季度对比上季度相同进度", () => {
    const ranges = resolveHrStatisticRanges({ period: "quarter" }, now);
    expect([ranges.current.from, ranges.current.to]).toEqual(["2026-07-01", "2026-09-30"]);
    expect(ranges.current.end).toBe(now.toISOString());
    expect([ranges.previous.from, ranges.previous.to]).toEqual(["2026-04-01", "2026-06-30"]);
    expect(ranges.previous.end).toBe("2026-06-24T07:00:00.000Z");
    expect(ranges.comparison).toBe("same_progress");
  });

  it("上季度对比再前一个完整自然季度，跨年不按固定天数倒推", () => {
    const ranges = resolveHrStatisticRanges(
      { period: "last_quarter" },
      new Date("2026-01-15T07:00:00.000Z"),
    );
    expect([ranges.current.from, ranges.current.to]).toEqual(["2025-10-01", "2025-12-31"]);
    expect([ranges.previous.from, ranges.previous.to]).toEqual(["2025-07-01", "2025-09-30"]);
    expect(ranges.comparison).toBe("complete_quarter");
  });

  it("自定义完整自然季度与快捷季度使用相同对比范围", () => {
    const shortcut = resolveHrStatisticRanges({ period: "last_quarter" }, now);
    const custom = resolveHrStatisticRanges(
      { from: "2026-04-01", period: "custom", to: "2026-06-30" },
      now,
    );
    expect(custom).toEqual(shortcut);
  });

  it("自定义非完整周期对比紧邻等长日区间", () => {
    const ranges = resolveHrStatisticRanges(
      { from: "2026-09-10", period: "custom", to: "2026-09-16" },
      now,
    );
    expect([ranges.previous.from, ranges.previous.to]).toEqual(["2026-09-03", "2026-09-09"]);
  });
});

describe("HR 统计聚合", () => {
  const ranges = resolveHrStatisticRanges({ period: "week" }, now);

  it("先按整个生命周期去重，再按时间筛选并计算筛选率", () => {
    const result = aggregateHrStatistics(
      [
        entry("resume-1", "resumes", "2026-09-21T02:00:00.000Z"),
        entry("record-1", "screening", "2026-09-21T03:00:00.000Z"),
        entry("record-1", "screening", "2026-09-22T03:00:00.000Z"),
        entry("record-2", "screening", "2026-09-22T03:00:00.000Z"),
        entry("record-2", "screening", "2026-09-15T03:00:00.000Z"),
      ],
      ranges,
      new Map([["hr-1", "HR 甲"]]),
    );
    expect(result.team[0].count).toBe(1);
    expect(result.team[1].count).toBe(1);
    expect(result.team[1].ratio).toBe(100);
    expect(result.hr[0]?.counts.slice(0, 2)).toEqual([1, 1]);
  });

  it("旧记录按传入的当前 HR 归属，团队比率按总数重算", () => {
    const result = aggregateHrStatistics(
      [
        entry("resume-1", "resumes", "2026-09-21T02:00:00.000Z"),
        entry("record-1", "screening", "2026-09-21T03:00:00.000Z", "hr-2"),
      ],
      ranges,
      new Map([
        ["hr-1", "HR 甲"],
        ["hr-2", "HR 乙"],
      ]),
    );
    expect(result.team[1].ratio).toBe(100);
    expect(result.hr.map((row) => row.name)).toEqual(["HR 甲", "HR 乙"]);
    expect(result.hr.find((row) => row.hrId === "hr-2")?.ratios[1]).toBeNull();
  });

  it("上期比率与明细使用同一个对比时间窗口", () => {
    const result = aggregateHrStatistics(
      [
        entry("previous-resume", "resumes", "2026-09-14T02:00:00.000Z"),
        entry("previous-record", "screening", "2026-09-15T03:00:00.000Z"),
        entry("after-cutoff", "screening", "2026-09-17T03:00:00.000Z"),
      ],
      ranges,
      new Map([["hr-1", "HR 甲"]]),
    );
    expect(result.team[1].previousRatio).toBe(100);
    expect(result.previousDetails.map((row) => row.id)).toEqual([
      "previous-record",
      "previous-resume",
    ]);
  });
});
