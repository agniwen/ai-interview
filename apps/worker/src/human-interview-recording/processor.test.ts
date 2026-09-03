import { describe, expect, it, vi } from "vitest";
import { runHumanInterviewRecordingProcessing } from "./processor";
import type { HumanInterviewRecordingProcessorDependencies } from "./processor";
import type { HumanInterviewRecordingTrack } from "@app/db-schema/human-interview-recording";

describe("runHumanInterviewRecordingProcessing", () => {
  it("retains both completed room attempts without colliding at asset admission", async () => {
    const tracks: HumanInterviewRecordingTrack[] = (["mixed", "mixed", "candidate"] as const).map(
      (role, i) => ({
        displayName: role,
        durationMs: 10_000,
        egressId: `egress-${i}`,
        endedAtMs: 11_000 + i * 1000,
        error: null,
        fileKey: `attempt-${i}.ogg`,
        id: `00000000-0000-4000-8000-00000000000${i}`,
        participantIdentity: role === "mixed" ? null : "candidate-1",
        publishedAtMs: 1000,
        role,
        sizeBytes: 5,
        startedAtMs: 1000 + i * 1000,
        status: "completed",
        trackId: role === "mixed" ? "room" : "mic-1",
        updatedAtMs: 20_000,
      }),
    );
    const ingest = vi.fn<HumanInterviewRecordingProcessorDependencies["ingest"]>((input) => {
      const keys = input.assets?.map((asset) => asset.track) ?? [];
      // Admission must satisfy the existing unique (meeting_id, track) database constraint.
      if (new Set(keys).size !== keys.length) {
        throw new Error("duplicate meeting recording track");
      }
      return Promise.resolve({ meetingSessionId: "session-1", organizationId: "org-1" });
    });
    await runHumanInterviewRecordingProcessing(
      { meetingId: "meeting-1", organizationId: "org-1", tracks, version: 2 },
      { attempt: 1, maxAttempts: 3 },
      {
        detectSilence: () => Promise.resolve([]),
        download: async ({ filePath }) => {
          const { writeFile } = await import("node:fs/promises");
          await writeFile(filePath, "audio");
        },
        enqueueTranscription: () => Promise.resolve(),
        getTranscriptionJob: () => Promise.resolve(null),
        head: () =>
          Promise.resolve({
            checksumSha256: null,
            contentLength: 5,
            contentType: "audio/ogg",
            etag: null,
            sha256: null,
          }),
        ingest,
        inspectAudio: () => Promise.resolve(10_000),
        markError: () => Promise.resolve(),
        markTranscriptionUnavailable: () => Promise.resolve(),
      },
    );
    const assets = ingest.mock.calls[0]?.[0].assets ?? [];
    expect(assets).toHaveLength(3);
    expect(assets.map((asset) => asset.recordingIdentity?.sourceId)).toEqual(
      tracks.map((track) => track.id),
    );
    expect(assets.filter((asset) => asset.recordingIdentity?.role === "unknown")).toHaveLength(2);
    expect(assets.filter((asset) => asset.track === "mixed")).toHaveLength(1);
  });
  it.each(["candidate", "interviewer", "mixed"] as const)(
    "最后一次校验中 %s 文件缺失仍保留其他音轨",
    async (missing) => {
      const tracks: HumanInterviewRecordingTrack[] = (
        ["mixed", "candidate", "interviewer"] as const
      ).map((role, i) => ({
        displayName: role,
        durationMs: 10_000,
        egressId: `egress-${i}`,
        endedAtMs: 11_000,
        error: null,
        fileKey: `${role}.ogg`,
        id: crypto.randomUUID(),
        participantIdentity: role === "mixed" ? null : role,
        publishedAtMs: 1000,
        role,
        sizeBytes: 5,
        startedAtMs: 1000,
        status: "completed",
        trackId: `track-${i}`,
        updatedAtMs: 11_000,
      }));
      const ingest = vi.fn<HumanInterviewRecordingProcessorDependencies["ingest"]>(() =>
        Promise.resolve({ meetingSessionId: "session-1", organizationId: "org-1" }),
      );
      const markError = vi.fn(() => Promise.resolve());
      await runHumanInterviewRecordingProcessing(
        { meetingId: "meeting-1", organizationId: "org-1", tracks, version: 2 },
        { attempt: 3, maxAttempts: 3 },
        {
          download: async ({ filePath }) => {
            const { writeFile } = await import("node:fs/promises");
            await writeFile(filePath, "audio");
          },
          enqueueTranscription: () => Promise.resolve(),
          getTranscriptionJob: () => Promise.resolve(null),
          head: (key) =>
            Promise.resolve(
              key === `${missing}.ogg`
                ? null
                : {
                    checksumSha256: null,
                    contentLength: 5,
                    contentType: "audio/ogg",
                    etag: null,
                    sha256: null,
                  },
            ),
          ingest,
          inspectAudio: () => Promise.resolve(10_000),
          markError,
          markTranscriptionUnavailable: () => Promise.resolve(),
        },
      );
      expect(markError).not.toHaveBeenCalled();
      const assets = ingest.mock.calls[0]?.[0].assets;
      expect(assets).toHaveLength(2);
      expect(assets?.some((asset) => asset.recordingIdentity?.role === missing)).toBe(false);
      if (missing !== "mixed") {
        expect(
          assets?.find((asset) => asset.track === "mixed")?.recordingIdentity?.recoveryRanges,
        ).toContainEqual({ endMs: 10_000, startMs: 0 });
      }
    },
  );
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
