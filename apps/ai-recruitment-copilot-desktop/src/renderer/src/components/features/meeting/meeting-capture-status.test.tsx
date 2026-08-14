import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MeetingInterruptedComposer } from "./meeting-capture-status";

describe("MeetingInterruptedComposer", () => {
  it("offers continuing or ending through the normal background upload path", () => {
    const html = renderToStaticMarkup(
      <MeetingInterruptedComposer onContinue={vi.fn()} onSave={vi.fn()} />,
    );

    expect(html).toContain("继续");
    expect(html).toContain("结束");
    expect(html).not.toContain("结束并上传");
  });
});
