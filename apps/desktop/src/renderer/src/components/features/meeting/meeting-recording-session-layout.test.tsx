import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MeetingRecordingSessionLayout } from "./meeting-recording-session-layout";

describe("MeetingRecordingSessionLayout", () => {
  it("keeps the scroll stage separate from the fixed action region", () => {
    const html = renderToStaticMarkup(
      <MeetingRecordingSessionLayout
        composer={<div>操作区</div>}
        header={<h1>固定标题</h1>}
        main={<div>可滚动内容</div>}
      />,
    );

    expect(html).toContain('data-slot="meeting-session-header"');
    expect(html).toContain('data-slot="meeting-session-scroll-content"');
    expect(html).toContain('data-slot="meeting-session-action"');
    expect(html).toContain("relative flex h-dvh");
    expect(html).toContain("shrink-0 bg-background");
    expect(html).not.toContain("pb-40");
    expect(html).toContain("pt-8");
    expect(html).not.toContain("calc(100dvh");
    expect(html).not.toContain("pointer-events-none absolute inset-x-0 bottom-0");
    expect(html.indexOf("meeting-session-header")).toBeLessThan(
      html.indexOf('data-slot="scroll-area"'),
    );
    expect(html.indexOf('data-slot="scroll-area"')).toBeLessThan(
      html.indexOf("meeting-session-action"),
    );
  });
});
