import { describe, expect, it, vi } from "vitest";

vi.mock("@arc/ai-recruitment-copilot-backend/lib/server/s3", () => ({
  buildMeetingPlaybackAssetKey: vi.fn(),
  deleteMeetingRecordingObject: vi.fn(),
  downloadMeetingRecordingObjectToFile: vi.fn(),
  headMeetingRecordingObject: vi.fn(),
  putMeetingRecordingFile: vi.fn(),
}));
vi.mock("@arc/ai-recruitment-copilot-backend/server/routes/meetings/dao", () => ({
  loadMeetingPlaybackSource: vi.fn(),
  markMeetingPlaybackFailed: vi.fn(),
  markMeetingPlaybackProcessing: vi.fn(),
  publishMeetingPlaybackAsset: vi.fn(),
}));

// oxlint-disable-next-line import/first -- must follow vi.mock() for hoisting.
import { runMeetingPlaybackProcessing } from "./processor";

function createDependencies() {
  return {
    buildPlaybackStorageKey: vi.fn(() => Promise.resolve("meetings/org/meeting/playback.webm")),
    createRunId: vi.fn(() => "run-74"),
    createWorkingDirectory: vi.fn(() => Promise.resolve("/tmp/meeting-74")),
    deletePlayback: vi.fn(() => Promise.resolve()),
    downloadSource: vi.fn(() => Promise.resolve()),
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
    removeWorkingDirectory: vi.fn(() => Promise.resolve()),
    uploadPlayback: vi.fn(() => Promise.resolve()),
    verifyPlayback: vi.fn(() => Promise.resolve(true)),
  };
}

describe("Meeting playback processor", () => {
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
    expect(deps.removeWorkingDirectory).toHaveBeenCalledWith("/tmp/meeting-74");
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
    expect(deps.markFailed).not.toHaveBeenCalled();
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
