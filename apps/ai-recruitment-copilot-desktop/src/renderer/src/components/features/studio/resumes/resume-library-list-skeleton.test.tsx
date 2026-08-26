import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResumeLibraryListSkeleton } from "./resume-library-list-skeleton";

describe("ResumeLibraryListSkeleton", () => {
  it("matches the virtual date row and responsive card-row geometry", () => {
    const html = renderToStaticMarkup(<ResumeLibraryListSkeleton cardHeight={260} />);

    expect(html).toContain('data-slot="resume-library-list-skeleton"');
    expect(html).toContain('style="height:56px"');
    expect(html.match(/data-slot="resume-library-card-skeleton-row"/g)).toHaveLength(4);
    expect(html.match(/style="height:260px"/g)).toHaveLength(4);
    expect(html).toContain("pb-3");
    expect(html).toContain("relative flex h-full overflow-hidden rounded-xl border");
    expect(html).toContain("xl:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.7fr)] xl:gap-x-8");
  });
});
