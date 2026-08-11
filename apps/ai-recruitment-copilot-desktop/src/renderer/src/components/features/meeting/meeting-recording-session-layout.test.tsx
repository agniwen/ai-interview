import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MeetingRecordingSessionLayout } from "./meeting-recording-session-layout";

describe("MeetingRecordingSessionLayout", () => {
  it("keeps the scrollbar at the content edge and constrains only the inner content", () => {
    const html = renderToStaticMarkup(
      <MeetingRecordingSessionLayout composer={<div>composer</div>} main={<div>messages</div>} />,
    );

    expect(html).toContain('class="relative flex w-full flex-col overflow-hidden"');
    expect(html).toContain('class="container mx-auto');
  });
});
