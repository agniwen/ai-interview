import { describe, expect, it } from "vitest";

import { actionsColumn, estimateActionsColumnSize } from "../actions-column";

describe("estimateActionsColumnSize", () => {
  it("sizes a single inline action tightly", () => {
    const size = estimateActionsColumnSize({ inlineLabels: ["查看"] });
    expect(size).toBeGreaterThanOrEqual(64);
    expect(size).toBeLessThan(100);
  });

  it("grows for multiple inline actions plus menu", () => {
    const single = estimateActionsColumnSize({ inlineLabels: ["查看"] });
    const full = estimateActionsColumnSize({
      hasMenu: true,
      inlineLabels: ["查看", "编辑"],
    });
    expect(full).toBeGreaterThan(single);
  });

  it("accounts for a longer header label", () => {
    const withShortHeader = estimateActionsColumnSize({
      headerLabel: "操作",
      inlineLabels: [],
    });
    const withLongHeader = estimateActionsColumnSize({
      headerLabel: "更多操作项",
      inlineLabels: [],
    });
    expect(withLongHeader).toBeGreaterThan(withShortHeader);
  });
});

describe("actionsColumn", () => {
  it("locks min/max size to the inferred content width", () => {
    const column = actionsColumn<{ id: string }>({
      inline: [{ label: "查看", onClick: () => {} }],
      menu: [{ label: "删除", onClick: () => {} }],
    });

    expect(column.size).toBeTypeOf("number");
    expect(column.minSize).toBe(column.size);
    expect(column.maxSize).toBe(column.size);
    expect(column.enableResizing).toBe(false);
  });

  it("respects an explicit size override", () => {
    const column = actionsColumn<{ id: string }>({
      inline: [{ label: "查看", onClick: () => {} }],
      size: 180,
    });

    expect(column.size).toBe(180);
    expect(column.minSize).toBe(180);
    expect(column.maxSize).toBe(180);
  });
});
