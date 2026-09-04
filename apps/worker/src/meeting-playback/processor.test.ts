import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { continueAfterMeetingPlayback, runMeetingPlaybackProcessing } from "./processor";

function createDependencies() {
  return {
    buildPlaybackStorageKey: vi.fn(() => Promise.resolve("meetings/org/meeting/playback.webm")),
    createRunId: vi.fn(() => "run-74"),
    createWorkingDirectory: vi.fn(() => Promise.resolve("/tmp/meeting-74")),
    deletePlayback: vi.fn(() => Promise.resolve()),
    downloadSource: vi.fn(() => Promise.resolve()),
    enqueueTranscription: vi.fn(() => Promise.resolve()),
    inspectOutput: vi.fn(() => Promise.resolve({ sha256: "d".repeat(64), sizeBytes: 4096 })),
    loadSource: vi.fn(() =>
      Promise.resolve({
        assets: [
          {
            contentType: "audio/webm;codecs=opus",
            durationMs: 60_000,
            status: "ready",
            storageKey: "microphone.webm",
            track: "microphone" as const,
          },
          {
            contentType: "audio/webm;codecs=opus",
            durationMs: 62_000,
            status: "ready",
            storageKey: "system.webm",
            track: "system" as const,
          },
        ],
        id: "meeting-74",
        organizationId: "org-74",
        status: "processing",
      }),
    ),
    markFailed: vi.fn(() => Promise.resolve(true)),
    markProcessing: vi.fn(() => Promise.resolve(true)),
    mixSources: vi.fn(() => Promise.resolve()),
    publishPlayback: vi.fn(() => Promise.resolve(true)),
    registerCleanupKey: vi.fn(() =>
      Promise.resolve<{ writerLeaseExpiresAt: Date } | null>({
        writerLeaseExpiresAt: new Date("2099-08-09T12:12:00.000Z"),
      }),
    ),
    removeCleanupKey: vi.fn(() => Promise.resolve()),
    removeWorkingDirectory: vi.fn(() => Promise.resolve()),
    uploadPlayback: vi.fn(() => Promise.resolve()),
    verifyPlayback: vi.fn(() => Promise.resolve(true)),
  };
}

describe("Meeting playback processor", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("mixes the two verified sources and publishes one replaceable playback asset", async () => {
    const deps = createDependencies();

    await runMeetingPlaybackProcessing({ meetingId: "meeting-74", organizationId: "org-74" }, deps);

    expect(deps.downloadSource).toHaveBeenCalledTimes(2);
    expect(deps.mixSources).toHaveBeenCalledWith({
      microphonePath: "/tmp/meeting-74/microphone.webm",
      outputPath: "/tmp/meeting-74/playback.webm",
      systemPath: "/tmp/meeting-74/system.webm",
    });
    expect(deps.verifyPlayback).toHaveBeenCalledWith({
      contentType: "audio/webm",
      sha256: "d".repeat(64),
      sizeBytes: 4096,
      storageKey: "meetings/org/meeting/playback.webm",
    });
    expect(deps.buildPlaybackStorageKey).toHaveBeenCalledWith({
      meetingId: "meeting-74",
      organizationId: "org-74",
      processingRunId: "run-74",
    });
    expect(deps.registerCleanupKey).toHaveBeenCalledWith({
      meetingId: "meeting-74",
      organizationId: "org-74",
      processingRunId: "run-74",
      storageKey: "meetings/org/meeting/playback.webm",
    });
    expect(deps.publishPlayback).toHaveBeenCalledWith({
      contentType: "audio/webm",
      durationMs: 62_000,
      meetingId: "meeting-74",
      organizationId: "org-74",
      processingRunId: "run-74",
      sha256: "d".repeat(64),
      sizeBytes: 4096,
      storageKey: "meetings/org/meeting/playback.webm",
    });
    expect(deps.enqueueTranscription).toHaveBeenCalledWith({
      meetingId: "meeting-74",
      organizationId: "org-74",
    });
    expect(deps.removeCleanupKey).toHaveBeenCalledWith({
      meetingId: "meeting-74",
      organizationId: "org-74",
      storageKey: "meetings/org/meeting/playback.webm",
    });
  });

  it("does not upload when purge wins before the cleanup key is registered", async () => {
    const deps = createDependencies();
    deps.registerCleanupKey.mockResolvedValueOnce(null);

    await expect(
      runMeetingPlaybackProcessing({ meetingId: "meeting-74", organizationId: "org-74" }, deps),
    ).rejects.toThrow("正在清除");
    expect(deps.uploadPlayback).not.toHaveBeenCalled();
  });

  it("does not let a paused writer start uploading after its absolute lease expires", async () => {
    const deps = createDependencies();
    deps.registerCleanupKey.mockResolvedValueOnce({ writerLeaseExpiresAt: new Date(0) });

    await expect(
      runMeetingPlaybackProcessing({ meetingId: "meeting-74", organizationId: "org-74" }, deps),
    ).rejects.toThrow("writer lease 已过期");

    expect(deps.uploadPlayback).not.toHaveBeenCalled();
  });

  it("keeps verified sources intact and leaves a retryable failure when mixing fails", async () => {
    const deps = createDependencies();
    deps.mixSources.mockRejectedValueOnce(new Error("ffmpeg failed"));

    await expect(
      runMeetingPlaybackProcessing({ meetingId: "meeting-74", organizationId: "org-74" }, deps),
    ).rejects.toThrow("ffmpeg failed");

    expect(deps.uploadPlayback).not.toHaveBeenCalled();
    expect(deps.publishPlayback).not.toHaveBeenCalled();
    expect(deps.markFailed).toHaveBeenCalledWith({
      errorMessage: "ffmpeg failed",
      meetingId: "meeting-74",
      organizationId: "org-74",
      processingRunId: "run-74",
    });
    expect(console.error).toHaveBeenCalledWith("[meeting-playback-worker] processing failed", {
      errorMessage: "ffmpeg failed",
      meetingId: "meeting-74",
      processingRunId: "run-74",
    });
    expect(deps.removeWorkingDirectory).toHaveBeenCalledWith("/tmp/meeting-74");
  });

  it("persists ffmpeg stderr in the processing failure log", async () => {
    const deps = createDependencies();
    const mixError = Object.assign(new Error("Command failed: ffmpeg"), {
      stderr: "amix: Input stream not found\nError opening input files",
    });
    deps.mixSources.mockRejectedValueOnce(mixError);

    await expect(
      runMeetingPlaybackProcessing({ meetingId: "meeting-74", organizationId: "org-74" }, deps),
    ).rejects.toThrow("Command failed: ffmpeg");

    const errorMessage =
      "Command failed: ffmpeg\namix: Input stream not found\nError opening input files";
    expect(deps.markFailed).toHaveBeenCalledWith({
      errorMessage,
      meetingId: "meeting-74",
      organizationId: "org-74",
      processingRunId: "run-74",
    });
    expect(console.error).toHaveBeenCalledWith("[meeting-playback-worker] processing failed", {
      errorMessage,
      meetingId: "meeting-74",
      processingRunId: "run-74",
    });
  });

  it("is idempotent after a ready playback asset has already been published", async () => {
    const deps = createDependencies();
    deps.loadSource.mockResolvedValueOnce({
      assets: [],
      id: "meeting-74",
      organizationId: "org-74",
      status: "ready",
    });

    await runMeetingPlaybackProcessing({ meetingId: "meeting-74", organizationId: "org-74" }, deps);

    expect(deps.markProcessing).not.toHaveBeenCalled();
    expect(deps.createWorkingDirectory).not.toHaveBeenCalled();
  });

  it("does not let an execution that lost its processing lease overwrite the winner", async () => {
    const deps = createDependencies();
    deps.publishPlayback.mockResolvedValueOnce(false);

    await runMeetingPlaybackProcessing({ meetingId: "meeting-74", organizationId: "org-74" }, deps);

    expect(deps.publishPlayback).toHaveBeenCalledTimes(1);
    expect(deps.deletePlayback).toHaveBeenCalledWith("meetings/org/meeting/playback.webm");
    expect(deps.removeCleanupKey).toHaveBeenCalledWith({
      meetingId: "meeting-74",
      organizationId: "org-74",
      storageKey: "meetings/org/meeting/playback.webm",
    });
    expect(deps.markFailed).not.toHaveBeenCalled();
    expect(deps.enqueueTranscription).not.toHaveBeenCalled();
  });

  it("keeps the published playback ready when immediate transcription enqueue fails", async () => {
    const deps = createDependencies();
    deps.enqueueTranscription.mockRejectedValueOnce(new Error("redis unavailable"));

    await runMeetingPlaybackProcessing({ meetingId: "meeting-74", organizationId: "org-74" }, deps);

    expect(deps.publishPlayback).toHaveBeenCalledTimes(1);
    expect(deps.markFailed).not.toHaveBeenCalled();
    expect(deps.deletePlayback).not.toHaveBeenCalled();
  });

  it("removes its run object after verification proves it cannot be published", async () => {
    const deps = createDependencies();
    deps.verifyPlayback.mockResolvedValueOnce(false);

    await expect(
      runMeetingPlaybackProcessing({ meetingId: "meeting-74", organizationId: "org-74" }, deps),
    ).rejects.toThrow("Mixed playback asset 完整性校验失败");

    expect(deps.markFailed).toHaveBeenCalledTimes(1);
    expect(deps.deletePlayback).toHaveBeenCalledWith("meetings/org/meeting/playback.webm");
  });

  it("cleans a run object after a failed publish without masking the processing error", async () => {
    const deps = createDependencies();
    deps.publishPlayback.mockRejectedValueOnce(new Error("database unavailable"));
    deps.deletePlayback.mockRejectedValueOnce(new Error("cleanup unavailable"));

    await expect(
      runMeetingPlaybackProcessing({ meetingId: "meeting-74", organizationId: "org-74" }, deps),
    ).rejects.toThrow("database unavailable");

    expect(deps.markFailed).toHaveBeenCalledTimes(1);
    expect(deps.deletePlayback).toHaveBeenCalledWith("meetings/org/meeting/playback.webm");
  });

  it("stops before downloading when another execution already owns or completed the job", async () => {
    const deps = createDependencies();
    deps.markProcessing.mockResolvedValueOnce(false);

    await runMeetingPlaybackProcessing({ meetingId: "meeting-74", organizationId: "org-74" }, deps);

    expect(deps.createWorkingDirectory).not.toHaveBeenCalled();
    expect(deps.downloadSource).not.toHaveBeenCalled();
  });
});

describe("continueAfterMeetingPlayback", () => {
  it("enqueues final ASR when a transcription job is available", async () => {
    const job = {
      meetingId: "meeting-74",
      model: "qwen-audio-3.0-asr-flash-filetrans",
      organizationId: "org-74",
      pipelineVersion: "final-v2" as const,
      policyRevision: 1,
      provider: "qwen" as const,
      region: "qwen-cn-beijing",
      sourceManifestSha256: "a".repeat(64),
    };
    const dependencies = {
      enqueueJobs: vi.fn(() => Promise.resolve()),
      getJob: vi.fn(() => Promise.resolve(job)),
      isTranscriptReady: vi.fn(() => Promise.resolve(false)),
      requestHumanEvaluation: vi.fn(() => Promise.resolve()),
      requestIntelligence: vi.fn(() => Promise.resolve()),
    };

    await continueAfterMeetingPlayback(
      { meetingId: "meeting-74", organizationId: "org-74" },
      dependencies,
    );

    expect(dependencies.enqueueJobs).toHaveBeenCalledWith([job]);
    expect(dependencies.isTranscriptReady).not.toHaveBeenCalled();
    expect(dependencies.requestIntelligence).not.toHaveBeenCalled();
    expect(dependencies.requestHumanEvaluation).not.toHaveBeenCalled();
  });

  it("requests both downstream products for an already-promoted Deepgram revision", async () => {
    const dependencies = {
      enqueueJobs: vi.fn(() => Promise.resolve()),
      getJob: vi.fn(() => Promise.resolve(null)),
      isTranscriptReady: vi.fn(() => Promise.resolve(true)),
      requestHumanEvaluation: vi.fn(() => Promise.resolve()),
      requestIntelligence: vi.fn(() => Promise.resolve()),
    };

    await continueAfterMeetingPlayback(
      { meetingId: "meeting-74", organizationId: "org-74" },
      dependencies,
    );

    expect(dependencies.enqueueJobs).not.toHaveBeenCalled();
    expect(dependencies.requestIntelligence).toHaveBeenCalledWith({
      meetingId: "meeting-74",
      organizationId: "org-74",
    });
    expect(dependencies.requestHumanEvaluation).toHaveBeenCalledWith({
      meetingSessionId: "meeting-74",
      organizationId: "org-74",
    });
  });

  it("does nothing when no job or authoritative revision exists", async () => {
    const dependencies = {
      enqueueJobs: vi.fn(() => Promise.resolve()),
      getJob: vi.fn(() => Promise.resolve(null)),
      isTranscriptReady: vi.fn(() => Promise.resolve(false)),
      requestHumanEvaluation: vi.fn(() => Promise.resolve()),
      requestIntelligence: vi.fn(() => Promise.resolve()),
    };

    await continueAfterMeetingPlayback(
      { meetingId: "meeting-74", organizationId: "org-74" },
      dependencies,
    );

    expect(dependencies.enqueueJobs).not.toHaveBeenCalled();
    expect(dependencies.requestIntelligence).not.toHaveBeenCalled();
    expect(dependencies.requestHumanEvaluation).not.toHaveBeenCalled();
  });
});
