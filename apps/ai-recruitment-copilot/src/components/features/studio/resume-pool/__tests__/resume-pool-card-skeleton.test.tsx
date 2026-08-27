import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResumePoolCardSkeleton } from "../resume-pool-card-skeleton";

describe("ResumePoolCardSkeleton", () => {
  it("mirrors the detailed regions and responsive height of a talent card", () => {
    const html = renderToStaticMarkup(<ResumePoolCardSkeleton />);

    expect(html).toContain('data-slot="resume-pool-card-skeleton"');
    expect(html).toContain('data-slot="resume-pool-card-skeleton-avatar"');
    expect(html.match(/data-slot="resume-pool-card-skeleton-meta"/gu)).toHaveLength(3);
    expect(html.match(/data-slot="resume-pool-card-skeleton-summary"/gu)).toHaveLength(2);
    expect(html.match(/data-slot="resume-pool-card-skeleton-skill"/gu)).toHaveLength(3);
    expect(html.match(/data-slot="resume-pool-card-skeleton-action"/gu)).toHaveLength(3);
    expect(html).toContain("h-[356px]");
    expect(html).toContain("pb-3");
    expect(html).toContain("sm:h-[308px]");
    expect(html).toContain("2xl:h-[218px]");
  });
});
