import { describe, expect, it } from "vitest";
import type { MeetingLibraryItem } from "@arc/shared/meeting-recording";
import { filterMeetingRecords } from "./meeting-library-filters";

const meetings: MeetingLibraryItem[] = [
  {
    accessRole: "owner",
    creator: { id: "creator-a", image: null, name: "Alice" },
    durationMs: 60_000,
    id: "meeting-a",
    processingState: "ready",
    recordingAvailable: true,
    savedAt: "2026-08-10T16:30:00.000Z",
    title: "跨日会议",
    workspaceCustodied: false,
  },
  {
    accessRole: "owner",
    creator: { id: "creator-b", image: null, name: "Bob" },
    durationMs: 30_000,
    id: "meeting-b",
    processingState: "processing",
    recordingAvailable: false,
    savedAt: "2026-08-11T03:00:00.000Z",
    title: "处理中会议",
    workspaceCustodied: false,
  },
];

describe("Meeting library filters", () => {
  it("combines creator and processing-state filters", () => {
    expect(
      filterMeetingRecords(meetings, {
        creatorId: "creator-b",
        date: "",
        status: "processing",
      }).map((meeting) => meeting.id),
    ).toEqual(["meeting-b"]);
  });

  it("matches dates by the desktop Asia/Shanghai calendar day", () => {
    expect(
      filterMeetingRecords(meetings, {
        creatorId: "",
        date: "2026-08-11",
        status: "all",
      }).map((meeting) => meeting.id),
    ).toEqual(["meeting-a", "meeting-b"]);
  });
});
