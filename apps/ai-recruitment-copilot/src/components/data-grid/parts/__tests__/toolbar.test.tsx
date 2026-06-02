import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Toolbar } from "../toolbar";

describe("Toolbar", () => {
  it("lays out filter items in two columns on mobile", () => {
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

    expect(html).toContain("grid w-full");
    expect(html).toContain("grid-cols-2");
    expect(html).toContain("sm:flex");
    expect(html).toContain("--data-grid-filter-min-width:15rem");
    expect(html).not.toContain('style="min-width:15rem"');
  });
});
