import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Meeting Recording storage writes", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-09T00:00:00.000Z"));
    process.env.RECORDING_R2_ACCESS_KEY_ID = "test-access-key";
    process.env.RECORDING_R2_BUCKET_NAME = "test-recordings";
    process.env.RECORDING_R2_ENDPOINT = "https://recordings.example.test";
    process.env.RECORDING_R2_FORCE_PATH_STYLE = "false";
    process.env.RECORDING_R2_KEY_PREFIX = "test";
    process.env.RECORDING_R2_REGION = "auto";
    process.env.RECORDING_R2_SECRET_ACCESS_KEY = "test-secret-key";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does not start a playback PUT when client initialization crosses the writer deadline", async () => {
    const initialization = Promise.withResolvers<null>();
    const send = vi.fn(() => Promise.resolve());
    const { putMeetingRecordingFile } = await import("./index");
    const upload = putMeetingRecordingFile(
      {
        contentType: "audio/webm",
        deadlineAt: new Date("2026-08-09T00:00:01.000Z"),
        filePath: import.meta.filename,
        sha256: "d".repeat(64),
        sizeBytes: 4096,
        storageKey: "meetings/org/meeting/playback.webm",
      },
      async () => {
        await initialization.promise;
        return { send };
      },
    );

    await vi.advanceTimersByTimeAsync(1001);
    initialization.resolve(null);

    await expect(upload).rejects.toThrow("writer lease 已过期");
    expect(send).not.toHaveBeenCalled();
  });
});
