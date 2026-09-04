import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  INITIAL_LIVE_DRAFT_SNAPSHOT,
  INITIAL_LIVE_SUMMARY_SNAPSHOT,
} from "./meeting-recording-store";
import { MeetingLiveSessionStage } from "./meeting-live-session-stage";

describe("MeetingLiveSessionStage", () => {
  it("shows the transcript and realtime summary side by side without a top-level tab", () => {
    const html = renderToStaticMarkup(
      <MeetingLiveSessionStage
        composer={<div>录制控制</div>}
        header={<h1>测试会议</h1>}
        summary={{ ...INITIAL_LIVE_SUMMARY_SNAPSHOT, status: "waiting" }}
        transcript={{ ...INITIAL_LIVE_DRAFT_SNAPSHOT, status: "live" }}
      />,
    );

    expect(html).toContain("录制草稿");
    expect(html).toContain("测试会议");
    expect(html).toContain("录制控制");
    expect(html).toContain("实时总结");
    expect(html).toContain("调整实时字幕和实时总结宽度");
    expect(html).toContain("思维导图形式");
    expect(html).toContain("文档形式");
    expect(html).toContain("app-no-drag");
    expect(html).toContain("app-region:no-drag");
    expect(html).not.toContain('role="tablist"');
  });
});
