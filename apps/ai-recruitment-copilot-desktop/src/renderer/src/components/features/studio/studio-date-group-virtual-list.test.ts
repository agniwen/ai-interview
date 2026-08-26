import { describe, expect, it } from "vitest";
import {
  buildStudioDateGroupedVirtualRows,
  buildStudioStickyDateHeaderPositions,
  resolveStudioStickyDateGroupState,
} from "./studio-date-group-virtual-list";

describe("Desktop date-grouped virtual rows", () => {
  const now = new Date("2026-08-25T16:30:00Z");
  const records = [
    { createdAt: "2026-08-25T16:20:00Z", id: "page1" },
    { createdAt: "2026-08-25T16:10:00Z", id: "page2" },
    { createdAt: "2026-08-25T15:50:00Z", id: "yesterday" },
  ];
  it("uses Beijing dates and merges headers across pagination boundaries", () => {
    const rows = buildStudioDateGroupedVirtualRows(records, "createdAt", now);
    expect(rows.map((row) => (row.type === "date-header" ? row.label : row.record.id))).toEqual([
      "今天",
      "page1",
      "page2",
      "昨天",
      "yesterday",
    ]);
    expect(buildStudioStickyDateHeaderPositions(rows, 217)).toEqual([
      { index: 0, start: 0 },
      { index: 3, start: 490 },
    ]);
  });
  it("pushes the active header away at the next group without overlapping", () => {
    const positions = buildStudioStickyDateHeaderPositions(
      buildStudioDateGroupedVirtualRows(records, "createdAt", now),
      217,
    );
    expect(resolveStudioStickyDateGroupState(positions, 470)).toEqual({
      index: 0,
      isStuck: true,
      pushOffset: -24,
    });
    expect(resolveStudioStickyDateGroupState(positions, 490)).toEqual({
      index: 3,
      isStuck: true,
      pushOffset: 0,
    });
  });
});
