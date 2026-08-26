import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaginationBar, PaginationBarSkeleton } from "./pagination-bar";

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

  it("keeps the pagination skeleton on the same responsive geometry", () => {
    const pagination = renderToStaticMarkup(
      <PaginationBar
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
        page={1}
        pageSize={10}
        total={20}
        totalPages={2}
      />,
    );
    const skeleton = renderToStaticMarkup(<PaginationBarSkeleton />);

    for (const className of [
      "flex flex-col items-stretch justify-between gap-3 px-2 sm:flex-row sm:items-center sm:gap-4",
      "flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:gap-4",
    ]) {
      expect(pagination).toContain(className);
      expect(skeleton).toContain(className);
    }
    expect(skeleton).toContain('data-slot="pagination-bar-skeleton"');
    expect(skeleton).toContain("h-5 w-56 max-w-full");
    expect(skeleton).toContain("h-8 w-[5.5rem]");
    expect(skeleton).toContain("size-9 sm:w-[4.75rem]");
  });
});
