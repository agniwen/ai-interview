import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  enqueueMeetingPurgeJobs: vi.fn(),
  isMeetingPurgeQueueConfigured: vi.fn(() => true),
  listTrashedMeetingSessions: vi.fn(),
  requestMeetingPurge: vi.fn(),
  restoreMeetingSession: vi.fn(),
  trashMeetingSession: vi.fn(),
}));

vi.mock("@arc/meeting-processing-queue/meeting-purge", () => ({
  enqueueMeetingPurgeJobs: mocks.enqueueMeetingPurgeJobs,
  isMeetingPurgeQueueConfigured: mocks.isMeetingPurgeQueueConfigured,
}));
vi.mock("./lifecycle-dao", () => ({
  listTrashedMeetingSessions: mocks.listTrashedMeetingSessions,
  requestMeetingPurge: mocks.requestMeetingPurge,
  restoreMeetingSession: mocks.restoreMeetingSession,
  trashMeetingSession: mocks.trashMeetingSession,
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() for hoisting.
import {
  listTrashedSavedMeetings,
  permanentlyPurgeSavedMeeting,
  trashSavedMeeting,
} from "./lifecycle-service";

const INPUT = { actorId: "user-84", meetingId: "meeting-84", organizationId: "org-84" };

describe("Meeting lifecycle service", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns a stable seven-day deadline for idempotent trash requests", async () => {
    mocks.trashMeetingSession.mockResolvedValue({
      purgeAfter: new Date("2026-08-16T08:00:00.000Z"),
      state: "already-trashed",
    });

    await expect(trashSavedMeeting(INPUT)).resolves.toEqual({
      purgeAfter: "2026-08-16T08:00:00.000Z",
      state: "already-trashed",
    });
  });

  it("enqueues an authorized permanent purge and leaves Redis failures recoverable", async () => {
    mocks.requestMeetingPurge.mockResolvedValue({ state: "purging" });
    mocks.enqueueMeetingPurgeJobs.mockRejectedValueOnce(new Error("redis unavailable"));

    await expect(permanentlyPurgeSavedMeeting(INPUT)).resolves.toEqual({ state: "purging" });
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
      listTrashedSavedMeetings({
        actorId: INPUT.actorId,
        organizationId: INPUT.organizationId,
        page: 1,
        pageSize: 10,
        search: "",
        sortBy: "trashedAt",
        sortOrder: "desc",
      }),
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
