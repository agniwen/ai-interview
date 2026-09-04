import { describe, expect, it, vi } from "vitest";
import {
  MeetingProviderQuotaError,
  MeetingProviderResponseError,
} from "@app/meeting-processing/transcription";
import type { MeetingTranscriptionDependencies } from "./processor";

import {
  assertMeetingTranscriptionFfmpegAvailable,
  assertMeetingTranscriptionFfmpegVersion,
  createMeetingTranscriptionProviderForJob,
  runMeetingTranscriptionProcessing,
} from "./processor";

const job = {
  meetingId: "meeting-76",
  model: "qwen-audio-3.0-asr-flash-filetrans",
  organizationId: "org-76",
  pipelineVersion: "final-v1" as const,
  policyRevision: 1,
  provider: "qwen" as const,
  region: "qwen-cn-beijing",
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
    loadSource: vi.fn<MeetingTranscriptionDependencies["loadSource"]>(() =>
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
          {
            contentType: "audio/webm",
            durationMs: 62_000,
            sizeBytes: 150,
            status: "failed",
            storageKey: "playback.webm",
            track: "playback" as const,
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
    prepareChunks: vi.fn<MeetingTranscriptionDependencies["prepareChunks"]>(() =>
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
      transcribeFinal: vi.fn<MeetingTranscriptionDependencies["provider"]["transcribeFinal"]>(() =>
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
    publish: vi.fn<MeetingTranscriptionDependencies["publish"]>(() => Promise.resolve(true)),
    removeWorkingDirectory: vi.fn(() => Promise.resolve()),
    requestHumanEvaluation: vi.fn(() => Promise.resolve()),
    requestIntelligence: vi.fn(() => Promise.resolve()),
    saveChunkCheckpoint: vi.fn((_input, _chunk, transcript) => Promise.resolve(transcript)),
    withMediaPermit: vi.fn((requiredBytes, task) => task(requiredBytes)),
  };
}

describe("Meeting final transcription processor", () => {
  it.each([190, 1500])(
    "distinguishes a brief track startup offset from missing audio (%s ms)",
    async (openingMs) => {
      const deps = createDependencies();
      const assets = (["candidate", "interviewer", "unknown"] as const).map((role, index) => ({
        contentType: "audio/ogg",
        durationMs: 60_000,
        recordingIdentity: {
          offsetMs: { candidate: 0, interviewer: openingMs, unknown: openingMs + 638 }[role],
          participantIdentity: role === "unknown" ? null : `${index}`,
          recoveryRanges: role === "unknown" ? [{ endMs: openingMs, startMs: 0 }] : [],
          role,
          sourceId: `${index}`,
        },
        sizeBytes: 100,
        status: "ready",
        storageKey: `${index}.ogg`,
        track: role === "unknown" ? "mixed" : `participant-${index}`,
      }));
      await runMeetingTranscriptionProcessing(
        job,
        { attempt: 1, maxAttempts: 3 },
        {
          ...deps,
          loadSource: () =>
            Promise.resolve({
              assets,
              id: job.meetingId,
              manifestSha256: job.sourceManifestSha256,
              organizationId: job.organizationId,
            }),
          prepareChunks: ({ sources }) =>
            Promise.resolve(
              sources.map((source) => ({
                ...source,
                contentType: "audio/webm",
                endMs: source.durationMs + (source.recordingIdentity?.offsetMs ?? 0),
                index: 0,
                startMs: source.recordingIdentity?.offsetMs ?? 0,
              })),
            ),
        },
      );
      expect(deps.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          warning: openingMs <= 1000 ? undefined : expect.stringContaining("部分录音"),
        }),
      );
    },
  );

  it("does not generate hints when every chunk is already checkpointed", async () => {
    const deps = createDependencies();
    deps.claimChunk.mockResolvedValue({
      status: "ready",
      transcript: { language: "zh", turns: [] },
    });
    const recognitionHintsForJob = vi.fn();
    await runMeetingTranscriptionProcessing(
      job,
      { attempt: 2, maxAttempts: 3 },
      {
        ...deps,
        recognitionHintsForJob,
      },
    );
    expect(recognitionHintsForJob).not.toHaveBeenCalled();
    expect(deps.provider.transcribeFinal).not.toHaveBeenCalled();
  });

  it("does not generate hints for a legacy ASR model", async () => {
    const recognitionHintsForJob = vi.fn();
    await runMeetingTranscriptionProcessing(
      { ...job, model: "qwen3-asr-flash-filetrans" },
      { attempt: 1, maxAttempts: 3 },
      { ...createDependencies(), recognitionHintsForJob },
    );
    expect(recognitionHintsForJob).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "shares recognition hints across chunks and tolerates hint failure (%s)",
    async (fails) => {
      const deps = createDependencies();
      const hints = { terms: ["商机", "应收账款"] };
      const recognitionHintsForJob = vi.fn(() =>
        fails ? Promise.reject(new Error("hint provider unavailable")) : Promise.resolve(hints),
      );
      await runMeetingTranscriptionProcessing(
        job,
        { attempt: 1, maxAttempts: 3 },
        {
          ...deps,
          recognitionHintsForJob,
        },
      );
      expect(recognitionHintsForJob).toHaveBeenCalledOnce();
      expect(recognitionHintsForJob).toHaveBeenCalledWith(job);
      for (const [request] of deps.provider.transcribeFinal.mock.calls) {
        expect(request).toMatchObject({ recognitionHints: fails ? undefined : hints });
      }
      expect(deps.publish).toHaveBeenCalledOnce();
    },
  );

  it.each(["succeeded", "failed", "unavailable"] as const)(
    "reports only unresolved opening recovery (%s)",
    async (recovery) => {
      const deps = createDependencies();
      const assets = (["candidate", "interviewer", "unknown"] as const).map((role, index) => ({
        contentType: "audio/ogg",
        durationMs: 60_000,
        recordingIdentity: {
          offsetMs: role === "interviewer" ? 280 : 0,
          participantIdentity: role === "unknown" ? null : `${index}`,
          recoveryRanges: role === "unknown" ? [{ endMs: 280, startMs: 0 }] : [],
          role,
          sourceId: `${index}`,
        },
        sizeBytes: 100,
        status: role === "unknown" && recovery === "unavailable" ? "failed" : "ready",
        storageKey: `${index}.ogg`,
        track: role === "unknown" ? "mixed" : `participant-${index}`,
      }));
      await runMeetingTranscriptionProcessing(
        job,
        { attempt: 3, maxAttempts: 3 },
        {
          ...deps,
          loadSource: () =>
            Promise.resolve({
              assets,
              id: job.meetingId,
              manifestSha256: job.sourceManifestSha256,
              organizationId: job.organizationId,
            }),
          prepareChunks: ({ sources }) =>
            Promise.resolve(
              sources.map((source) => ({
                ...source,
                contentType: "audio/webm",
                endMs: source.durationMs + (source.recordingIdentity?.offsetMs ?? 0),
                index: 0,
                startMs: source.recordingIdentity?.offsetMs ?? 0,
              })),
            ),
          provider: {
            transcribeFinal: (input) =>
              input.chunks[0]?.track === "mixed" && recovery === "failed"
                ? Promise.reject(new Error("Recovery ASR failed"))
                : deps.provider.transcribeFinal(input),
          },
        },
      );
      expect(deps.publish).toHaveBeenCalledWith(
        expect.objectContaining({
          transcript: expect.objectContaining({
            turns: [
              expect.objectContaining({
                attribution: expect.objectContaining({ role: "candidate" }),
              }),
              expect.objectContaining({
                attribution: expect.objectContaining({ role: "interviewer" }),
              }),
            ],
          }),
          warning: recovery === "succeeded" ? undefined : expect.stringContaining("部分录音"),
        }),
      );
      expect(deps.provider.transcribeFinal).toHaveBeenCalledTimes(recovery === "succeeded" ? 3 : 2);
    },
  );

  it("recovers missing interviewer speech from a retried room recording when the playback mix fails", async () => {
    const deps = createDependencies();
    const assets = (["candidate", "unknown", "unknown"] as const).map((role, index) => ({
      contentType: "audio/ogg",
      durationMs: 60_000,
      recordingIdentity: {
        offsetMs: index === 2 ? 5000 : 0,
        participantIdentity: role === "candidate" ? "candidate-1" : null,
        recoveryRanges: role === "unknown" ? [{ endMs: 65_000, startMs: 0 }] : [],
        role,
        silenceRanges: role === "candidate" ? [{ endMs: 60_000, startMs: 0 }] : [],
        sourceId: `source-${index}`,
      },
      sizeBytes: 100,
      status: "ready",
      storageKey: `${index}.ogg`,
      track: index === 1 ? "mixed" : `participant-${index}`,
    }));
    await runMeetingTranscriptionProcessing(
      job,
      { attempt: 3, maxAttempts: 3 },
      {
        ...deps,
        loadSource: () =>
          Promise.resolve({
            assets,
            id: job.meetingId,
            manifestSha256: job.sourceManifestSha256,
            organizationId: job.organizationId,
          }),
        prepareChunks: ({ sources }) =>
          Promise.resolve(
            sources.map((source) => ({
              ...source,
              contentType: "audio/webm",
              endMs: source.durationMs + (source.recordingIdentity?.offsetMs ?? 0),
              index: 0,
              startMs: source.recordingIdentity?.offsetMs ?? 0,
            })),
          ),
        provider: {
          transcribeFinal: ({ chunks }) => {
            if (chunks[0]?.track === "mixed") {
              return Promise.reject(new Error("room ASR failed"));
            }
            return Promise.resolve({
              language: "zh",
              turns:
                chunks[0]?.track === "participant-2"
                  ? [
                      {
                        confidence: null,
                        endMs: 7000,
                        speakerKey: "remote-1",
                        startMs: 6000,
                        text: "请介绍项目",
                        track: "remote" as const,
                      },
                    ]
                  : [],
            });
          },
        },
      },
    );
    expect(deps.publish).toHaveBeenCalledOnce();
    expect(deps.publish.mock.calls[0]?.[0].transcript.turns).toEqual([
      expect.objectContaining({
        attribution: expect.objectContaining({
          method: "candidate-excluded",
          role: "interviewer",
          sourceId: "source-2",
        }),
        endMs: 7000,
        startMs: 6000,
        text: "请介绍项目",
      }),
    ]);
    expect(deps.requestHumanEvaluation).toHaveBeenCalledOnce();
  });

  it.each([true, false])(
    "recovers a failed interviewer from the room mix without treating missing candidate ASR as exclusion (silence=%s)",
    async (verifiedSilence) => {
      const deps = createDependencies();
      const assets = (["candidate", "interviewer", "unknown"] as const).map((role, index) => ({
        contentType: "audio/ogg",
        durationMs: 60_000,
        recordingIdentity: {
          offsetMs: 0,
          participantIdentity: `${index}`,
          recoveryRanges: [],
          role,
          silenceRanges:
            role === "candidate" && verifiedSilence ? [{ endMs: 60_000, startMs: 0 }] : [],
          sourceId: `${index}`,
        },
        sizeBytes: 100,
        status: "ready",
        storageKey: `${index}.ogg`,
        track: role === "unknown" ? "mixed" : `participant-${index}`,
      }));
      await runMeetingTranscriptionProcessing(
        job,
        { attempt: 3, maxAttempts: 3 },
        {
          ...deps,
          loadSource: () =>
            Promise.resolve({
              assets,
              id: job.meetingId,
              manifestSha256: job.sourceManifestSha256,
              organizationId: job.organizationId,
            }),
          prepareChunks: ({ sources }) =>
            Promise.resolve(
              sources.map((source) => ({
                ...source,
                contentType: "audio/webm",
                endMs: 60_000,
                index: 0,
                startMs: 0,
              })),
            ),
          provider: {
            transcribeFinal: ({ chunks }) => {
              if (chunks[0]?.recordingIdentity?.role === "interviewer") {
                return Promise.reject(new Error("ASR failed"));
              }
              return Promise.resolve({
                language: "zh",
                turns:
                  chunks[0]?.track === "mixed"
                    ? [
                        {
                          confidence: null,
                          endMs: 2000,
                          speakerKey: "remote-1",
                          startMs: 1000,
                          text: "请介绍项目",
                          track: "remote" as const,
                        },
                      ]
                    : [],
              });
            },
          },
        },
      );
      expect(deps.publish).toHaveBeenCalledOnce();
      expect(deps.publish.mock.calls[0]?.[0].transcript.turns[0]?.attribution).toMatchObject({
        method: verifiedSilence ? "candidate-excluded" : "unconfirmed",
        role: verifiedSilence ? "interviewer" : "unknown",
      });
      if (verifiedSilence) {
        expect(deps.publish.mock.calls[0]?.[0].warning).toBeUndefined();
      } else {
        expect(deps.publish.mock.calls[0]?.[0].warning).toContain("部分录音");
      }
      expect(deps.requestHumanEvaluation).toHaveBeenCalledOnce();
    },
  );
  it.each([false, true])(
    "transcribes complete identity tracks without sending room retries to ASR (retry=%s)",
    async (withRoomRetry) => {
      const deps = createDependencies();
      const roles = withRoomRetry
        ? (["candidate", "interviewer", "unknown", "unknown"] as const)
        : (["candidate", "interviewer", "unknown"] as const);
      const assets = roles.map((role, i) => ({
        contentType: "audio/ogg",
        durationMs: 60_000,
        recordingIdentity: {
          offsetMs: 0,
          participantIdentity: `${i}`,
          recoveryRanges: [],
          role,
          sourceId: `${i}`,
        },
        sizeBytes: 100,
        status: "ready",
        storageKey: `${i}.ogg`,
        track: i === 2 ? "mixed" : `participant-${i}`,
      }));
      await runMeetingTranscriptionProcessing(
        job,
        { attempt: 1, maxAttempts: 3 },
        {
          ...deps,
          loadSource: () =>
            Promise.resolve({
              assets,
              id: job.meetingId,
              manifestSha256: job.sourceManifestSha256,
              organizationId: job.organizationId,
            }),
          prepareChunks: ({ sources }) =>
            Promise.resolve(
              sources.map((source) => ({
                ...source,
                contentType: "audio/webm",
                endMs: 60_000,
                index: 0,
                startMs: 0,
              })),
            ),
        },
      );
      expect(deps.provider.transcribeFinal.mock.calls).toHaveLength(2);
      expect(
        deps.publish.mock.calls[0]?.[0].transcript.turns.map((turn) => turn.attribution?.role),
      ).toEqual(["candidate", "interviewer"]);
    },
  );
  it("rejects a production job when the worker endpoint cannot prove the recorded region", () => {
    expect(() =>
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      createMeetingTranscriptionProviderForJob(job, {
        ALIBABA_BASE_URL: "https://proxy.example.com",
      } as NodeJS.ProcessEnv),
    ).toThrow("not in the verified region map");
    expect(() =>
      // SAFETY: This test constructs the value with the asserted contract before this boundary.
      createMeetingTranscriptionProviderForJob({ ...job, region: "qwen-singapore" }, {
        ALIBABA_BASE_URL: "https://dashscope.aliyuncs.com",
      } as NodeJS.ProcessEnv),
    ).toThrow("does not match worker endpoint");
  });

  it("accepts any valid FFmpeg version for the worker runtime", () => {
    expect(() => assertMeetingTranscriptionFfmpegAvailable("ffmpeg version 5.1.9")).not.toThrow();
    expect(() => assertMeetingTranscriptionFfmpegAvailable("ffmpeg version 9.0.1")).not.toThrow();
    expect(() => assertMeetingTranscriptionFfmpegAvailable("unexpected output")).toThrow(
      "version output is invalid",
    );
  });

  it("still supports pinned FFmpeg versions for reproducible evaluations", () => {
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
    expect(dependencies.prepareChunks).toHaveBeenCalledWith(
      expect.objectContaining({ chunkDurationMs: 8 * 60 * 60 * 1000 }),
    );
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
    expect(dependencies.requestHumanEvaluation).toHaveBeenCalledWith({
      meetingSessionId: job.meetingId,
      organizationId: job.organizationId,
    });
  });

  it("uses the verified playback mix as the only source for a desktop meeting", async () => {
    const dependencies = createDependencies();
    dependencies.loadSource.mockResolvedValueOnce({
      assets: [
        {
          contentType: "audio/webm;codecs=opus",
          durationMs: 62_000,
          sizeBytes: 100,
          status: "ready",
          storageKey: "microphone.webm",
          track: "microphone",
        },
        {
          contentType: "audio/webm;codecs=opus",
          durationMs: 62_000,
          sizeBytes: 100,
          status: "ready",
          storageKey: "system.webm",
          track: "system",
        },
        {
          contentType: "audio/webm",
          durationMs: 62_000,
          sizeBytes: 150,
          status: "ready",
          storageKey: "playback.webm",
          track: "playback",
        },
        {
          contentType: "audio/webm",
          durationMs: 62_000,
          sizeBytes: 140,
          status: "ready",
          storageKey: "mixed.webm",
          track: "mixed",
        },
        {
          contentType: "audio/webm",
          durationMs: 62_000,
          sizeBytes: 120,
          status: "ready",
          storageKey: "candidate.webm",
          track: "candidate",
        },
      ],
      id: job.meetingId,
      manifestSha256: job.sourceManifestSha256,
      organizationId: job.organizationId,
    });
    dependencies.prepareChunks.mockImplementationOnce(({ sources }) => {
      expect(sources).toEqual([
        expect.objectContaining({
          filePath: "/tmp/meeting-76/mixed-source.media",
          track: "mixed",
        }),
      ]);
      return Promise.resolve([
        {
          contentType: "audio/webm",
          endMs: 62_000,
          filePath: "/tmp/meeting-76/mixed-000.webm",
          index: 0,
          startMs: 0,
          track: "mixed",
        },
      ]);
    });

    await runMeetingTranscriptionProcessing(job, { attempt: 1, maxAttempts: 5 }, dependencies);

    expect(dependencies.downloadSource).toHaveBeenCalledOnce();
    expect(dependencies.downloadSource).toHaveBeenCalledWith({
      filePath: "/tmp/meeting-76/mixed-source.media",
      storageKey: "playback.webm",
    });
    expect(dependencies.ensureDiskCapacity).toHaveBeenCalledWith({
      directory: "/tmp/meeting-76",
      requiredBytes: 300,
    });
    expect(dependencies.provider.transcribeFinal).toHaveBeenCalledOnce();
    expect(dependencies.provider.transcribeFinal).toHaveBeenCalledWith({
      chunks: [expect.objectContaining({ track: "mixed" })],
      languageHint: null,
      model: job.model,
      region: job.region,
    });
  });

  it("resolves the production adapter from the provider snapshot on the job", async () => {
    const baseDependencies = createDependencies();
    const deepgram = {
      transcribeFinal: vi.fn(() => Promise.resolve({ language: "zh", turns: [] })),
    };
    const dependencies = Object.assign(baseDependencies, {
      providerForJob: vi.fn(() => deepgram),
    });

    await runMeetingTranscriptionProcessing(
      { ...job, model: "nova-3", provider: "deepgram", region: "deepgram-us" },
      { attempt: 1, maxAttempts: 5 },
      dependencies,
    );

    expect(dependencies.providerForJob).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "deepgram" }),
    );
    expect(deepgram.transcribeFinal).toHaveBeenCalledTimes(2);
    expect(dependencies.provider.transcribeFinal).not.toHaveBeenCalled();
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
    expect(dependencies.requestHumanEvaluation).toHaveBeenCalledWith({
      meetingSessionId: job.meetingId,
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
    const providerError = new MeetingProviderResponseError(
      "partial-result",
      "Qwen ASR",
      "ASR_RESPONSE_HAVE_NO_WORDS",
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    dependencies.provider.transcribeFinal.mockRejectedValueOnce(providerError);

    await expect(
      runMeetingTranscriptionProcessing(job, { attempt: 1, maxAttempts: 5 }, dependencies),
    ).rejects.toBe(providerError);

    expect(dependencies.publish).not.toHaveBeenCalled();
    expect(dependencies.markFailed).toHaveBeenCalledWith({
      ...job,
      errorCode: "provider-error",
      errorMessage:
        "Qwen ASR returned an incomplete Meeting transcription result: ASR_RESPONSE_HAVE_NO_WORDS",
      processingRunId: "run-76",
      terminal: true,
    });
    expect(consoleError).toHaveBeenCalledWith(
      "[meeting-transcription-worker] processing failed",
      {
        attempt: 1,
        errorMessage:
          "Qwen ASR returned an incomplete Meeting transcription result: ASR_RESPONSE_HAVE_NO_WORDS",
        errorName: "MeetingProviderResponseError",
        meetingId: job.meetingId,
        processingRunId: "run-76",
      },
      providerError,
    );
    expect(dependencies.markChunkFailed).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
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

  it("marks a deterministic malformed provider response terminal without paying for later attempts", async () => {
    const dependencies = createDependencies();
    dependencies.provider.transcribeFinal.mockRejectedValueOnce(
      new MeetingProviderResponseError("malformed-response", "fixture"),
    );

    await expect(
      runMeetingTranscriptionProcessing(job, { attempt: 1, maxAttempts: 5 }, dependencies),
    ).rejects.toMatchObject({ code: "malformed-response" });

    expect(dependencies.markFailed).toHaveBeenCalledWith(
      expect.objectContaining({ terminal: true }),
    );
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
