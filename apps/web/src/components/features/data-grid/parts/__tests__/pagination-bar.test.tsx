import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaginationBar, PaginationBarSkeleton } from "../pagination-bar";

describe("PaginationBar", () => {
  it("renders a compact mobile page indicator while loading", () => {
    const html = renderToStaticMarkup(<PaginationBarSkeleton />);

    expect(html).toContain('data-slot="pagination-bar-skeleton"');
    expect(html).toContain("sm:min-h-11");
    expect(html).toContain('data-slot="pagination-mobile-info-skeleton"');
    expect(html.match(/class="[^"]*size-9[^"]*"/g)).toHaveLength(7);
  });

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

    expect(html).toContain('data-slot="pagination-bar"');
    expect(html).toContain('data-slot="pagination"');
    expect(html).toContain('data-slot="pagination-content"');
    expect(html).toContain('data-slot="pagination-mobile-info"');
    expect(html).toContain("5 / 10");
    expect(html).toContain("上一页");
    expect(html).toContain("下一页");
    expect(html).toContain("More pages");
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('aria-label="第 5 页"');
    expect(html).toContain("border-border/80");
    expect(html).toContain("bg-accent");
    expect(html).toContain("hover:border-transparent");
  });
});
