/* oxlint-disable unicorn/no-useless-undefined -- Async fakes implement processor ports without artificial awaits. */
import { describe, expect, it, vi } from "vitest";
import { processMeetingIntelligenceWorkload } from "./meeting-intelligence.processor.js";
import type {
  MeetingIntelligenceClaim,
  MeetingIntelligenceProcessorPorts,
} from "./meeting-intelligence.processor.js";
import { processMeetingPlaybackWorkload } from "./meeting-playback.processor.js";
import type { MeetingPlaybackProcessorPorts } from "./meeting-playback.processor.js";
import { processMeetingPurgeWorkload } from "./meeting-purge.processor.js";
import type { MeetingPurgeProcessorPorts } from "./meeting-purge.processor.js";
import { processMeetingTranscriptionWorkload } from "./meeting-transcription.processor.js";
import type {
  MeetingTranscriptionChunkClaim,
  MeetingTranscriptionProcessorPorts,
} from "./meeting-transcription.processor.js";

describe("copied meeting workload seams", () => {
  it("keeps ready playback idempotent before claiming a new processing run", async () => {
    const markProcessing = vi.fn(async () => true);
    const ports: MeetingPlaybackProcessorPorts = {
      buildPlaybackStorageKey: vi.fn(async () => "playback-key"),
      createRunId: vi.fn(() => "run-1"),
      createWorkingDirectory: vi.fn(async () => "/tmp/unused"),
      deletePlayback: vi.fn(async () => undefined),
      downloadSource: vi.fn(async () => undefined),
      enqueueTranscription: vi.fn(async () => undefined),
      inspectOutput: vi.fn(async () => ({ sha256: "hash", sizeBytes: 1 })),
      loadSource: vi.fn(async () => ({
        assets: [],
        id: "meeting-1",
        organizationId: "organization-1",
        status: "ready",
      })),
      markFailed: vi.fn(async () => false),
      markProcessing,
      mixSources: vi.fn(async () => undefined),
      publishPlayback: vi.fn(async () => true),
      registerCleanupKey: vi.fn(async () => null),
      removeCleanupKey: vi.fn(async () => undefined),
      removeWorkingDirectory: vi.fn(async () => undefined),
      uploadPlayback: vi.fn(async () => undefined),
      verifyPlayback: vi.fn(async () => true),
    };

    await processMeetingPlaybackWorkload(
      { meetingId: "meeting-1", organizationId: "organization-1" },
      ports,
    );

    expect(markProcessing).not.toHaveBeenCalled();
  });

  it("does not run destructive purge operations when the DB lease is not claimed", async () => {
    const deleteStorageObject = vi.fn(async () => undefined);
    const ports: MeetingPurgeProcessorPorts = {
      abortMultipartUpload: vi.fn(async () => undefined),
      claim: vi.fn(async () => null),
      completeStorageBatch: vi.fn(async (): Promise<"ready"> => "ready"),
      continueProviderBatch: vi.fn(async () => true),
      deleteProviderArtifact: vi.fn(async (): Promise<"deleted"> => "deleted"),
      deleteStorageObject,
      finalize: vi.fn(async () => true),
      headStorageObject: vi.fn(async () => null),
      recordProviderOutcome: vi.fn(async () => false),
      release: vi.fn(async () => true),
    };

    await processMeetingPurgeWorkload(
      { meetingId: "meeting-1", organizationId: "organization-1" },
      ports,
    );

    expect(deleteStorageObject).not.toHaveBeenCalled();
  });

  it("does not invoke intelligence generation when another worker owns the lease", async () => {
    const generate = vi.fn();
    const ports: MeetingIntelligenceProcessorPorts = {
      claim: vi.fn(async (): Promise<MeetingIntelligenceClaim> => ({ status: "busy" })),
      createExecutionToken: vi.fn(() => "token-1"),
      generate,
      generatorSnapshot: vi.fn(() => ({ model: "model", provider: "provider" })),
      heartbeat: vi.fn(async () => true),
      loadTranscript: vi.fn(async () => null),
      markFailed: vi.fn(async () => true),
      publish: vi.fn(async () => true),
      saveCheckpoint: vi.fn(async () => true),
      saveProgress: vi.fn(async () => true),
    };

    await processMeetingIntelligenceWorkload(
      { processingRunId: "run-1" },
      { attempt: 1, maxAttempts: 3 },
      ports,
    );

    expect(generate).not.toHaveBeenCalled();
  });

  it("fails transcription explicitly when the source meeting is absent", async () => {
    const ports: MeetingTranscriptionProcessorPorts = {
      claim: vi.fn(async (): Promise<"not-current"> => "not-current"),
      claimChunk: vi.fn(
        async (): Promise<MeetingTranscriptionChunkClaim> => ({ status: "not-current" }),
      ),
      createRunId: vi.fn(() => "run-1"),
      createWorkingDirectory: vi.fn(async () => "/tmp/unused"),
      downloadSource: vi.fn(async () => undefined),
      ensureDiskCapacity: vi.fn(async () => undefined),
      loadSource: vi.fn(async () => null),
      markChunkFailed: vi.fn(async () => undefined),
      markFailed: vi.fn(async () => true),
      prepareChunks: vi.fn(async () => []),
      publish: vi.fn(async () => true),
      removeWorkingDirectory: vi.fn(async () => undefined),
      requestIntelligence: vi.fn(async () => undefined),
      saveChunkCheckpoint: vi.fn(),
      transcribeFinal: vi.fn(),
      withMediaPermit: async (_requiredBytes, task) => task(0),
    };

    await expect(
      processMeetingTranscriptionWorkload(
        {
          meetingId: "meeting-1",
          model: "model-1",
          organizationId: "organization-1",
          pipelineVersion: "final-v1",
          policyRevision: 1,
          provider: "qwen",
          region: "cn-beijing",
          sourceManifestSha256: "manifest",
        },
        { attempt: 1, maxAttempts: 3 },
        ports,
      ),
    ).rejects.toThrow("Meeting Session 不存在");
  });
});
