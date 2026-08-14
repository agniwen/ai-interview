import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaginationBar } from "./pagination-bar";

describe("PaginationBar", () => {
  it("renders previous, numbered, ellipsis, and next controls responsively", () => {
    const html = renderToStaticMarkup(
      <PaginationBar
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
        page={5}
        pageSize={10}
        pageSizeOptions={[10, 20, 50]}
        total={100}
        totalPages={10}
      />,
    );

    expect(html).toContain("sm:flex-row");
    expect(html).toContain("w-full flex-col");
    expect(html).toContain('data-slot="pagination"');
    expect(html).toContain('data-slot="pagination-content"');
    expect(html).toContain("w-full justify-center");
    expect(html).toContain("sm:w-auto sm:justify-start");
    expect(html).toContain("上一页");
    expect(html).toContain("下一页");
    expect(html).toContain("More pages");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-label="第 5 页"');
  });
});
