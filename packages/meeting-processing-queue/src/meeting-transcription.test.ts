import { describe, expect, it, vi } from "vitest";
import {
  buildMeetingTranscriptionJobId,
  MEETING_TRANSCRIPTION_PIPELINE_VERSION,
  meetingTranscriptionJobSchema,
  getMeetingTranscriptionQueueStats,
  reconcileMeetingTranscriptionJob,
  resolveMeetingTranscriptionWorkerConcurrency,
} from "./meeting-transcription";
import type { MeetingTranscriptionJobData } from "./meeting-transcription";

const job: MeetingTranscriptionJobData = {
  meetingId: "meeting-76",
  model: "gpt-4o-transcribe-diarize",
  organizationId: "org-76",
  pipelineVersion: MEETING_TRANSCRIPTION_PIPELINE_VERSION,
  policyRevision: 3,
  provider: "openai" as const,
  region: "openai-default",
  sourceManifestSha256: "a".repeat(64),
};

describe("Meeting transcription queue", () => {
  it("uses the source and explicit provider snapshot in the idempotent job id", () => {
    const first = buildMeetingTranscriptionJobId(job);
    expect(first).toBe(buildMeetingTranscriptionJobId(job));
    expect(
      buildMeetingTranscriptionJobId({ ...job, sourceManifestSha256: "b".repeat(64) }),
    ).not.toBe(first);
    expect(buildMeetingTranscriptionJobId({ ...job, policyRevision: 4 })).not.toBe(first);
    expect(
      buildMeetingTranscriptionJobId({ ...job, pipelineVersion: "final-v2" as never }),
    ).not.toBe(first);
  });

  it("rejects a job without a provider, model, or region snapshot", () => {
    expect(meetingTranscriptionJobSchema.safeParse({ ...job, provider: undefined }).success).toBe(
      false,
    );
    expect(meetingTranscriptionJobSchema.safeParse({ ...job, model: "" }).success).toBe(false);
    expect(meetingTranscriptionJobSchema.safeParse({ ...job, region: "" }).success).toBe(false);
    expect(meetingTranscriptionJobSchema.safeParse({ ...job, provider: "deepgram" }).success).toBe(
      true,
    );
    expect(
      meetingTranscriptionJobSchema.safeParse({ ...job, provider: "native-payload" }).success,
    ).toBe(false);
  });

  it("defaults final transcription concurrency to the agreed capacity", () => {
    expect(resolveMeetingTranscriptionWorkerConcurrency({})).toBe(20);
  });

  it("reports queue depth separately from final transcription concurrency", async () => {
    const currentQueue = {
      getJobCounts: vi.fn(() => Promise.resolve({ active: 7, delayed: 3, failed: 2, waiting: 11 })),
    };

    await expect(getMeetingTranscriptionQueueStats(currentQueue, {})).resolves.toEqual({
      active: 7,
      concurrency: 20,
      delayed: 3,
      failed: 2,
      waiting: 11,
    });
  });

  it("replaces a retained failed job during reconciliation", async () => {
    const remove = vi.fn(() => Promise.resolve());
    const queue = {
      add: vi.fn(() => Promise.resolve()),
      getJob: vi.fn(() => Promise.resolve({ getState: () => Promise.resolve("failed"), remove })),
    };

    await reconcileMeetingTranscriptionJob(queue, job);

    expect(remove).toHaveBeenCalledOnce();
    expect(queue.add).toHaveBeenCalledWith(
      "transcribe-final-meeting",
      job,
      expect.objectContaining({ jobId: buildMeetingTranscriptionJobId(job) }),
    );
  });

  it("leaves an active retained job alone during reconciliation", async () => {
    const queue = {
      add: vi.fn(() => Promise.resolve()),
      getJob: vi.fn(() =>
        Promise.resolve({ getState: () => Promise.resolve("active"), remove: vi.fn() }),
      ),
    };

    await reconcileMeetingTranscriptionJob(queue, job);

    expect(queue.add).not.toHaveBeenCalled();
  });
});
