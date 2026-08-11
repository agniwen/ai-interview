import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MeetingSetupComposer } from "./meeting-capture-status";
import { MeetingRecordingSessionLayout } from "./meeting-recording-session-layout";

describe("MeetingRecordingSessionLayout", () => {
  it("keeps the scroll area full-width relative to the sidebar content pane", () => {
    const html = renderToStaticMarkup(
      <MeetingRecordingSessionLayout composer={<div>composer</div>} main={<div>messages</div>} />,
    );

    expect(html).toContain('class="relative flex w-full flex-col overflow-hidden"');
    expect(html).toContain(
      'data-overlayscrollbars-contents=""><div class="h-full min-h-full pt-4"',
    );
    expect(html).toContain("pointer-events-none absolute inset-x-0 bottom-0");
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
  });
});
