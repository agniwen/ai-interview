import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ResumesScreen } from "./resumes-screen";

describe("ResumesScreen", () => {
  it("mirrors the current recruitment desk charts and candidate cards", () => {
    const markup = renderToStaticMarkup(<ResumesScreen />);

    expect(markup).toContain("入库日历");
    expect(markup).toContain("一年新增");
    expect(markup).not.toContain("近 30 天每日新增");
    expect(markup).toContain("字节跳动");
    expect(markup).toContain("浙江大学");
    expect(markup).toContain("border-dashed");
    expect(markup).toContain("简历");
    expect(markup).toContain("编辑");
    expect(markup).toContain("AI面");
    expect(markup).toContain("更多");
  });
});
