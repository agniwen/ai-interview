import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MeetingSetupComposer } from "./meeting-capture-status";
import { MeetingRecordingSessionLayout } from "./meeting-recording-session-layout";

describe("MeetingRecordingSessionLayout", () => {
  it("keeps the scroll area full-width relative to the sidebar content pane", () => {
    const html = renderToStaticMarkup(
      <MeetingRecordingSessionLayout composer={<div>composer</div>} main={<div>messages</div>} />,
    );

    expect(html).toContain('class="@container relative flex w-full flex-col overflow-hidden"');
    expect(html).toContain(
      'data-overlayscrollbars-contents=""><div class="h-full min-h-full pt-4"',
    );
    expect(html).toContain("pointer-events-none absolute inset-x-0 bottom-0");
    expect(html).toContain("px-4 pb-5 sm:px-6");
    expect(html).toContain("pointer-events-auto mx-auto w-full max-w-lg");
    expect(html).not.toContain("shrink-0");
    expect(html).not.toContain("container mx-auto");
    expect(html).not.toContain("pb-20");
  });

  it("uses the same bottom position for the new-meeting composer", () => {
    const html = renderToStaticMarkup(
      <MeetingSetupComposer onStart={() => null} starting={false} />,
    );

    expect(html).not.toContain("mb-2");
    expect(html).toContain('data-slot="meeting-composer-frame"');
    expect(html).toContain('data-slot="meeting-composer-row"');
    expect(html).toContain("rounded-md");
  });

  it("pins an overlay to the session pane without entering the scroll flow", () => {
    const html = renderToStaticMarkup(
      <MeetingRecordingSessionLayout
        main={<div>saved transcript</div>}
        overlay={<a href="/more">查看更多</a>}
      />,
    );

    expect(html).toContain("查看更多");
    expect(html).toContain("saved transcript");
  });

  it("does not mount a composer overlay for a saved session", () => {
    const html = renderToStaticMarkup(
      <MeetingRecordingSessionLayout main={<div>saved transcript</div>} />,
    );

    expect(html).toContain("saved transcript");
    expect(html).not.toContain("pointer-events-none absolute inset-x-0 bottom-0");
  });
});
