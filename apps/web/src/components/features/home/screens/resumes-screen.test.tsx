import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResumesScreen } from "./resumes-screen";

describe("ResumesScreen", () => {
  it("mirrors the current recruitment desk charts and candidate cards", () => {
    const markup = renderToStaticMarkup(<ResumesScreen />);

    expect(markup.match(/data-slot="tabs-list"/g)).toHaveLength(2);
    expect(markup.match(/data-slot="tab-indicator"/g)).toHaveLength(2);
    expect(markup).toContain("切换个人维度");
    expect(markup).toContain('aria-label="刷新招聘指标"');
    expect(markup).not.toContain("已经进入招聘流程的候选人在这里跟进");
    expect(markup).not.toContain("全部候选人");
    expect(markup).not.toContain("简历筛选中");
    expect(markup).toContain("入库日历");
    expect(markup).toContain("一年新增");
    expect(markup).not.toContain("近 30 天每日新增");
    expect(markup).toContain("推荐 · 86 分");
    expect(markup).not.toContain("AI评分");
    expect(markup).toContain("字节跳动");
    expect(markup).toContain("浙江大学");
    expect(markup).toContain("border-dashed");
    expect(markup).toContain("简历");
    expect(markup).toContain("编辑");
    expect(markup).toContain("AI面");
    expect(markup).toContain("更多");
    expect(markup).not.toContain("综合分排序");
  });
});
