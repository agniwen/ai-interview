import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Toolbar } from "../toolbar";

describe("Toolbar", () => {
  it("renders two direct fields without a mobile minimum width", () => {
    const html = renderToStaticMarkup(
      <Toolbar
        filterValues={{ creator: "", search: "" }}
        filters={[
          {
            key: "search",
            minWidth: "15rem",
            placeholder: "搜索",
            type: "search",
          },
          {
            key: "creator",
            placeholder: "创建人",
            type: "search",
          },
        ]}
      />,
    );

    expect(html).toContain('data-slot="data-grid-toolbar-search"');
    expect(html).toContain("--data-grid-filter-min-width:15rem");
    expect(html).not.toContain('style="min-width:15rem"');
  });

  it("keeps multi-select condition previews compact by default", () => {
    const html = renderToStaticMarkup(
      <Toolbar
        filterValues={{ jobIds: "job-a,job-b,job-c" }}
        filters={[
          { key: "name", label: "名称", type: "search" },
          { key: "email", label: "邮箱", type: "search" },
          {
            key: "jobIds",
            options: [
              { label: "岗位 A", value: "job-a" },
              { label: "岗位 B", value: "job-b" },
              { label: "岗位 C", value: "job-c" },
            ],
            placeholder: "全部岗位",
            type: "multi-select",
          },
        ]}
      />,
    );

    expect(html).not.toContain('data-slot="data-grid-toolbar-search"');
    expect(html).toContain("岗位 A");
    expect(html).toContain("岗位 B");
    expect(html).toContain("+1");
    expect(html).toContain("属于任意");
    expect(html).toContain("移除全部岗位筛选");
  });

  it("renders one or two independent filters directly", () => {
    const html = renderToStaticMarkup(
      <Toolbar
        filterValues={{ status: "" }}
        filters={[
          {
            key: "status",
            options: [{ label: "完成", value: "done" }],
            placeholder: "状态",
            type: "select",
          },
        ]}
      />,
    );
    expect(html).not.toContain("添加筛选");
    expect(html).toContain("状态");
    expect(html).not.toContain('data-slot="filter-chip"');
  });

  it("puts conditions and actions in one wrapping row in the requested order", () => {
    const html = renderToStaticMarkup(
      <Toolbar
        filters={[{ key: "textFilters", resource: "resumes", type: "text-filters" }]}
        onResetFilters={() => {
          /* test callback */
        }}
        onRefresh={() => {
          /* test callback */
        }}
        toolbarRight={<button type="button">创建记录</button>}
      />,
    );
    expect(html.indexOf('data-slot="data-grid-toolbar-filters"')).toBeLessThan(
      html.indexOf("清空筛选"),
    );
    expect(html.indexOf("清空筛选")).toBeLessThan(html.indexOf(">刷新<"));
    expect(html.indexOf(">刷新<")).toBeLessThan(html.indexOf("创建记录"));
    expect(html).not.toContain('class="flex min-w-0 flex-col gap-3"');
  });

  it("explains why a select filter is disabled", () => {
    const html = renderToStaticMarkup(
      <Toolbar
        filterValues={{ uploaderId: "self" }}
        filters={[
          {
            disabled: true,
            disabledReason: "当前仅可查看自己的数据",
            key: "uploaderId",
            options: [{ label: "当前用户", value: "self" }],
            type: "select",
          },
        ]}
      />,
    );

    expect(html).toContain('data-slot="tooltip-trigger"');
    expect(html).toContain('tabindex="0"');
  });
});
