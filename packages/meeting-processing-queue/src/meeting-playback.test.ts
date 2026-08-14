import { describe, expect, it } from "vitest";
import {
  buildMeetingPlaybackQueuePrefix,
  buildMeetingPlaybackJobId,
  getMeetingPlaybackQueueStats,
  meetingPlaybackJobSchema,
  resolveMeetingPlaybackWorkerConcurrency,
} from "./meeting-playback";

describe("Meeting playback queue contract", () => {
  it("builds one stable BullMQ job id per Meeting Session", () => {
    expect(buildMeetingPlaybackJobId({ meetingId: "meeting:74", organizationId: "org" })).toBe(
      "meeting-playback-meeting-74",
    );
  });

  it("validates queue payloads and keeps processing concurrency explicit", () => {
    expect(
      meetingPlaybackJobSchema.parse({ meetingId: "meeting-74", organizationId: "org-74" }),
    ).toEqual({ meetingId: "meeting-74", organizationId: "org-74" });
    expect(
      resolveMeetingPlaybackWorkerConcurrency({ MEETING_PLAYBACK_WORKER_CONCURRENCY: "3" }),
    ).toBe(3);
    expect(
      resolveMeetingPlaybackWorkerConcurrency({ MEETING_PLAYBACK_WORKER_CONCURRENCY: "0" }),
    ).toBe(2);
  });

  it("isolates queues by database unless an explicit shared prefix is configured", () => {
    const first = buildMeetingPlaybackQueuePrefix({
      DATABASE_URL: "postgres://app:secret@db.internal:5432/production",
    });
    const second = buildMeetingPlaybackQueuePrefix({
      DATABASE_URL: "postgres://app:secret@db.internal:5432/staging",
    });
    expect(first).not.toBe(second);
    expect(first).not.toContain("secret");
    expect(buildMeetingPlaybackQueuePrefix({ MEETING_PLAYBACK_QUEUE_PREFIX: "meeting-prod" })).toBe(
      "meeting-prod",
    );
  });

  it("reports media-finalization depth with its own concurrency", async () => {
    const currentQueue = {
      getJobCounts: () => Promise.resolve({ active: 2, delayed: 1, failed: 4, waiting: 8 }),
    };

    await expect(getMeetingPlaybackQueueStats(currentQueue, {})).resolves.toEqual({
      active: 2,
      concurrency: 2,
      delayed: 1,
      failed: 4,
      waiting: 8,
    });
  });
});
