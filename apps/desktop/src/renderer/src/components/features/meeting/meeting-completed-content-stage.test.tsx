import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MeetingCompletedContentStage } from "./meeting-completed-content-stage";

const summary = {
  captureId: "00000000-0000-4000-8000-000000000077",
  coveredThroughMs: 1000,
  coveredThroughTurnId: "turn-1",
  generatedAt: "2026-09-04T10:00:00.000Z",
  model: "summary-model",
  provider: "summary-provider",
  revision: 1,
  summary: "这是录制结束后优先展示的 Markdown 总结。",
  template: "general" as const,
  topics: [
    {
      endMs: 1000,
      evidenceTurnIds: ["turn-1"],
      id: "topic-1",
      points: [],
      startMs: 0,
      status: "active" as const,
      summary: "主题内容",
      title: "会议主题",
    },
  ],
};

describe("MeetingCompletedContentStage", () => {
  it("defaults to the persisted Markdown summary and offers all three views", () => {
    const html = renderToStaticMarkup(
      <MeetingCompletedContentStage summary={summary} transcript={<div>实时字幕正文</div>} />,
    );

    expect(html).toContain("这是录制结束后优先展示的 Markdown 总结。");
    expect(html).not.toContain("实时字幕正文");
    expect(html).toContain("Markdown 总结");
    expect(html).toContain("思维导图");
    expect(html).toContain("实时字幕");
  });

  it("falls back to the transcript when an old recording has no summary", () => {
    const html = renderToStaticMarkup(
      <MeetingCompletedContentStage summary={null} transcript={<div>旧录制字幕</div>} />,
    );

    expect(html).toContain("旧录制字幕");
  });
});
