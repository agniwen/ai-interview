import { vi } from "vitest";
import type { MeetingTranscriptionDependencies } from "./processor";

export const job = {
  meetingId: "meeting-76",
  model: "qwen-audio-3.0-asr-flash-filetrans",
  organizationId: "org-76",
  pipelineVersion: "final-v2" as const,
  policyRevision: 1,
  provider: "qwen" as const,
  region: "qwen-cn-beijing",
  sourceManifestSha256: "a".repeat(64),
};

export function createDependencies() {
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
