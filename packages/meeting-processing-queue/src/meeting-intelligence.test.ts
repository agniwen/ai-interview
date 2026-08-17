import { describe, expect, it, vi } from "vitest";
import {
  buildMeetingIntelligenceJobId,
  getMeetingIntelligenceQueueStats,
  meetingIntelligenceJobSchema,
  reconcileMeetingIntelligenceJob,
  resolveMeetingIntelligenceWorkerConcurrency,
} from "./meeting-intelligence";
import type { MeetingIntelligenceJobData } from "./meeting-intelligence";

const NO_JOB = undefined;

const job: MeetingIntelligenceJobData = { processingRunId: "intelligence-run-80" };

describe("Meeting Intelligence queue", () => {
  it("uses the durable processing run as the idempotent job identity", () => {
    expect(buildMeetingIntelligenceJobId(job)).toBe("meeting-intelligence-intelligence-run-80");
    expect(meetingIntelligenceJobSchema.safeParse(job).success).toBe(true);
    expect(meetingIntelligenceJobSchema.safeParse({ processingRunId: "" }).success).toBe(false);
  });

  it("defaults expensive intelligence generation to bounded concurrency", () => {
    expect(resolveMeetingIntelligenceWorkerConcurrency({})).toBe(4);
  });

  it("reports intelligence depth with its own concurrency", async () => {
    const currentQueue = {
      getJobCounts: () => Promise.resolve({ active: 4, delayed: 5, failed: 1, waiting: 9 }),
    };

    await expect(getMeetingIntelligenceQueueStats(currentQueue, {})).resolves.toEqual({
      active: 4,
      concurrency: 4,
      delayed: 5,
      failed: 1,
      waiting: 9,
    });
  });

  it("replaces a retained failed job during reconciliation", async () => {
    const remove = vi.fn(() => Promise.resolve());
    const queue = {
      add: vi.fn(() => Promise.resolve(NO_JOB)),
      getJob: vi.fn(() => Promise.resolve({ getState: () => Promise.resolve("failed"), remove })),
    };

    await reconcileMeetingIntelligenceJob(queue, job);

    expect(remove).toHaveBeenCalledOnce();
    expect(queue.add).toHaveBeenCalledWith(
      "generate-meeting-intelligence",
      job,
      expect.objectContaining({ jobId: buildMeetingIntelligenceJobId(job) }),
    );
  });
});
