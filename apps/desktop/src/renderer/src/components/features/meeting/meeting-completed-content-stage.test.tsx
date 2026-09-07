import { MeetingRecordingSessionLayout } from "./meeting-recording-session-layout";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MeetingLiveSummaryDocument } from "./meeting-live-summary-document";
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
      <MeetingCompletedContentStage summary={summary} transcript={<div>实时字幕正文</div>}>
        {({ toolbar, content }) => (
          <MeetingRecordingSessionLayout toolbar={toolbar} main={content} />
        )}
      </MeetingCompletedContentStage>,
    );

    expect(html).toContain("这是录制结束后优先展示的 Markdown 总结。");
    expect(html).not.toContain("实时字幕正文");
    expect(html).not.toContain('data-slot="meeting-completed-content-title"');
    expect(html).toContain("Markdown 总结");
    expect(html).toContain("思维导图");
    expect(html).toContain("实时字幕");
    const stageTag = html.match(
      /<section[^>]*data-slot="meeting-completed-content-stage"[^>]*>/,
    )?.[0];
    const headerTag = html.match(
      /<header[^>]*data-slot="meeting-completed-content-header"[^>]*>/,
    )?.[0];
    const documentTag = html.match(/<article[^>]*class="[^"]*max-w-3xl[^"]*"[^>]*>/)?.[0];
    expect(stageTag).toContain("w-full");
    expect(stageTag).not.toContain("max-w-3xl");
    expect(stageTag).not.toContain("px-4");
    expect(html.indexOf('data-slot="meeting-completed-content-header"')).toBeLessThan(
      html.indexOf('data-slot="scroll-area"'),
    );
    expect(headerTag).toContain("max-w-3xl");
    expect(headerTag).toContain("px-4");
    expect(headerTag).toContain("sm:px-6");
    expect(documentTag).toContain("w-full");
    expect(documentTag).toContain("px-4");
    expect(documentTag).toContain("sm:px-6");
  });

  it("falls back to the transcript when an old recording has no summary", () => {
    const html = renderToStaticMarkup(
      <MeetingCompletedContentStage summary={null} transcript={<div>旧录制字幕</div>}>
        {({ toolbar, content }) => (
          <MeetingRecordingSessionLayout toolbar={toolbar} main={content} />
        )}
      </MeetingCompletedContentStage>,
    );

    expect(html).toContain("旧录制字幕");
    expect(html).not.toContain('data-slot="meeting-completed-content-title"');
    const transcriptTag = html.match(
      /<div[^>]*data-slot="meeting-completed-transcript"[^>]*>/,
    )?.[0];
    expect(transcriptTag).toContain("max-w-3xl");
    expect(transcriptTag).toContain("px-4");
    expect(transcriptTag).toContain("sm:px-6");
  });
});

it.each(["meeting-live-summary-root", "topic-1", "point-1"])(
  "highlights only the selected summary node %s, even with shared evidence",
  (highlightedNodeId) => {
    const html = renderToStaticMarkup(
      <MeetingLiveSummaryDocument
        highlightedNodeId={highlightedNodeId}
        onEvidence={() => {}}
        snapshot={{
          captureId: summary.captureId,
          error: null,
          pendingCharacters: 0,
          status: "ready",
          summary: {
            ...summary,
            topics: summary.topics.map((topic) => ({
              ...topic,
              points: [
                {
                  endMs: 1000,
                  evidenceTurnIds: ["turn-1"],
                  id: "point-1",
                  kind: "fact",
                  startMs: 0,
                  text: "具体要点",
                },
              ],
            })),
          },
        }}
      />,
    );
    const highlightedTags = html.match(/<[^>]*data-highlighted="true"[^>]*>/g);
    expect(highlightedTags).toHaveLength(1);
    expect(highlightedTags?.[0]).toContain(`data-summary-node-id="${highlightedNodeId}"`);
  },
);
