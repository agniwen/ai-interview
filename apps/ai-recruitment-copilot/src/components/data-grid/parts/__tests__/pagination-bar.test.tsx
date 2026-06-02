import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PaginationBar } from "../pagination-bar";

describe("PaginationBar", () => {
  it("allows pagination controls to stack on mobile without changing desktop layout", () => {
    const html = renderToStaticMarkup(
      <PaginationBar
        onPageChange={() => {}}
        onPageSizeChange={() => {}}
        page={1}
        pageSize={10}
        pageSizeOptions={[10, 20, 50]}
        total={76}
        totalPages={8}
      />,
    );

    expect(html).toContain("sm:flex-row");
    expect(html).toContain("w-full flex-col");
    expect(html).toContain("flex w-full justify-center");
    expect(html).toContain("sm:w-auto sm:justify-start");
  });
});
