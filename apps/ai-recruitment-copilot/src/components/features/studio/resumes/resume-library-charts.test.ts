import { describe, expect, it } from "vitest";
import { buildUploaderRanking } from "./resume-library-charts";

describe("resume library chart models", () => {
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
