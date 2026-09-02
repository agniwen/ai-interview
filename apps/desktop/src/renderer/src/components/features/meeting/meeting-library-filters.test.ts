import { describe, expect, it } from "vitest";
import type { MeetingLibraryItem, TrashedMeetingItem } from "@app/shared/meeting-recording";
import {
  filterArchivedMeetings,
  filterMeetingRecords,
  paginateRecords,
} from "./meeting-library-filters";

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
  it("filters by processing state", () => {
    expect(
      filterMeetingRecords(meetings, {
        date: "",
        status: "processing",
      }).map((meeting) => meeting.id),
    ).toEqual(["meeting-b"]);
  });

  it("matches dates by the desktop Asia/Shanghai calendar day", () => {
    expect(
      filterMeetingRecords(meetings, {
        date: "2026-08-11",
        status: "all",
      }).map((meeting) => meeting.id),
    ).toEqual(["meeting-a", "meeting-b"]);
  });
});

const archived: TrashedMeetingItem[] = [
  {
    creator: { id: "creator-a", image: null, name: "Alice" },
    id: "archived-a",
    purgeAfter: "2026-08-18T16:30:00.000Z",
    savedAt: "2026-08-10T16:30:00.000Z",
    title: "录制记录-2608110030",
    trashedAt: "2026-08-11T16:30:00.000Z",
  },
  {
    creator: { id: "creator-a", image: null, name: "Alice" },
    id: "archived-b",
    purgeAfter: "2026-08-19T16:30:00.000Z",
    savedAt: "2026-08-10T16:30:00.000Z",
    title: "产品周会",
    trashedAt: "2026-08-12T16:30:00.000Z",
  },
];

describe("archived meeting search", () => {
  it("matches archived titles after stripping the default timestamp suffix", () => {
    expect(filterArchivedMeetings(archived, "录制记录").map((meeting) => meeting.id)).toEqual([
      "archived-a",
    ]);
    expect(filterArchivedMeetings(archived, "周会").map((meeting) => meeting.id)).toEqual([
      "archived-b",
    ]);
  });

  it("sorts archived records by archive date descending", () => {
    expect(filterArchivedMeetings(archived, "").map((meeting) => meeting.id)).toEqual([
      "archived-b",
      "archived-a",
    ]);
  });
});

describe("paginateRecords", () => {
  it("clamps the page and slices a stable window", () => {
    expect(paginateRecords(["a", "b", "c", "d", "e"], 2, 2)).toEqual({
      items: ["c", "d"],
      page: 2,
      total: 5,
      totalPages: 3,
    });
    expect(paginateRecords(["a", "b"], 9, 10)).toEqual({
      items: ["a", "b"],
      page: 1,
      total: 2,
      totalPages: 1,
    });
  });
});
