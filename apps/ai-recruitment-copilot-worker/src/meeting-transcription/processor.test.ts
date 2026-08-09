import { describe, expect, it, vi } from "vitest";
import { MeetingProviderQuotaError } from "@arc/ai-recruitment-copilot-backend/server/routes/meetings/transcription/provider";
import type { MeetingTranscriptionDependencies } from "./processor";

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/s3", () => ({
  downloadMeetingRecordingObjectToFile: vi.fn(),
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/meetings/transcription/dao", () => ({
  claimMeetingTranscriptionChunk: vi.fn(),
  claimMeetingTranscriptionRun: vi.fn(),
  loadMeetingTranscriptionChunkCheckpoint: vi.fn(),
  loadMeetingTranscriptionSource: vi.fn(),
  markMeetingTranscriptionChunkFailed: vi.fn(),
  markMeetingTranscriptionFailed: vi.fn(),
  publishMeetingTranscript: vi.fn(),
  saveMeetingTranscriptionChunkCheckpoint: vi.fn(),
}));
vi.mock(
  "@arc/ai-recruitment-copilot-backend/server/routes/meetings/transcription/providers/openai",
  () => ({ createOpenAiMeetingTranscriptionProvider: vi.fn(() => ({ transcribeFinal: vi.fn() })) }),
);
vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/meetings/intelligence/service", () => ({
  requestAutomaticMeetingIntelligence: vi.fn(),
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() for hoisting.
import {
  assertMeetingTranscriptionFfmpegVersion,
  runMeetingTranscriptionProcessing,
} from "./processor";

const job = {
  meetingId: "meeting-76",
  model: "gpt-4o-transcribe-diarize",
  organizationId: "org-76",
  pipelineVersion: "final-v1" as const,
  policyRevision: 1,
  provider: "openai" as const,
  region: "openai-default",
  sourceManifestSha256: "a".repeat(64),
};

function createDependencies() {
  return {
    claim: vi.fn<MeetingTranscriptionDependencies["claim"]>(() => Promise.resolve("claimed")),
    claimChunk: vi.fn<MeetingTranscriptionDependencies["claimChunk"]>(() =>
      Promise.resolve({ status: "claimed" }),
    ),
    createRunId: vi.fn(() => "run-76"),
    createWorkingDirectory: vi.fn(() => Promise.resolve("/tmp/meeting-76")),
    downloadSource: vi.fn(() => Promise.resolve()),
    ensureDiskCapacity: vi.fn(() => Promise.resolve()),
    loadSource: vi.fn(() =>
      Promise.resolve({
        assets: [
          {
            contentType: "audio/webm;codecs=opus",
            durationMs: 60_000,
            sizeBytes: 100,
            status: "ready",
            storageKey: "microphone.webm",
            track: "microphone" as const,
          },
          {
            contentType: "audio/webm;codecs=opus",
            durationMs: 62_000,
            sizeBytes: 100,
            status: "ready",
            storageKey: "system.webm",
            track: "system" as const,
          },
        ],
        id: "meeting-76",
        manifestSha256: "a".repeat(64),
        organizationId: "org-76",
      }),
    ),
    markChunkFailed: vi.fn<MeetingTranscriptionDependencies["markChunkFailed"]>(() =>
      Promise.resolve(),
    ),
    markFailed: vi.fn<MeetingTranscriptionDependencies["markFailed"]>(() => Promise.resolve(true)),
    prepareChunks: vi.fn(() =>
      Promise.resolve([
        {
          contentType: "audio/webm",
          endMs: 60_000,
          filePath: "/tmp/meeting-76/microphone-000.webm",
          index: 0,
          startMs: 0,
          track: "microphone" as const,
        },
        {
          contentType: "audio/webm",
          endMs: 62_000,
          filePath: "/tmp/meeting-76/system-000.webm",
          index: 0,
          startMs: 0,
          track: "system" as const,
        },
      ]),
    ),
    provider: {
      transcribeFinal: vi.fn(() =>
        Promise.resolve({
          language: "zh",
          turns: [
            {
              confidence: null,
              endMs: 2000,
              speakerKey: "local",
              startMs: 1000,
              text: "你好",
              track: "local" as const,
            },
          ],
        }),
      ),
    },
    publish: vi.fn(() => Promise.resolve(true)),
    removeWorkingDirectory: vi.fn(() => Promise.resolve()),
    requestIntelligence: vi.fn(() => Promise.resolve()),
    saveChunkCheckpoint: vi.fn((_input, _chunk, transcript) => Promise.resolve(transcript)),
    withMediaPermit: vi.fn((requiredBytes, task) => task(requiredBytes)),
  };
}

describe("Meeting final transcription processor", () => {
  it("requires the pinned FFmpeg version prefix", () => {
    expect(() => assertMeetingTranscriptionFfmpegVersion("ffmpeg version 5.1.9")).toThrow(
      "is required",
    );
    expect(() =>
      assertMeetingTranscriptionFfmpegVersion("ffmpeg version 8.0", "ffmpeg version 5.1.9"),
    ).toThrow("version mismatch");
    expect(() =>
      assertMeetingTranscriptionFfmpegVersion("ffmpeg version 5.1.9", "ffmpeg version 5.1.9"),
    ).not.toThrow();
  });

  it("uses only complete verified microphone/system assets and publishes canonical turns", async () => {
    const dependencies = createDependencies();

    await runMeetingTranscriptionProcessing(job, { attempt: 2, maxAttempts: 5 }, dependencies);

    expect(dependencies.claim).toHaveBeenCalledWith({
      ...job,
      attempt: 2,
      processingRunId: "run-76",
    });
    expect(dependencies.downloadSource).toHaveBeenCalledTimes(2);
    expect(dependencies.ensureDiskCapacity).toHaveBeenCalledWith({
      directory: "/tmp/meeting-76",
      requiredBytes: 400,
    });
    expect(dependencies.provider.transcribeFinal).toHaveBeenCalledTimes(2);
    const chunks = await dependencies.prepareChunks.mock.results[0]?.value;
    expect(dependencies.provider.transcribeFinal).toHaveBeenNthCalledWith(1, {
      chunks: [chunks?.[0]],
      languageHint: null,
      model: job.model,
      region: job.region,
    });
    expect(dependencies.saveChunkCheckpoint).toHaveBeenCalledTimes(2);
    expect(dependencies.publish).toHaveBeenCalledWith({
      ...job,
      processingRunId: "run-76",
      transcript: expect.objectContaining({
        turns: expect.arrayContaining([expect.objectContaining({ text: "你好" })]),
      }),
    });
    expect(dependencies.requestIntelligence).toHaveBeenCalledWith({
      meetingId: job.meetingId,
      organizationId: job.organizationId,
    });
  });

  it("does not fail the published transcript when automatic intelligence enqueue fails", async () => {
    const dependencies = createDependencies();
    dependencies.requestIntelligence.mockRejectedValueOnce(new Error("queue unavailable"));

    await expect(
      runMeetingTranscriptionProcessing(job, { attempt: 1, maxAttempts: 5 }, dependencies),
    ).resolves.toBeUndefined();

    expect(dependencies.publish).toHaveBeenCalledOnce();
    expect(dependencies.markFailed).not.toHaveBeenCalled();
  });

  it("does not call the provider after a duplicate delivery finds a published revision", async () => {
    const dependencies = createDependencies();
    dependencies.claim.mockResolvedValueOnce("already-ready");

    await runMeetingTranscriptionProcessing(job, { attempt: 3, maxAttempts: 5 }, dependencies);

    expect(dependencies.provider.transcribeFinal).not.toHaveBeenCalled();
    expect(dependencies.createWorkingDirectory).not.toHaveBeenCalled();
    expect(dependencies.requestIntelligence).toHaveBeenCalledWith({
      meetingId: job.meetingId,
      organizationId: job.organizationId,
    });
  });

  it("resumes from a durable chunk checkpoint without repeating that provider request", async () => {
    const dependencies = createDependencies();
    dependencies.claimChunk.mockResolvedValueOnce({
      status: "ready",
      transcript: {
        language: "zh",
        turns: [
          {
            confidence: null,
            endMs: 2000,
            speakerKey: "local",
            startMs: 1000,
            text: "已完成分片",
            track: "local",
          },
        ],
      },
    });

    await runMeetingTranscriptionProcessing(job, { attempt: 2, maxAttempts: 5 }, dependencies);

    expect(dependencies.provider.transcribeFinal).toHaveBeenCalledTimes(1);
    expect(dependencies.saveChunkCheckpoint).toHaveBeenCalledTimes(1);
    expect(dependencies.publish).toHaveBeenCalledWith(
      expect.objectContaining({
        transcript: expect.objectContaining({
          turns: expect.arrayContaining([expect.objectContaining({ text: "已完成分片" })]),
        }),
      }),
    );
  });

  it("records a failed processing run without publishing a partial transcript", async () => {
    const dependencies = createDependencies();
    dependencies.provider.transcribeFinal.mockRejectedValueOnce(new Error("provider unavailable"));

    await expect(
      runMeetingTranscriptionProcessing(job, { attempt: 1, maxAttempts: 5 }, dependencies),
    ).rejects.toThrow("provider unavailable");

    expect(dependencies.publish).not.toHaveBeenCalled();
    expect(dependencies.markFailed).toHaveBeenCalledWith({
      ...job,
      errorCode: "provider-error",
      errorMessage: "provider unavailable",
      processingRunId: "run-76",
      terminal: false,
    });
    expect(dependencies.markChunkFailed).toHaveBeenCalledTimes(1);
  });

  it("records provider quota exhaustion separately while preserving the saved meeting", async () => {
    const dependencies = createDependencies();
    dependencies.provider.transcribeFinal.mockRejectedValueOnce(new MeetingProviderQuotaError());

    await expect(
      runMeetingTranscriptionProcessing(job, { attempt: 5, maxAttempts: 5 }, dependencies),
    ).rejects.toBeInstanceOf(MeetingProviderQuotaError);

    expect(dependencies.publish).not.toHaveBeenCalled();
    expect(dependencies.markFailed).toHaveBeenCalledWith({
      ...job,
      errorCode: "provider-quota",
      errorMessage: "Meeting transcription provider quota is exhausted",
      processingRunId: "run-76",
      terminal: true,
    });
  });

  it("does not call the provider when another delivery owns the chunk", async () => {
    const dependencies = createDependencies();
    dependencies.claimChunk.mockResolvedValueOnce({ status: "busy" });

    await expect(
      runMeetingTranscriptionProcessing(job, { attempt: 2, maxAttempts: 5 }, dependencies),
    ).rejects.toThrow("already processing");

    expect(dependencies.provider.transcribeFinal).not.toHaveBeenCalled();
  });

  it("keeps an ambiguous provider success claimed when checkpoint persistence fails", async () => {
    const dependencies = createDependencies();
    dependencies.saveChunkCheckpoint.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(
      runMeetingTranscriptionProcessing(job, { attempt: 2, maxAttempts: 5 }, dependencies),
    ).rejects.toThrow("database unavailable");

    expect(dependencies.provider.transcribeFinal).toHaveBeenCalledTimes(1);
    expect(dependencies.markChunkFailed).not.toHaveBeenCalled();
  });

  it("does not mask the provider error when releasing its chunk claim fails", async () => {
    const dependencies = createDependencies();
    dependencies.provider.transcribeFinal.mockRejectedValueOnce(new Error("provider unavailable"));
    dependencies.markChunkFailed.mockRejectedValueOnce(new Error("database unavailable"));

    await expect(
      runMeetingTranscriptionProcessing(job, { attempt: 2, maxAttempts: 5 }, dependencies),
    ).rejects.toThrow("provider unavailable");
  });

  it("marks the last BullMQ attempt as terminal", async () => {
    const dependencies = createDependencies();
    dependencies.provider.transcribeFinal.mockRejectedValueOnce(new Error("unsupported audio"));

    await expect(
      runMeetingTranscriptionProcessing(job, { attempt: 5, maxAttempts: 5 }, dependencies),
    ).rejects.toThrow("unsupported audio");

    expect(dependencies.markFailed).toHaveBeenCalledWith({
      ...job,
      errorCode: "provider-error",
      errorMessage: "unsupported audio",
      processingRunId: "run-76",
      terminal: true,
    });
  });
});
