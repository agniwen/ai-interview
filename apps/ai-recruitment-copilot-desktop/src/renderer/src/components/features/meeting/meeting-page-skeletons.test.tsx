import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MeetingMorePageSkeleton, MeetingSessionPageSkeleton } from "./meeting-page-skeletons";

const detailPageSource = readFileSync(
  join(import.meta.dirname, "meeting-detail-page.tsx"),
  "utf-8",
);
const morePageSource = readFileSync(join(import.meta.dirname, "meeting-more-page.tsx"), "utf-8");

describe("meeting page skeletons", () => {
  it("mirrors the completed session layout: title, transcript and overlay", () => {
    const html = renderToStaticMarkup(<MeetingSessionPageSkeleton />);

    expect(html).toContain('data-slot="meeting-session-skeleton"');
    expect(html).toContain('data-slot="meeting-session-layout"');
    expect(html).not.toContain('data-slot="meeting-composer-frame"');
    expect(html).not.toContain("pointer-events-none absolute inset-x-0 bottom-0");
    expect(html).toContain("absolute top-4 right-4");
    expect(html).toContain("max-w-3xl");
    expect(html).toContain("pr-12");
    expect(html).toContain('aria-label="正在加载录制会话"');
  });

  it("mirrors the more page as stacked frames with header, metadata and player", () => {
    const html = renderToStaticMarkup(<MeetingMorePageSkeleton />);

    expect(html).toContain('data-slot="meeting-more-skeleton"');
    expect(html).toContain("max-w-4xl");
    expect(html.split('data-slot="frame"').length - 1).toBe(7);
    expect(html).toContain("sm:grid-cols-4");
    expect(html).toContain('data-slot="meeting-audio-player"');
    expect(html).toContain('data-slot="frame-panel-description"');
    expect(html).toContain('aria-label="正在加载录制详情"');
  });

  it("is used by the session and more page pending states", () => {
    expect(detailPageSource).toContain("MeetingSessionPageSkeleton");
    expect(morePageSource).toContain("MeetingMorePageSkeleton");
    expect(detailPageSource).not.toContain("rounded-2xl");
    expect(morePageSource).not.toContain('Skeleton className="h-52');
  });
});
