/* oxlint-disable no-useless-undefined, require-await -- Async mocks implement dependency contracts without external effects. */
import { describe, expect, it, vi } from "vitest";
import type { CancelledMeetingCalendarSyncDependencies } from "./sync-cancelled-human-interview-meetings";
import {
  retryFailedCancelledHumanInterviewMeetingCalendars,
  syncCancelledHumanInterviewMeetingCalendars,
} from "./sync-cancelled-human-interview-meetings";

function createDependencies(): CancelledMeetingCalendarSyncDependencies {
  return {
    getAccessToken: vi.fn(async () => "tenant-token"),
    isEnabled: () => true,
    listRetryableMeetings: vi.fn(async () => []),
    loadMeeting: vi.fn(async (meetingId) => ({
      feishu: { providerId: "feishu-jiguang-hr" as const },
      id: meetingId,
    })),
    recordFailure: vi.fn(async ({ error }) => ({
      message: error instanceof Error ? error.message : "飞书日程同步失败。",
      status: "failed" as const,
    })),
    syncMeeting: vi.fn(async () => undefined),
  };
}

describe("cancelled human interview calendar sync", () => {
  it("continues syncing later meetings after one Feishu deletion fails", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.syncMeeting)
      .mockRejectedValueOnce(new Error("first deletion failed"))
      .mockResolvedValueOnce(undefined);

    const failure = await syncCancelledHumanInterviewMeetingCalendars(
      { meetingIds: ["meeting-1", "meeting-2"], organizationId: "org-1" },
      dependencies,
    );

    expect(failure).toEqual({
      meetingId: "meeting-1",
      message: "first deletion failed",
      status: "failed",
    });
    expect(dependencies.syncMeeting).toHaveBeenCalledTimes(2);
    expect(dependencies.syncMeeting).toHaveBeenLastCalledWith({
      accessToken: "tenant-token",
      meetingId: "meeting-2",
      organizationId: "org-1",
      providerId: "feishu-jiguang-hr",
    });
  });

  it("retries every due cancelled calendar and reports aggregate results", async () => {
    const dependencies = createDependencies();
    vi.mocked(dependencies.listRetryableMeetings).mockResolvedValue([
      { meetingId: "meeting-1", organizationId: "org-1" },
      { meetingId: "meeting-2", organizationId: "org-2" },
    ]);
    vi.mocked(dependencies.syncMeeting)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("second deletion failed"));

    await expect(
      retryFailedCancelledHumanInterviewMeetingCalendars(
        { now: new Date("2026-09-11T02:00:00.000Z") },
        dependencies,
      ),
    ).resolves.toEqual({ attempted: 2, failed: 1, synced: 1 });
    expect(dependencies.listRetryableMeetings).toHaveBeenCalledWith({
      limit: 20,
      now: new Date("2026-09-11T02:00:00.000Z"),
    });
  });
});
