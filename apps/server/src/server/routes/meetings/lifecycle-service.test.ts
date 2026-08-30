import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listTrashedSavedMeetings,
  permanentlyPurgeSavedMeeting,
  trashSavedMeeting,
} from "./lifecycle-service";
import type { MeetingLifecycleDependencies } from "./lifecycle-service";

const mocks = {
  enqueueMeetingPurgeJobs: vi.fn<MeetingLifecycleDependencies["enqueueMeetingPurgeJobs"]>(),
  isMeetingPurgeQueueConfigured: vi.fn<
    MeetingLifecycleDependencies["isMeetingPurgeQueueConfigured"]
  >(() => true),
  listTrashedMeetingSessions: vi.fn<MeetingLifecycleDependencies["listTrashedMeetingSessions"]>(),
  requestMeetingPurge: vi.fn<MeetingLifecycleDependencies["requestMeetingPurge"]>(),
  restoreMeetingSession: vi.fn<MeetingLifecycleDependencies["restoreMeetingSession"]>(),
  trashMeetingSession: vi.fn<MeetingLifecycleDependencies["trashMeetingSession"]>(),
};

const dependencies: MeetingLifecycleDependencies = mocks;

const INPUT = { actorId: "user-84", meetingId: "meeting-84", organizationId: "org-84" };

describe("Meeting lifecycle service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a stable seven-day deadline for idempotent trash requests", async () => {
    mocks.trashMeetingSession.mockResolvedValue({
      purgeAfter: new Date("2026-08-16T08:00:00.000Z"),
      state: "already-trashed",
    });

    await expect(trashSavedMeeting(INPUT, dependencies)).resolves.toEqual({
      purgeAfter: "2026-08-16T08:00:00.000Z",
      state: "already-trashed",
    });
  });

  it("enqueues an authorized permanent purge and leaves Redis failures recoverable", async () => {
    mocks.requestMeetingPurge.mockResolvedValue({ state: "purging" });
    mocks.enqueueMeetingPurgeJobs.mockRejectedValueOnce(new Error("redis unavailable"));

    await expect(permanentlyPurgeSavedMeeting(INPUT, dependencies)).resolves.toEqual({
      state: "purging",
    });
    expect(mocks.enqueueMeetingPurgeJobs).toHaveBeenCalledWith([
      { meetingId: "meeting-84", organizationId: "org-84" },
    ]);
  });

  it("serializes only complete trash records", async () => {
    mocks.listTrashedMeetingSessions.mockResolvedValue({
      records: [
        {
          creatorId: "user-84",
          creatorImage: null,
          creatorName: "Wen",
          id: "meeting-84",
          purgeAfter: new Date("2026-08-16T08:00:00.000Z"),
          savedAt: new Date("2026-08-09T08:00:00.000Z"),
          title: "产品例会",
          trashedAt: new Date("2026-08-09T09:00:00.000Z"),
        },
        {
          creatorId: "invalid",
          creatorImage: null,
          creatorName: "Invalid",
          id: "invalid",
          purgeAfter: null,
          savedAt: new Date(),
          title: "invalid",
          trashedAt: null,
        },
      ],
      total: 1,
    });

    await expect(
      listTrashedSavedMeetings(
        {
          actorId: INPUT.actorId,
          organizationId: INPUT.organizationId,
          page: 1,
          pageSize: 10,
          search: "",
          sortBy: "trashedAt",
          sortOrder: "desc",
        },
        dependencies,
      ),
    ).resolves.toEqual({
      page: 1,
      pageSize: 10,
      records: [
        {
          creator: { id: "user-84", image: null, name: "Wen" },
          id: "meeting-84",
          purgeAfter: "2026-08-16T08:00:00.000Z",
          savedAt: "2026-08-09T08:00:00.000Z",
          title: "产品例会",
          trashedAt: "2026-08-09T09:00:00.000Z",
        },
      ],
      total: 1,
      totalPages: 1,
    });
  });
});
