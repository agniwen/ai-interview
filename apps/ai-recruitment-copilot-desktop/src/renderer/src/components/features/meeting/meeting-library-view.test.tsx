import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { MeetingLibraryItem } from "@arc/shared/meeting-recording";
import {
  canRetryMeetingProcessing,
  meetingDetailRefetchInterval,
  playbackAuthorizationRefetchInterval,
} from "./meeting-detail-page";
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

  it("renders title, creator, duration and processing availability", () => {
    const html = renderToStaticMarkup(<MeetingLibraryView meetings={[item]} />);

    expect(html).toContain("录制记录-2608091200");
    expect(html).toContain("Alice");
    expect(html).toContain("01:02");
    expect(html).toContain("处理中");
  });

  it("only renders a seekable audio player after playback authorization", () => {
    const processing = renderToStaticMarkup(
      <MeetingDetailView
        meeting={{ ...item, startedAt: "2026-08-09T03:59:00.000Z", verifiedAt: null }}
        playback={null}
        seekToSeconds={30}
      />,
    );
    expect(processing).not.toContain("<audio");

    const ready = renderToStaticMarkup(
      <MeetingDetailView
        meeting={{
          ...item,
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
    expect(ready).toContain("<audio");
    expect(ready).toContain('controls=""');
    expect(ready).toContain("https://r2.invalid/playback.webm");
  });

  it("offers an explicit retry after automatic processing attempts are exhausted", () => {
    const failed = renderToStaticMarkup(
      <MeetingDetailView
        meeting={{
          ...item,
          processingState: "failed",
          startedAt: "2026-08-09T03:59:00.000Z",
          verifiedAt: null,
        }}
        onRetryProcessing={() => {}}
        playback={null}
      />,
    );

    expect(failed).toContain("重试处理");
    expect(failed).toContain("原始双轨录音仍然保留");
  });
});
