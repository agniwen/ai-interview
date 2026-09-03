import { describe, expect, it, vi } from "vitest";
import { runHumanInterviewRecordingProcessing } from "./processor";

describe("runHumanInterviewRecordingProcessing", () => {
  it("验证并入库 mixed 音频后复用统一转录队列", async () => {
    const ingest = vi.fn(() =>
      Promise.resolve({ meetingSessionId: "session-1", organizationId: "org-1" }),
    );
    const enqueueTranscription = vi.fn(() => Promise.resolve());
    await runHumanInterviewRecordingProcessing(
      {
        candidateDurationMs: 10_000,
        candidateEgressId: "egress-candidate",
        candidateFileKey: "human-interviews/org-1/meeting-1/candidate-audio.ogg",
        candidateSizeBytes: 5,
        durationMs: 10_000,
        egressId: "egress-1",
        fileKey: "human-interviews/org-1/meeting-1/room-audio.ogg",
        meetingId: "meeting-1",
        organizationId: "org-1",
        sizeBytes: 5,
      },
      { attempt: 1, maxAttempts: 5 },
      {
        download: async ({ filePath }) => {
          const { writeFile } = await import("node:fs/promises");
          await writeFile(filePath, "audio");
        },
        enqueueTranscription,
        getTranscriptionJob: vi.fn(() =>
          Promise.resolve({
            meetingId: "session-1",
            model: "qwen3-asr-flash-filetrans",
            organizationId: "org-1",
            pipelineVersion: "final-v1" as const,
            policyRevision: 1,
            provider: "qwen" as const,
            region: "cn-beijing",
            sourceManifestSha256: "a".repeat(64),
          }),
        ),
        head: vi.fn(() =>
          Promise.resolve({
            checksumSha256: null,
            contentLength: 5,
            contentType: "audio/ogg",
            etag: null,
            sha256: null,
          }),
        ),
        ingest,
        markError: vi.fn(() => Promise.resolve()),
        markTranscriptionUnavailable: vi.fn(() => Promise.resolve()),
      },
    );

    expect(ingest).toHaveBeenCalledWith(
      expect.objectContaining({
        candidate: expect.objectContaining({ durationMs: 10_000, sizeBytes: 5 }),
        room: expect.objectContaining({
          contentType: "audio/ogg",
          durationMs: 10_000,
          sizeBytes: 5,
        }),
      }),
    );
    expect(enqueueTranscription).toHaveBeenCalledTimes(1);
  });

  it("marks transcription unavailable when no shared transcription job can be created", async () => {
    const markTranscriptionUnavailable = vi.fn(() => Promise.resolve());
    const enqueueTranscription = vi.fn(() => Promise.resolve());

    await runHumanInterviewRecordingProcessing(
      {
        candidateDurationMs: 10_000,
        candidateEgressId: "egress-candidate",
        candidateFileKey: "human-interviews/org-1/meeting-1/candidate-audio.ogg",
        candidateSizeBytes: 5,
        durationMs: 10_000,
        egressId: "egress-1",
        fileKey: "human-interviews/org-1/meeting-1/room-audio.ogg",
        meetingId: "meeting-1",
        organizationId: "org-1",
        sizeBytes: 5,
      },
      { attempt: 1, maxAttempts: 5 },
      {
        download: async ({ filePath }) => {
          const { writeFile } = await import("node:fs/promises");
          await writeFile(filePath, "audio");
        },
        enqueueTranscription,
        getTranscriptionJob: vi.fn(() => Promise.resolve(null)),
        head: vi.fn(() =>
          Promise.resolve({
            checksumSha256: null,
            contentLength: 5,
            contentType: "audio/ogg",
            etag: null,
            sha256: null,
          }),
        ),
        ingest: vi.fn(() =>
          Promise.resolve({ meetingSessionId: "session-1", organizationId: "org-1" }),
        ),
        markError: vi.fn(() => Promise.resolve()),
        markTranscriptionUnavailable,
      },
    );

    expect(enqueueTranscription).not.toHaveBeenCalled();
    expect(markTranscriptionUnavailable).toHaveBeenCalledWith({
      meetingSessionId: "session-1",
      organizationId: "org-1",
    });
  });

  it("marks the recording processing error terminal after the retry budget is exhausted", async () => {
    const markError = vi.fn(() => Promise.resolve());
    await expect(
      runHumanInterviewRecordingProcessing(
        {
          candidateDurationMs: 10_000,
          candidateEgressId: "egress-candidate",
          candidateFileKey: "human-interviews/org-1/meeting-1/candidate-audio.ogg",
          candidateSizeBytes: 5,
          durationMs: 10_000,
          egressId: "egress-1",
          fileKey: "human-interviews/org-1/meeting-1/room-audio.ogg",
          meetingId: "meeting-1",
          organizationId: "org-1",
          sizeBytes: 5,
        },
        { attempt: 5, maxAttempts: 5 },
        {
          download: vi.fn(() => Promise.resolve()),
          enqueueTranscription: vi.fn(() => Promise.resolve()),
          getTranscriptionJob: vi.fn(() => Promise.resolve(null)),
          head: vi.fn(() => Promise.resolve(null)),
          ingest: vi.fn(),
          markError,
          markTranscriptionUnavailable: vi.fn(() => Promise.resolve()),
        },
      ),
    ).rejects.toThrow("真人复面录音文件不存在或为空");

    expect(markError).toHaveBeenCalledWith({
      error: "真人复面录音文件不存在或为空",
      meetingId: "meeting-1",
      terminal: true,
    });
  });
});
