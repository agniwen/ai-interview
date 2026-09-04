import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MeetingLibraryItem } from "@app/shared/meeting-recording";
import {
  canRetryMeetingProcessing,
  meetingDetailRefetchInterval,
  playbackAuthorizationRefetchInterval,
} from "./meeting-detail-helpers";
import { MeetingPlaybackComposer } from "./meeting-audio-player";
import { MeetingDetailView, MeetingLibraryView } from "./meeting-library-view";
import { canCreateMeetingNotes } from "./meeting-notes-panel";
import { canManageMeetingSharing } from "./meeting-share-panel";
import { meetingLibraryRefetchInterval } from "./use-meeting-library";

const item: MeetingLibraryItem = {
  accessRole: "owner",
  creator: { id: "user-74", image: null, name: "Alice" },
  durationMs: 62_000,
  id: "meeting-74",
  processingState: "processing",
  recordingAvailable: false,
  savedAt: "2026-08-09T04:00:00.000Z",
  title: "录制记录-2608091200",
  workspaceCustodied: false,
};

describe("Meeting Library views", () => {
  it("renders a bounded search snippet and transcript time range", () => {
    const html = renderToStaticMarkup(
      <MeetingLibraryView
        meetings={[item]}
        searchMatches={{
          [item.id]: {
            endMs: 34_000,
            kind: "transcript",
            snippet: "主持人：客户预算需要在本周确认",
            startMs: 30_000,
          },
        }}
      />,
    );

    expect(html).toContain("客户预算需要在本周确认");
    expect(html).toContain("00:30–00:34");
  });

  it("keeps viewers read-only while editors can author notes without managing sharing", () => {
    expect(canCreateMeetingNotes("viewer")).toBe(false);
    expect(canManageMeetingSharing("viewer")).toBe(false);
    expect(canCreateMeetingNotes("editor")).toBe(true);
    expect(canManageMeetingSharing("editor")).toBe(false);
    expect(canRetryMeetingProcessing("editor")).toBe(false);
    expect(canRetryMeetingProcessing("owner")).toBe(true);
    expect(canManageMeetingSharing("owner")).toBe(true);
    expect(canManageMeetingSharing("administrator")).toBe(true);
  });

  it("keeps observing retryable failures and refreshes playback authorization before expiry", () => {
    expect(meetingLibraryRefetchInterval([{ ...item, processingState: "processing" }])).toBe(5000);
    expect(meetingLibraryRefetchInterval([{ ...item, processingState: "failed" }])).toBe(30_000);
    expect(
      meetingDetailRefetchInterval({
        ...item,
        archived: false,
        processingState: "failed",
        startedAt: "2026-08-09T03:59:00.000Z",
        verifiedAt: null,
      }),
    ).toBe(30_000);
    expect(
      playbackAuthorizationRefetchInterval(
        { expiresAt: "2026-08-09T04:05:00.000Z", url: "https://r2.invalid/playback.webm" },
        Date.parse("2026-08-09T04:00:00.000Z"),
      ),
    ).toBe(240_000);
  });

  it("renders title, duration and processing availability without a creator column", () => {
    const html = renderToStaticMarkup(<MeetingLibraryView meetings={[item]} />);

    expect(html).toContain("录制名称");
    expect(html).toContain("处理中");
    expect(html).toContain('aria-label="录制记录表格"');
    expect(html).toContain('data-variant="default"');
    expect(html).toContain("录制记录");
    expect(html).not.toContain("录制记录-2608091200");
    expect(html).not.toContain("创建者");
    expect(html).not.toContain("Alice");
    expect(html).toContain("01:02");
  });

  it("only renders a seekable audio player after playback authorization", () => {
    const processing = renderToStaticMarkup(
      <MeetingDetailView
        meeting={{
          ...item,
          archived: false,
          startedAt: "2026-08-09T03:59:00.000Z",
          verifiedAt: null,
        }}
        playback={null}
        seekToSeconds={30}
      />,
    );
    expect(processing).not.toContain('data-slot="meeting-audio-player"');

    const ready = renderToStaticMarkup(
      <MeetingDetailView
        meeting={{
          ...item,
          archived: false,
          processingState: "ready",
          recordingAvailable: true,
          startedAt: "2026-08-09T03:59:00.000Z",
          verifiedAt: "2026-08-09T04:01:00.000Z",
        }}
        playback={{
          expiresAt: "2026-08-09T04:06:00.000Z",
          url: "https://r2.invalid/playback.webm",
        }}
        seekToSeconds={30}
      />,
    );
    expect(ready).toContain('data-slot="meeting-audio-player"');
    expect(ready).toContain('data-slot="meeting-playback-waveform-row"');
    expect(ready).toContain('data-slot="meeting-playback-controls"');
    expect(ready).toContain('aria-label="播放"');
    expect(ready).toContain('aria-label="当前播放时间 0:00，总时长 --:--"');
    expect(ready).toContain('aria-label="录音进度"');
    expect(ready).toContain('aria-label="播放倍速"');
    expect(ready).not.toContain('controls=""');

    const composer = renderToStaticMarkup(
      <MeetingPlaybackComposer
        playback={{
          expiresAt: "2026-08-09T04:06:00.000Z",
          url: "https://r2.invalid/playback.webm",
        }}
      />,
    );
    expect(composer).not.toContain('data-slot="meeting-composer-frame"');
    expect(composer).toContain("w-[4.8rem] rounded-full");
    expect(composer).toContain("bg-primary/10 text-primary");
  });

  it("offers an explicit retry after automatic processing attempts are exhausted", () => {
    const failed = renderToStaticMarkup(
      <MeetingDetailView
        meeting={{
          ...item,
          archived: false,
          processingState: "failed",
          startedAt: "2026-08-09T03:59:00.000Z",
          verifiedAt: null,
        }}
        onRetryProcessing={() => {}}
        playback={null}
      />,
    );

    expect(failed).toContain("重试生成播放音频");
    expect(failed).toContain("可播放录音生成失败");
    expect(failed).toContain("原始双轨录音仍然保留");
  });
});
