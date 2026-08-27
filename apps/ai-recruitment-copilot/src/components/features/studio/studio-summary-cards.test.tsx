// @vitest-environment jsdom

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StudioSummaryCards } from "./studio-summary-cards";

const items = [
  { description: "全部记录", id: "total", label: "总数", value: "42" },
  { description: "等待处理", id: "pending", label: "待处理", value: "8" },
  { description: "正在进行", id: "active", label: "进行中", value: "3" },
  { description: "已经完成", id: "done", label: "已完成", value: "31" },
];

describe("StudioSummaryCards", () => {
  it("uses the same card composition for loading and loaded geometry", () => {
    const html = renderToStaticMarkup(<StudioSummaryCards items={items} loading />);

    expect(html).toContain('data-state="loading"');
    expect(html).toContain('data-slot="studio-summary-cards-skeleton"');
    expect(html.match(/data-slot="card"/g)).toHaveLength(8);
    expect(html.match(/data-slot="card-header"/g)).toHaveLength(8);
    expect(html.match(/data-slot="card-panel"/g)).toHaveLength(8);
    expect(html.match(/grid-cols-2 gap-4 xl:grid-cols-4/g)).toHaveLength(2);
  });

  it("reveals the real values without a loading placeholder", () => {
    const html = renderToStaticMarkup(<StudioSummaryCards items={items} />);

    expect(html).toContain('data-state="revealed"');
    expect(html).not.toContain('data-slot="studio-summary-cards-skeleton"');
    expect(html).toContain("42");
  });
});
