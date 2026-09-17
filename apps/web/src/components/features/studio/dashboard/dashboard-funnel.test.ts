import { describe, expect, it } from "vitest";
import { getDashboardFunnelRows } from "./dashboard-funnel";

describe("dashboard funnel presentation", () => {
  it("shows conversion against the immediately previous milestone", () => {
    const rows = getDashboardFunnelRows({
      enteredInterview: 7,
      enteredOffer: 3,
      enteredSecondInterview: 6,
      hired: 1,
      resumesAdded: 7,
    });

    expect(rows.map((row) => [row.label, row.count, row.conversion])).toEqual([
      ["简历入库", 7, "100%"],
      ["进入面试", 7, "100%"],
      ["进入复面", 6, "86%"],
      ["进入 Offer", 3, "50%"],
      ["已入职", 1, "33%"],
    ]);
  });

  it("uses the previous cumulative stage for production-sized ratios", () => {
    const rows = getDashboardFunnelRows({
      enteredInterview: 171,
      enteredOffer: 3,
      enteredSecondInterview: 16,
      hired: 0,
      resumesAdded: 1733,
    });

    expect(rows.map((row) => [row.label, row.count, row.conversionBase, row.conversion])).toEqual([
      ["简历入库", 1733, 1733, "100%"],
      ["进入面试", 171, 1733, "10%"],
      ["进入复面", 16, 171, "9%"],
      ["进入 Offer", 3, 16, "19%"],
      ["已入职", 0, 3, "0%"],
    ]);
  });
});
